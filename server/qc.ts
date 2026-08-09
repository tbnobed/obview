/**
 * QC report pipeline. Three detectors feed one findings list per file:
 *
 *  1. Frame analysis (local ffmpeg): blackdetect + freezedetect over the
 *     original upload. Black segments flag flash frames / gaps; freezes are
 *     the visible symptom of dropped frames.
 *  2. Audio events (GPU worker, PANNs): coughs, throat clears, sneezes…
 *     arrives as part of the transcription job payload.
 *  3. On-screen text spell check: OCR blocks from the worker (easyocr) are
 *     reviewed by the LLM for typos/misspellings, cross-checked against the
 *     transcript for proper-noun mismatches.
 *
 * Every detector is fail-soft and reports its own status in
 * qc_reports.detectors so one failure never hides the other findings.
 */
import { spawn } from "child_process";
import * as fs from "fs";
import { storage } from "./storage";
import type { QcFinding } from "@shared/schema";
import type { WorkerAudioEventsInfo, WorkerOcrInfo } from "./ai-worker-client";

const QC_ENABLED = (process.env.QC_ENABLED || "true").toLowerCase() !== "false";
// Min black duration (s) worth reporting; sub-frame blips at cuts are normal.
const BLACK_MIN_DURATION = parseFloat(process.env.QC_BLACK_MIN_DURATION || "0.1");
const FREEZE_MIN_DURATION = parseFloat(process.env.QC_FREEZE_MIN_DURATION || "2");
// Shot/cut analysis: flash frames are shots of <= QC_FLASH_MAX_FRAMES frames;
// anything shorter than QC_SHOT_MIN_DURATION seconds is flagged as a short shot.
const SCENE_THRESHOLD = parseFloat(process.env.QC_SCENE_THRESHOLD || "0.3");
const FLASH_MAX_FRAMES = parseInt(process.env.QC_FLASH_MAX_FRAMES || "4", 10);
const SHOT_MIN_DURATION = parseFloat(process.env.QC_SHOT_MIN_DURATION || "2");
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;

interface WorkerQcPayload {
  audioEvents: WorkerAudioEventsInfo | null;
  ocr: WorkerOcrInfo | null;
}

type DetectorStatus = Record<string, { status: string; error?: string | null }>;

// ---------------------------------------------------------------------------
// Detector 1: black / frozen frames (local ffmpeg)
// ---------------------------------------------------------------------------

function runFfmpegAnalysis(filePath: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const vf =
      `blackdetect=d=${BLACK_MIN_DURATION}:pix_th=0.10,` +
      `freezedetect=n=-60dB:d=${FREEZE_MIN_DURATION},` +
      // freezedetect only sets frame metadata — print it to stdout.
      `metadata=mode=print:key=lavfi.freezedetect.freeze_start:file=-,` +
      `metadata=mode=print:key=lavfi.freezedetect.freeze_end:file=-`;
    const args = ["-hide_banner", "-nostats", "-i", filePath, "-vf", vf, "-an", "-f", "null", "-"];
    const proc = spawn("ffmpeg", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`ffmpeg QC analysis timed out after ${FFMPEG_TIMEOUT_MS}ms`));
    }, FFMPEG_TIMEOUT_MS);
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffmpeg QC analysis exited ${code}: ${stderr.slice(-500)}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export function parseFrameFindings(stdout: string, stderr: string): QcFinding[] {
  const findings: QcFinding[] = [];

  // blackdetect logs to stderr:
  //   [blackdetect @ 0x...] black_start:12.3 black_end:12.9 black_duration:0.6
  const blackRe = /black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = blackRe.exec(stderr)) !== null) {
    const start = parseFloat(m[1]);
    const end = parseFloat(m[2]);
    const dur = parseFloat(m[3]);
    findings.push({
      type: "black_frame",
      severity: dur >= 1 ? "error" : "warning",
      start,
      end,
      detail: `Black video for ${dur.toFixed(2)}s`,
    });
  }

  // freezedetect metadata printed to stdout as key=value lines:
  //   lavfi.freezedetect.freeze_start=5.005
  //   lavfi.freezedetect.freeze_end=9.343
  const starts: number[] = [];
  const ends: number[] = [];
  for (const line of stdout.split("\n")) {
    const s = line.match(/lavfi\.freezedetect\.freeze_start=([\d.]+)/);
    if (s) starts.push(parseFloat(s[1]));
    const e = line.match(/lavfi\.freezedetect\.freeze_end=([\d.]+)/);
    if (e) ends.push(parseFloat(e[1]));
  }
  starts.forEach((start, i) => {
    const end = ends[i] ?? null;
    const durTxt = end != null ? `${(end - start).toFixed(2)}s` : "until end of file";
    findings.push({
      type: "freeze_frame",
      severity: "warning",
      start,
      end,
      detail: `Frozen/repeated frames for ${durTxt} (possible dropped frames)`,
    });
  });

  return findings;
}

// ---------------------------------------------------------------------------
// Detector 1b: shot analysis — flash frames & short shots (local ffmpeg)
// ---------------------------------------------------------------------------

/** fps + duration via ffprobe; fps parsed from "30000/1001"-style rate. */
function probeVideoStats(filePath: string): Promise<{ fps: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=avg_frame_rate,r_frame_rate:format=duration",
      "-of", "json", filePath,
    ];
    const proc = spawn("ffprobe", args);
    let out = ""; let err = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err.slice(-300)}`));
      try {
        const j = JSON.parse(out);
        const rate: string = j?.streams?.[0]?.avg_frame_rate && j.streams[0].avg_frame_rate !== "0/0"
          ? j.streams[0].avg_frame_rate
          : j?.streams?.[0]?.r_frame_rate || "0/1";
        const [num, den] = rate.split("/").map(Number);
        const fps = den > 0 ? num / den : 0;
        const duration = parseFloat(j?.format?.duration || "0");
        if (!fps || !duration) return reject(new Error(`ffprobe returned fps=${fps} duration=${duration}`));
        resolve({ fps, duration });
      } catch (e) { reject(e as Error); }
    });
  });
}

/** Scene-cut timestamps (s) via ffmpeg scene-score select. */
function detectSceneCuts(filePath: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const vf = `select='gt(scene,${SCENE_THRESHOLD})',metadata=mode=print:key=lavfi.scene_score:file=-`;
    const args = ["-hide_banner", "-nostats", "-i", filePath, "-vf", vf, "-an", "-f", "null", "-"];
    const proc = spawn("ffmpeg", args);
    let stdout = ""; let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`ffmpeg scene detection timed out after ${FFMPEG_TIMEOUT_MS}ms`));
    }, FFMPEG_TIMEOUT_MS);
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg scene detection exited ${code}: ${stderr.slice(-500)}`));
      // metadata=print emits "frame:12  pts:6006  pts_time:6.006" lines for selected frames.
      const cuts: number[] = [];
      const re = /pts_time:([\d.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stdout)) !== null) cuts.push(parseFloat(m[1]));
      resolve(cuts);
    });
  });
}

/** Turn cut timestamps into flash-frame / short-shot findings. Exported for tests. */
export function computeShotFindings(cuts: number[], fps: number, duration: number): QcFinding[] {
  const findings: QcFinding[] = [];
  if (!fps || !duration) return findings;
  const boundaries = [0, ...cuts.filter((t) => t > 0 && t < duration).sort((a, b) => a - b), duration];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const len = end - start;
    if (len <= 0) continue;
    const frames = Math.max(1, Math.round(len * fps));
    if (frames <= FLASH_MAX_FRAMES) {
      findings.push({
        type: "flash_frame",
        severity: "error",
        start,
        end,
        detail: `Flash frame: ${frames} frame${frames === 1 ? "" : "s"} (${(len * 1000).toFixed(0)}ms) between cuts`,
      });
    } else if (len < SHOT_MIN_DURATION) {
      findings.push({
        type: "short_shot",
        severity: "warning",
        start,
        end,
        detail: `Short shot: ${len.toFixed(2)}s (minimum ${SHOT_MIN_DURATION}s)`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Detector 3: OCR spell check (LLM over worker OCR blocks)
// ---------------------------------------------------------------------------

function buildSpellPrompt(
  blocks: Array<{ time: number; text: string }>,
  transcriptText: string | null,
): string {
  const ocrLines = blocks
    .map((b) => `[t=${Math.round(b.time)}s] ${b.text}`)
    .join("\n")
    .slice(0, 12000);
  const transcript = (transcriptText || "").slice(0, 6000);
  return [
    "You are a broadcast QC reviewer. Below is text captured by OCR from on-screen",
    "graphics (lower thirds, title cards) in a video, with timestamps.",
    "Identify ONLY genuine problems a viewer would notice:",
    "- misspelled English words (ignore stylized ALL-CAPS, abbreviations, URLs, channel bugs)",
    "- names/titles spelled inconsistently between the graphics and the spoken transcript",
    "OCR itself is imperfect: single-character garbage, cut-off words at screen edges,",
    "and gibberish fragments are OCR noise — do NOT report them.",
    "",
    "Respond with STRICT JSON only, no prose: an array of objects",
    '[{"time": <seconds>, "text": "<the on-screen text>", "issue": "<short explanation>"}]',
    "Return [] if there are no genuine problems.",
    "",
    "On-screen text:",
    ocrLines,
    "",
    "Spoken transcript (for cross-checking names):",
    transcript || "(no transcript available)",
  ].join("\n");
}

function parseSpellResponse(raw: string): Array<{ time: number; text: string; issue: string }> {
  // The model may wrap JSON in code fences or prose — extract the first array.
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === "object" && typeof x.issue === "string")
      .map((x) => ({
        time: typeof x.time === "number" ? x.time : 0,
        text: typeof x.text === "string" ? x.text : "",
        issue: x.issue,
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function runQcJob(fileId: number, worker: WorkerQcPayload | null): Promise<void> {
  const file = await storage.getFile(fileId);
  if (!file) {
    console.log(`[QC] Skipping file ${fileId}: not found`);
    return;
  }

  let report = await storage.getQcReport(fileId);
  if (!report) {
    try {
      report = await storage.createQcReport({ fileId, status: "processing" } as any);
    } catch (e: any) {
      // UNIQUE(file_id) — a concurrent run created the row first; reuse it.
      report = await storage.getQcReport(fileId);
      if (!report) throw e;
    }
  } else {
    await storage.updateQcReport(report.id, { status: "processing", errorMessage: null } as any);
  }

  const findings: QcFinding[] = [];
  const detectors: DetectorStatus = {};

  // --- 1. Frames (local ffmpeg over the original upload) ---
  if (file.fileType === "video" && file.filePath && fs.existsSync(file.filePath)) {
    try {
      const t0 = Date.now();
      const { stdout, stderr } = await runFfmpegAnalysis(file.filePath);
      const frameFindings = parseFrameFindings(stdout, stderr);
      findings.push(...frameFindings);
      detectors.frames = { status: "completed" };
      console.log(
        `[QC] File ${fileId}: frame analysis found ${frameFindings.length} finding(s) in ${Date.now() - t0}ms`
      );
    } catch (e: any) {
      detectors.frames = { status: "failed", error: e?.message || String(e) };
      console.warn(`[QC] File ${fileId}: frame analysis failed — ${e?.message}`);
    }
    // Shot analysis (flash frames / short shots) — separate status so a
    // scene-detection failure never hides black/freeze findings.
    try {
      const t0 = Date.now();
      const [{ fps, duration }, cuts] = await Promise.all([
        probeVideoStats(file.filePath),
        detectSceneCuts(file.filePath),
      ]);
      const shotFindings = computeShotFindings(cuts, fps, duration);
      findings.push(...shotFindings);
      detectors.shots = { status: "completed" };
      console.log(
        `[QC] File ${fileId}: shot analysis found ${shotFindings.length} finding(s) across ${cuts.length + 1} shot(s) in ${Date.now() - t0}ms`
      );
    } catch (e: any) {
      detectors.shots = { status: "failed", error: e?.message || String(e) };
      console.warn(`[QC] File ${fileId}: shot analysis failed — ${e?.message}`);
    }
  } else {
    const skip = {
      status: "skipped",
      error: file.fileType !== "video" ? "not a video" : "source file not on disk",
    };
    detectors.frames = skip;
    detectors.shots = skip;
  }

  // --- 2. Audio events (from the worker payload) ---
  // On manual regenerate we have no fresh worker payload; keep the previous
  // audio findings rather than silently dropping them.
  const prevFindings: QcFinding[] = Array.isArray(report.findings) ? report.findings : [];
  if (worker?.audioEvents) {
    const ae = worker.audioEvents;
    if (ae.ok && Array.isArray(ae.events)) {
      for (const ev of ae.events) {
        findings.push({
          type: "audio_event",
          severity: "info",
          start: ev.start,
          end: ev.end,
          detail: `${prettyAudioLabel(ev.label)} detected`,
          confidence: ev.confidence,
        });
      }
      detectors.audioEvents = { status: "completed" };
    } else {
      detectors.audioEvents = { status: "failed", error: ae.error || "worker reported failure" };
    }
  } else {
    const kept = prevFindings.filter((f) => f.type === "audio_event");
    findings.push(...kept);
    detectors.audioEvents = {
      status: kept.length > 0 ? "completed" : "skipped",
      error: kept.length > 0 ? null : "no worker audio-event data (runs with transcription)",
    };
  }

  // --- 3. OCR spell check (worker OCR blocks + local LLM) ---
  let ocrBlocks = worker?.ocr?.ok && Array.isArray(worker.ocr.blocks) ? worker.ocr.blocks : null;
  if (!ocrBlocks && Array.isArray(report.ocrBlocks) && report.ocrBlocks.length > 0) {
    ocrBlocks = report.ocrBlocks; // regenerate path: reuse stored OCR
  }
  if (worker?.ocr && !worker.ocr.ok && !ocrBlocks) {
    detectors.ocr = { status: "failed", error: worker.ocr.error || "worker OCR failed" };
  } else if (!ocrBlocks || ocrBlocks.length === 0) {
    detectors.ocr = { status: "skipped", error: "no on-screen text captured" };
  } else {
    try {
      const { prompt } = await import("./llm-client");
      const transcript = await storage.getTranscript(fileId);
      const raw = await prompt(
        buildSpellPrompt(ocrBlocks, transcript?.text ?? null),
        { maxTokens: 1024, temperature: 0.1 },
        `QC spell check for file ${fileId}`
      );
      const issues = parseSpellResponse(raw);
      for (const iss of issues) {
        findings.push({
          type: "ocr_spelling",
          severity: "warning",
          start: iss.time,
          detail: iss.text ? `"${iss.text}" — ${iss.issue}` : iss.issue,
        });
      }
      detectors.ocr = { status: "completed" };
      console.log(`[QC] File ${fileId}: spell check flagged ${issues.length} issue(s) from ${ocrBlocks.length} OCR block(s)`);
    } catch (e: any) {
      detectors.ocr = { status: "failed", error: e?.message || String(e) };
      console.warn(`[QC] File ${fileId}: OCR spell check failed — ${e?.message}`);
    }
  }

  findings.sort((a, b) => a.start - b.start);

  const anyCompleted = Object.values(detectors).some((d) => d.status === "completed");
  await storage.updateQcReport(report.id, {
    status: anyCompleted ? "completed" : "failed",
    findings,
    detectors,
    ocrBlocks: ocrBlocks ?? (report.ocrBlocks as any) ?? null,
    errorMessage: anyCompleted
      ? null
      : Object.entries(detectors).map(([k, v]) => `${k}: ${v.error || v.status}`).join("; "),
    processedAt: new Date(),
  } as any);
  console.log(`[QC] File ${fileId}: report saved with ${findings.length} finding(s)`);
}

function prettyAudioLabel(label: string): string {
  const map: Record<string, string> = {
    cough: "Cough",
    throat_clear: "Throat clearing",
    sneeze: "Sneeze",
    sniff: "Sniff",
    hiccup: "Hiccup",
    burp: "Burp",
    gasp: "Gasp",
  };
  return map[label] || label;
}

/**
 * Run QC for a file. `worker` carries the audio-event/OCR payloads from the
 * transcription job when triggered automatically; null on manual regenerate
 * (frames re-run locally, stored OCR is re-checked, audio findings are kept).
 */
const inFlight = new Set<number>();

export async function runQcForFile(fileId: number, worker: WorkerQcPayload | null): Promise<void> {
  if (!QC_ENABLED) {
    console.log(`[QC] Disabled — skipping file ${fileId}`);
    return;
  }
  // Single-flight per file: a manual regenerate racing the auto-trigger
  // must not run two analyses that overwrite each other's findings.
  if (inFlight.has(fileId)) {
    console.log(`[QC] File ${fileId}: analysis already in flight — skipping duplicate run`);
    return;
  }
  inFlight.add(fileId);
  try {
    await runQcJob(fileId, worker);
  } catch (err: any) {
    console.error(`[QC] Failed for file ${fileId}:`, err);
    const report = await storage.getQcReport(fileId).catch(() => undefined);
    if (report) {
      await storage
        .updateQcReport(report.id, {
          status: "failed",
          errorMessage: err?.message || "Unknown QC error",
        } as any)
        .catch(() => {});
    }
  } finally {
    inFlight.delete(fileId);
  }
}
