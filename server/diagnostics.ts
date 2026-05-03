/**
 * Admin diagnostics: collects a structured snapshot of the host environment
 * so we can validate AI hardware (Tesla T4 NVENC on the Obviu host, NVIDIA
 * DGX Spark over the in-rack 200Gb link, NFS/RDMA mounts of `uploads/`,
 * FFmpeg codec support, etc.) before unfreezing the GPU/transcription
 * pipeline.
 *
 * Every probe is independently try/caught and returns either a result or
 * `{ ok: false, error: "..." }`. A missing tool (e.g. `nvidia-smi` not
 * installed in the Replit dev container) must NOT 500 the endpoint --
 * partial reports are the whole point of this view.
 *
 * Read-only. No shell input is taken from the request.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as fs from "fs/promises";
import * as path from "path";
import * as net from "net";
import { db } from "./db";
import { sql } from "drizzle-orm";

const pexecFile = promisify(execFile);

const PROBE_TIMEOUT_MS = 4000;

// Argv-based exec only — never interpolate values into a shell string. The
// only dynamic input here is the resolved upload-dir path (from env), but
// we still want belt-and-braces against any future caller passing user input.
async function run(
  file: string,
  args: string[] = [],
): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; error: string }> {
  try {
    const { stdout, stderr } = await pexecFile(file, args, {
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
    });
    return { ok: true, stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function bytes(n: number | undefined | null): string {
  if (n == null || !isFinite(n)) return "n/a";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
}

async function probeNode() {
  const mem = process.memoryUsage();
  return {
    version: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rss: mem.rss,
    rssHuman: bytes(mem.rss),
    heapUsed: mem.heapUsed,
    heapUsedHuman: bytes(mem.heapUsed),
  };
}

async function probeOs() {
  return {
    hostname: os.hostname(),
    type: os.type(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus()?.length ?? 0,
    cpuModel: os.cpus()?.[0]?.model ?? "unknown",
    loadavg: os.loadavg(),
    totalMem: os.totalmem(),
    totalMemHuman: bytes(os.totalmem()),
    freeMem: os.freemem(),
    freeMemHuman: bytes(os.freemem()),
    uptimeSec: Math.round(os.uptime()),
  };
}

async function probePostgres() {
  try {
    const versionRow: any = await db.execute(sql`SELECT version() AS version`);
    const version =
      versionRow?.rows?.[0]?.version ??
      versionRow?.[0]?.version ??
      "unknown";
    let dbSize: string | null = null;
    try {
      const sizeRow: any = await db.execute(
        sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
      );
      dbSize =
        sizeRow?.rows?.[0]?.size ?? sizeRow?.[0]?.size ?? null;
    } catch {
      /* ignore */
    }
    return { ok: true as const, version, dbSize };
  } catch (e: any) {
    return { ok: false as const, error: e?.message || String(e) };
  }
}

async function probeStorage() {
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  const absUploadDir = path.resolve(uploadDir);

  let exists = false;
  let entryCount: number | null = null;
  try {
    const stat = await fs.stat(absUploadDir);
    exists = stat.isDirectory();
    if (exists) {
      try {
        const entries = await fs.readdir(absUploadDir);
        entryCount = entries.length;
      } catch {
        /* ignore */
      }
    }
  } catch {
    exists = false;
  }

  // Disk free + mount info. We get sizes from Node's built-in fs.statfs (no
  // shell parsing) and the mount metadata from `findmnt -T`, which always
  // returns exactly the mount that backs the given path — even when the
  // container has dozens of unrelated bind mounts (e.g. NVIDIA Container
  // Toolkit injecting per-binary mounts under /usr/bin/nvidia-*). Parsing
  // `df -PT` previously broke here because column splitting picked up the
  // wrong data line on busy mount tables.
  let totalBytes: number | null = null;
  let freeBytes: number | null = null;
  let fsType: string | null = null;
  let mountSource: string | null = null;
  let mountPoint: string | null = null;
  let mountOptions: string | null = null;
  let isNfs = false;
  let isRdma = false;

  try {
    const statfs = await fs.statfs(absUploadDir);
    totalBytes = Number(statfs.blocks) * Number(statfs.bsize);
    freeBytes = Number(statfs.bavail) * Number(statfs.bsize);
  } catch {
    /* ignore */
  }

  // findmnt -T <path> resolves the path to its backing mount in one go.
  // -n: no header, -o: explicit columns, --raw: tab-separated single line.
  const fmRes = await run("findmnt", [
    "-n",
    "-T", absUploadDir,
    "-o", "SOURCE,TARGET,FSTYPE,OPTIONS",
    "--raw",
  ]);
  if (fmRes.ok && fmRes.stdout.trim()) {
    const cols = fmRes.stdout.trim().split(/\s+/);
    if (cols.length >= 4) {
      mountSource = cols[0];
      mountPoint = cols[1];
      fsType = cols[2];
      mountOptions = cols.slice(3).join(" ");
      if (/^nfs/i.test(fsType)) isNfs = true;
      if (mountOptions && /rdma|proto=rdma/i.test(mountOptions)) isRdma = true;
    }
  }

  return {
    uploadDir,
    absUploadDir,
    exists,
    entryCount,
    totalBytes,
    totalBytesHuman: bytes(totalBytes ?? undefined),
    freeBytes,
    freeBytesHuman: bytes(freeBytes ?? undefined),
    mountSource,
    mountPoint,
    fsType,
    mountOptions,
    isNfs,
    isRdma,
  };
}

async function probeFfmpeg() {
  const verRes = await run("ffmpeg", ["-hide_banner", "-version"]);
  if (!verRes.ok) {
    return { ok: false as const, error: verRes.error };
  }
  const versionLine = verRes.stdout.split("\n")[0]?.trim() ?? "";

  const encRes = await run("ffmpeg", ["-hide_banner", "-encoders"]);
  const encoders = encRes.ok ? encRes.stdout : "";
  const has = (name: string) =>
    new RegExp(`^\\s*[VAS]\\S*\\s+${name}\\b`, "m").test(encoders);

  const hwRes = await run("ffmpeg", ["-hide_banner", "-hwaccels"]);
  const hwaccels = hwRes.ok
    ? hwRes.stdout
        .split("\n")
        .slice(1)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    ok: true as const,
    version: versionLine,
    encoders: {
      h264_nvenc: has("h264_nvenc"),
      hevc_nvenc: has("hevc_nvenc"),
      av1_nvenc: has("av1_nvenc"),
      libx264: has("libx264"),
      libx265: has("libx265"),
    },
    hwaccels,
  };
}

interface GpuDevice {
  index: number;
  name: string;
  driver: string;
  memoryTotalMb: number | null;
  memoryUsedMb: number | null;
  utilizationPct: number | null;
  temperatureC: number | null;
}

async function probeGpus() {
  const r = await run("nvidia-smi", [
    "--query-gpu=index,name,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu",
    "--format=csv,noheader,nounits",
  ]);
  if (!r.ok) {
    return { ok: false as const, error: r.error, devices: [] as GpuDevice[] };
  }
  const devices: GpuDevice[] = [];
  for (const line of r.stdout.trim().split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(",").map((s) => s.trim());
    devices.push({
      index: parseInt(parts[0], 10),
      name: parts[1] ?? "unknown",
      driver: parts[2] ?? "unknown",
      memoryTotalMb: parts[3] ? parseInt(parts[3], 10) : null,
      memoryUsedMb: parts[4] ? parseInt(parts[4], 10) : null,
      utilizationPct: parts[5] ? parseInt(parts[5], 10) : null,
      temperatureC: parts[6] ? parseInt(parts[6], 10) : null,
    });
  }
  return { ok: true as const, devices };
}

async function tcpReachable(host: string, port: number, timeoutMs = 2000): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (ok: boolean, error?: string) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* ignore */ }
      resolve({ ok, latencyMs: ok ? Date.now() - start : null, error });
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false, "timeout"));
    sock.once("error", (err) => finish(false, err.message));
    sock.connect(port, host);
  });
}

async function probeSpark() {
  const host = process.env.SPARK_HOST;
  const portEnv = process.env.SPARK_PORT;
  const diagUrl = process.env.SPARK_DIAG_URL;

  if (!host && !diagUrl) {
    return {
      configured: false as const,
      hint:
        "Set SPARK_HOST (and optionally SPARK_PORT, default 22) on the Obviu host to probe DGX Spark reachability. Set SPARK_DIAG_URL to fetch a JSON health blob from a worker on the Spark.",
    };
  }

  // Validate the port up front so a bad SPARK_PORT can never throw out of
  // tcpReachable() and bubble through Promise.all into a 500.
  let port = 22;
  let portError: string | null = null;
  if (portEnv) {
    const parsed = Number(portEnv);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      portError = `invalid SPARK_PORT=${JSON.stringify(portEnv)} (must be integer 1-65535)`;
    } else {
      port = parsed;
    }
  }

  const result: any = { configured: true, host, port };

  if (host) {
    if (portError) {
      result.tcp = { ok: false, latencyMs: null, error: portError };
    } else {
      result.tcp = await tcpReachable(host, port);
    }
  }

  if (diagUrl) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      const res = await fetch(diagUrl, { signal: ctrl.signal });
      clearTimeout(t);
      result.http = {
        ok: res.ok,
        status: res.status,
        body: res.ok ? await res.json().catch(() => null) : null,
      };
    } catch (e: any) {
      result.http = { ok: false, error: e?.message || String(e) };
    }
  }

  return result;
}

function probeEnvFlags() {
  // Sanitised view of feature-flag / config env vars only. Never include
  // secrets, DB URLs, API keys, etc. Only booleans + non-sensitive scalars.
  const flagKeys = [
    "NODE_ENV",
    "UPLOAD_DIR",
    "VITE_DISABLE_REGISTRATION",
    "FFMPEG_QUALITY_TIMEOUT_MIN",
    "FFMPEG_SCRUB_TIMEOUT_MIN",
    "FFMPEG_SPRITE_TIMEOUT_MIN",
    "FFMPEG_METADATA_TIMEOUT_MIN",
    "SPARK_HOST",
    "SPARK_PORT",
    "SPARK_DIAG_URL",
  ];
  const flags: Record<string, string | undefined> = {};
  for (const k of flagKeys) flags[k] = process.env[k];
  // Note presence of common secret-style keys without leaking values.
  const secretsPresent: Record<string, boolean> = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    SENDGRID_API_KEY: !!process.env.SENDGRID_API_KEY,
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    SPARK_DIAG_URL: !!process.env.SPARK_DIAG_URL,
  };
  return { flags, secretsPresent };
}

export interface DiagnosticsReport {
  ok: true;
  generatedAt: string;
  durationMs: number;
  node: Awaited<ReturnType<typeof probeNode>>;
  os: Awaited<ReturnType<typeof probeOs>>;
  postgres: Awaited<ReturnType<typeof probePostgres>>;
  storage: Awaited<ReturnType<typeof probeStorage>>;
  ffmpeg: Awaited<ReturnType<typeof probeFfmpeg>>;
  gpus: Awaited<ReturnType<typeof probeGpus>>;
  spark: Awaited<ReturnType<typeof probeSpark>>;
  env: ReturnType<typeof probeEnvFlags>;
}

export async function collectDiagnostics(): Promise<DiagnosticsReport> {
  const start = Date.now();
  const [nodeI, osI, pg, storage, ffmpeg, gpus, spark] = await Promise.all([
    probeNode(),
    probeOs(),
    probePostgres(),
    probeStorage(),
    probeFfmpeg(),
    probeGpus(),
    probeSpark(),
  ]);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    node: nodeI,
    os: osI,
    postgres: pg,
    storage,
    ffmpeg,
    gpus,
    spark,
    env: probeEnvFlags(),
  };
}
