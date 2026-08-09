// Resumable, chunked upload client built on the tus protocol, with an
// optional parallel ("multipart") mode for large files on high-RTT WAN
// paths.
//
// Why this exists:
//   The original implementation POSTed the whole file in a single XHR.
//   Any network blip mid-upload restarted from zero, which made multi-GB
//   uploads on slow / mobile connections nearly impossible to complete.
//
// What this gives users:
//   - 16 MB chunks: each chunk is its own short HTTP request, so a flaky
//     link only re-sends the failing chunk instead of the whole file.
//   - Automatic resume across reloads for single-stream uploads
//     (tus-js-client persists the upload URL by file fingerprint).
//   - Exponential-backoff retries on transient network errors.
//   - Pause / resume controls so users can stop on a tethered hotspot
//     and continue when they're back on wifi.
//   - Live throughput + ETA so a slow upload is at least a *visible*
//     slow upload instead of a frozen-looking progress bar.
//   - Parallel mode for large files: the file is split into N slices
//     and each slice is uploaded as its own tus stream concurrently.
//     This sidesteps single-flow TCP throughput caps imposed by RTT
//     and middlebox per-flow shaping that we hit on remote sites.
//     See server/tus.ts and the /api/uploads/finalize endpoint for the
//     server side.
//
// Public API (`uploadFile`, `cancelUpload`, `cancelAllUploads`,
// `removeUpload`, `subscribe`, `hasActiveUploads`, `getAllUploads`,
// `getUpload`, `pauseUpload`, `resumeUpload`) is preserved so existing
// callers keep working unchanged.

import { Upload as TusUpload } from "tus-js-client";
import { toast } from "@/hooks/use-toast";
import { queryClient } from "./queryClient";

export interface UploadProgress {
  id: string;
  filename: string;
  projectId: number;
  fileSize: number;
  bytesUploaded: number;
  progress: number;
  status: "queued" | "pending" | "uploading" | "paused" | "completed" | "error";
  error?: string;
  createdAt: Date;
  /** Smoothed throughput, bytes per second. */
  bytesPerSecond?: number;
  /** Estimated seconds remaining. */
  etaSeconds?: number;
}

interface SpeedTracker {
  lastBytes: number;
  lastTs: number;
  /** Exponential moving average of bytes/second to smooth out chunk bursts. */
  emaBps: number;
}

// Files smaller than this stay on the single-stream path. Below ~100 MB
// the parallelism overhead (extra connection setup, finalize roundtrip)
// would outweigh the throughput gain.
const PARALLEL_THRESHOLD_BYTES = 100 * 1024 * 1024;

// Max files transferring at once. Extra files queue and start automatically
// as slots free up — uploading many files simultaneously just splits the
// same uplink and makes every file slower (and multipart already opens up
// to 4 connections per large file).
const MAX_CONCURRENT_FILES = 2;

// Default concurrency. Each part gets its own TCP connection / congestion
// window, so combined throughput on a per-flow-shaped path is roughly
// N × single-stream rate. 4 is a safe default that makes a clear dent
// without overwhelming the upstream proxy or the user's last-mile uplink.
function envParallelCount(): number {
  const raw = (import.meta as any).env?.VITE_UPLOAD_PARALLELISM;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 2 && n <= 8) return Math.floor(n);
  return 4;
}

// Common tus retry config — used for both single and multipart parts so
// behavior under transient network errors is consistent.
const RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 30000, 60000, 60000, 120000, 120000, 300000];
function shouldRetry(err: any): boolean {
  const status = err?.originalResponse?.getStatus?.() ?? 0;
  if (status >= 400 && status < 500) {
    // 408 Request Timeout, 423 Locked, 429 Too Many Requests are textbook
    // transient. 409 Conflict from tus is "Upload-Offset conflict": the
    // prior PATCH actually landed server-side after the client gave up on
    // it (long-RTT WAN, proxy timeout, retry-while-prior-still-in-flight),
    // so the retry's Upload-Offset is now stale. tus-js-client's resume
    // path re-issues HEAD before the next PATCH and picks up the real
    // server offset, so allowing the retry self-heals the race instead of
    // failing the whole upload after a single conflict.
    return status === 408 || status === 409 || status === 423 || status === 429;
  }
  return true;
}

interface SingleSlot {
  kind: "single";
  tus: TusUpload;
}

interface MultiPart {
  tus: TusUpload;
  bytes: number;
  size: number;
  done: boolean;
  failed: boolean;
}

interface MultiSlot {
  kind: "multi";
  parts: MultiPart[];
  groupId: string;
  projectId: number;
  filename: string;
  finalizing: boolean;
  finalized: boolean;
  cancelled: boolean;
}

type Slot = SingleSlot | MultiSlot;

interface QueuedFile {
  uploadId: string;
  file: File;
  projectId: number;
  customFilename?: string;
  folderId: number | null;
}

class UploadService {
  private uploads: Map<string, UploadProgress> = new Map();
  private queue: QueuedFile[] = [];
  private slots: Map<string, Slot> = new Map();
  private speedTrackers: Map<string, SpeedTracker> = new Map();
  private listeners: Set<(uploads: UploadProgress[]) => void> = new Set();

  subscribe(callback: (uploads: UploadProgress[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.getAllUploads());
    return () => {
      this.listeners.delete(callback);
    };
  }

  getAllUploads(): UploadProgress[] {
    return Array.from(this.uploads.values());
  }

  getUpload(id: string): UploadProgress | undefined {
    return this.uploads.get(id);
  }

  hasActiveUploads(): boolean {
    return this.getAllUploads().some(
      (u) => u.status === "uploading" || u.status === "pending" || u.status === "paused" || u.status === "queued"
    );
  }

  uploadFile(file: File, projectId: number, customFilename?: string, folderId?: number | null): string {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const willQueue = this.transferringCount() >= MAX_CONCURRENT_FILES;
    const entry: UploadProgress = {
      id: uploadId,
      filename: customFilename || file.name,
      projectId,
      fileSize: file.size,
      bytesUploaded: 0,
      progress: 0,
      status: willQueue ? "queued" : "pending",
      createdAt: new Date(),
    };
    this.uploads.set(uploadId, entry);
    this.notify();

    if (willQueue) {
      this.queue.push({ uploadId, file, projectId, customFilename, folderId: folderId ?? null });
    } else {
      this.begin(uploadId, file, projectId, customFilename, folderId ?? null);
    }
    return uploadId;
  }

  /** Files actively consuming bandwidth (queued/paused/finished don't count). */
  private transferringCount(): number {
    let n = 0;
    for (const u of Array.from(this.uploads.values())) {
      if (u.status === "pending" || u.status === "uploading") n++;
    }
    return n;
  }

  private begin(uploadId: string, file: File, projectId: number, customFilename: string | undefined, folderId: number | null): void {
    if (file.size >= PARALLEL_THRESHOLD_BYTES) {
      this.startMultipart(uploadId, file, projectId, customFilename, folderId);
    } else {
      this.startSingle(uploadId, file, projectId, customFilename, folderId);
    }
  }

  /** Start queued files while there are free transfer slots. */
  private pumpQueue(): void {
    while (this.queue.length > 0 && this.transferringCount() < MAX_CONCURRENT_FILES) {
      const next = this.queue.shift()!;
      const cur = this.uploads.get(next.uploadId);
      // Skip entries cancelled/removed while they waited.
      if (!cur || cur.status !== "queued") continue;
      this.update(next.uploadId, { status: "pending" });
      this.begin(next.uploadId, next.file, next.projectId, next.customFilename, next.folderId);
    }
  }

  // -- Single-stream path -------------------------------------------------

  private startSingle(uploadId: string, file: File, projectId: number, customFilename?: string, folderId?: number | null): void {
    const metadata: Record<string, string> = {
      filename: file.name,
      filetype: file.type || "application/octet-stream",
      projectId: String(projectId),
    };
    if (customFilename && customFilename !== file.name) {
      metadata.customFilename = customFilename;
    }
    if (folderId != null) {
      metadata.folderId = String(folderId);
    }

    const tus = new TusUpload(file, {
      endpoint: "/api/uploads/tus",
      // 16 MB chunks: fewer HTTP roundtrips per file at the cost of a
      // larger re-send window if a chunk fails. Each chunk still
      // finishes well under proxy timeouts at typical broadband speeds.
      chunkSize: 16 * 1024 * 1024,
      retryDelays: RETRY_DELAYS,
      onShouldRetry: (err) => shouldRetry(err),
      removeFingerprintOnSuccess: true,
      metadata,
      onError: (err) => this.handleSingleError(uploadId, err),
      onProgress: (bytesUploaded, bytesTotal) =>
        this.handleProgress(uploadId, bytesUploaded, bytesTotal),
      onSuccess: () => this.handleSingleSuccess(uploadId, customFilename || file.name, projectId),
    });

    this.slots.set(uploadId, { kind: "single", tus });

    // Resume any prior upload of the same file. The user can pause/cancel
    // before findPreviousUploads resolves; in that case we must NOT call
    // start(), or we'd silently revive the upload they thought they'd
    // stopped.
    tus.findPreviousUploads()
      .then((previous) => {
        const cur = this.uploads.get(uploadId);
        if (!cur || cur.status === "paused" || cur.status === "error") return;
        if (previous.length > 0) {
          tus.resumeFromPreviousUpload(previous[0]);
        }
        const slot = this.slots.get(uploadId);
        if (slot && slot.kind === "single" && slot.tus === tus) {
          tus.start();
        }
      })
      .catch(() => {
        const cur = this.uploads.get(uploadId);
        if (!cur || cur.status === "paused" || cur.status === "error") return;
        const slot = this.slots.get(uploadId);
        if (slot && slot.kind === "single" && slot.tus === tus) {
          tus.start();
        }
      });
  }

  private handleSingleSuccess(uploadId: string, filename: string, projectId: number): void {
    this.update(uploadId, { status: "completed", progress: 100, etaSeconds: 0 });
    toast({
      title: "Upload successful",
      description: `${filename} has been uploaded.`,
    });
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
    this.slots.delete(uploadId);
    this.speedTrackers.delete(uploadId);
    setTimeout(() => this.removeUpload(uploadId), 4000);
  }

  private handleSingleError(uploadId: string, err: any): void {
    const cur = this.uploads.get(uploadId);
    if (!cur || cur.status === "paused" || cur.status === "completed") return;
    if (cur.status === "error" && cur.error === "Upload cancelled") return;
    const message = err?.message || "Upload failed";
    this.update(uploadId, { status: "error", error: message });
    toast({ title: "Upload failed", description: message, variant: "destructive" });
  }

  // -- Multipart (parallel) path -----------------------------------------

  private startMultipart(uploadId: string, file: File, projectId: number, customFilename?: string, folderId?: number | null): void {
    const partCount = Math.min(envParallelCount(), 8);
    const groupId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

    const parts: MultiPart[] = [];
    const slot: MultiSlot = {
      kind: "multi",
      parts,
      groupId,
      projectId,
      filename: customFilename || file.name,
      finalizing: false,
      finalized: false,
      cancelled: false,
    };
    this.slots.set(uploadId, slot);

    // Even slice split. The last slice picks up any rounding remainder.
    const partSize = Math.ceil(file.size / partCount);
    for (let i = 0; i < partCount; i++) {
      const start = i * partSize;
      const end = Math.min(file.size, start + partSize);
      const blob = file.slice(start, end);
      const sliceSize = end - start;

      const metadata: Record<string, string> = {
        filename: file.name,
        filetype: file.type || "application/octet-stream",
        projectId: String(projectId),
        partOf: groupId,
        partIndex: String(i),
        partCount: String(partCount),
        totalSize: String(file.size),
      };
      if (customFilename && customFilename !== file.name) {
        metadata.customFilename = customFilename;
      }
      if (folderId != null) {
        metadata.folderId = String(folderId);
      }

      // tus-js-client doesn't fingerprint Blob inputs by default, so
      // resume across reloads doesn't work for multipart uploads. That's
      // an acceptable trade — within-session retry per chunk still works,
      // and on a hard reload the user re-picks the file. Provide a
      // stable in-session fingerprint anyway so the localStorage URL
      // map stays usable if the SAME page calls findPreviousUploads.
      const fpBase = `${file.name}|${file.size}|${(file as any).lastModified ?? 0}|${groupId}|${i}`;

      const part: MultiPart = {
        tus: null as unknown as TusUpload,
        bytes: 0,
        size: sliceSize,
        done: false,
        failed: false,
      };
      parts.push(part);

      const tus = new TusUpload(blob as any, {
        endpoint: "/api/uploads/tus",
        chunkSize: 16 * 1024 * 1024,
        retryDelays: RETRY_DELAYS,
        onShouldRetry: (err) => shouldRetry(err),
        removeFingerprintOnSuccess: true,
        fingerprint: async () => fpBase,
        metadata,
        onError: (err) => this.handleMultiPartError(uploadId, i, err),
        onProgress: (bytesUploaded) => this.handleMultiPartProgress(uploadId, i, bytesUploaded),
        onSuccess: () => this.handleMultiPartSuccess(uploadId, i),
      });
      part.tus = tus;
      tus.start();
    }
  }

  private handleMultiPartProgress(uploadId: string, partIdx: number, bytesUploaded: number): void {
    const slot = this.slots.get(uploadId);
    if (!slot || slot.kind !== "multi") return;
    slot.parts[partIdx].bytes = Math.min(bytesUploaded, slot.parts[partIdx].size);
    const total = slot.parts.reduce((acc, p) => acc + p.bytes, 0);
    const cur = this.uploads.get(uploadId);
    if (!cur) return;
    this.handleProgress(uploadId, total, cur.fileSize);
  }

  private handleMultiPartSuccess(uploadId: string, partIdx: number): void {
    const slot = this.slots.get(uploadId);
    if (!slot || slot.kind !== "multi") return;
    const part = slot.parts[partIdx];
    part.done = true;
    part.bytes = part.size;
    // Refresh aggregate progress so the bar snaps to the exact count.
    const total = slot.parts.reduce((acc, p) => acc + p.bytes, 0);
    const cur = this.uploads.get(uploadId);
    if (cur) this.handleProgress(uploadId, total, cur.fileSize);

    // When all parts are in, ask the server to assemble them. Guard
    // against double-finalize from out-of-order onSuccess callbacks.
    if (!slot.finalizing && !slot.finalized && !slot.cancelled && slot.parts.every((p) => p.done)) {
      slot.finalizing = true;
      void this.finalizeMultipart(uploadId, slot);
    }
  }

  private handleMultiPartError(uploadId: string, partIdx: number, err: any): void {
    const slot = this.slots.get(uploadId);
    if (!slot || slot.kind !== "multi") return;
    const cur = this.uploads.get(uploadId);
    if (!cur || cur.status === "paused" || cur.status === "completed") return;
    if (cur.status === "error" && cur.error === "Upload cancelled") return;
    if (slot.cancelled || slot.finalized) return;

    slot.parts[partIdx].failed = true;
    const message = err?.message || `Upload failed on part ${partIdx + 1}`;
    // Abort sibling parts so we stop burning bandwidth on a doomed upload.
    slot.cancelled = true;
    for (let i = 0; i < slot.parts.length; i++) {
      if (i !== partIdx) {
        try { void slot.parts[i].tus.abort(true); } catch { /* ignore */ }
      }
    }
    // Best-effort server cleanup; ignore failures.
    void fetch(`/api/uploads/multipart/${slot.groupId}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});

    this.update(uploadId, { status: "error", error: message });
    toast({ title: "Upload failed", description: message, variant: "destructive" });
  }

  private async finalizeMultipart(uploadId: string, slot: MultiSlot): Promise<void> {
    try {
      const res = await fetch("/api/uploads/finalize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: slot.groupId }),
      });
      if (!res.ok) {
        let msg = "Finalize failed";
        try {
          const body = await res.json();
          if (body?.message) msg = body.message;
        } catch { /* not json */ }
        throw new Error(msg);
      }
      // The user could have cancelled while we were awaiting the
      // finalize response. In that case the server has either already
      // completed (and we're about to invalidate the cache and toast
      // success on top of their cancel) or is about to return 409 to
      // their cancel call. Either way, suppress the success UX so the
      // user's explicit action wins. Best-effort server cleanup of the
      // file is the user's responsibility via the regular file UI.
      if (slot.cancelled) return;
      slot.finalized = true;
      this.update(uploadId, { status: "completed", progress: 100, etaSeconds: 0 });
      toast({
        title: "Upload successful",
        description: `${slot.filename} has been uploaded.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${slot.projectId}/files`] });
      this.slots.delete(uploadId);
      this.speedTrackers.delete(uploadId);
      setTimeout(() => this.removeUpload(uploadId), 4000);
    } catch (err: any) {
      slot.finalizing = false;
      const cur = this.uploads.get(uploadId);
      // If the user already cancelled while we awaited, don't toast a
      // contradicting failure on top of their action.
      if (!cur || cur.status === "completed" || (cur.status === "error" && cur.error === "Upload cancelled")) return;
      const message = err?.message || "Finalize failed";
      this.update(uploadId, { status: "error", error: message });
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    }
  }

  // -- Shared progress / control ----------------------------------------

  private handleProgress(uploadId: string, bytesUploaded: number, bytesTotal: number): void {
    const pct = bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0;
    const now = Date.now();
    const t = this.speedTrackers.get(uploadId) || {
      lastBytes: bytesUploaded,
      lastTs: now,
      emaBps: 0,
    };
    const dt = (now - t.lastTs) / 1000;
    if (dt >= 0.5) {
      const inst = (bytesUploaded - t.lastBytes) / dt;
      t.emaBps = t.emaBps === 0 ? inst : t.emaBps * 0.7 + inst * 0.3;
      t.lastBytes = bytesUploaded;
      t.lastTs = now;
      this.speedTrackers.set(uploadId, t);
    }
    const remaining = Math.max(0, bytesTotal - bytesUploaded);
    const eta = t.emaBps > 0 ? Math.round(remaining / t.emaBps) : undefined;
    this.update(uploadId, {
      status: "uploading",
      progress: pct,
      bytesUploaded,
      bytesPerSecond: t.emaBps,
      etaSeconds: eta,
    });
  }

  pauseUpload(id: string): boolean {
    const slot = this.slots.get(id);
    if (!slot) return false;
    if (slot.kind === "single") {
      void slot.tus.abort(false);
    } else {
      for (const p of slot.parts) {
        if (!p.done) { try { void p.tus.abort(false); } catch { /* ignore */ } }
      }
    }
    this.update(id, { status: "paused" });
    return true;
  }

  resumeUpload(id: string): boolean {
    const slot = this.slots.get(id);
    if (!slot) return false;
    if (slot.kind === "single") {
      slot.tus.start();
    } else {
      for (const p of slot.parts) {
        if (!p.done && !p.failed) { try { p.tus.start(); } catch { /* ignore */ } }
      }
      // If every part already finished but finalize hadn't been kicked
      // off (e.g. paused right before completion), kick it now.
      if (slot.parts.every((p) => p.done) && !slot.finalizing && !slot.finalized) {
        slot.finalizing = true;
        void this.finalizeMultipart(id, slot);
      }
    }
    this.update(id, { status: "uploading", error: undefined });
    return true;
  }

  cancelUpload(id: string): boolean {
    this.queue = this.queue.filter((q) => q.uploadId !== id);
    const slot = this.slots.get(id);
    if (slot) {
      if (slot.kind === "single") {
        void slot.tus.abort(true).catch(() => {});
      } else {
        slot.cancelled = true;
        for (const p of slot.parts) {
          try { void p.tus.abort(true).catch(() => {}); } catch { /* ignore */ }
        }
        // Tell the server to drop any parts already on disk.
        void fetch(`/api/uploads/multipart/${slot.groupId}`, {
          method: "DELETE",
          credentials: "include",
        }).catch(() => {});
      }
      this.slots.delete(id);
    }
    const upload = this.uploads.get(id);
    if (upload && upload.status !== "completed") {
      this.update(id, { status: "error", error: "Upload cancelled" });
    }
    return true;
  }

  cancelAllUploads(): number {
    let count = 0;
    for (const id of Array.from(this.uploads.keys())) {
      const u = this.uploads.get(id);
      if (
        u &&
        (u.status === "uploading" ||
          u.status === "pending" ||
          u.status === "paused" ||
          u.status === "queued")
      ) {
        if (this.cancelUpload(id)) count++;
      }
    }
    return count;
  }

  removeUpload(id: string): void {
    this.cancelUpload(id);
    this.uploads.delete(id);
    this.speedTrackers.delete(id);
    this.notify();
  }

  private update(id: string, patch: Partial<UploadProgress>): void {
    const cur = this.uploads.get(id);
    if (!cur) return;
    const wasTransferring = cur.status === "pending" || cur.status === "uploading";
    this.uploads.set(id, { ...cur, ...patch });
    this.notify();
    // A transfer slot freed up (completed / error / paused) — start the next
    // queued file. Deferred so the current callback stack fully settles.
    const now = this.uploads.get(id)!.status;
    if (wasTransferring && now !== "pending" && now !== "uploading") {
      setTimeout(() => this.pumpQueue(), 0);
    }
  }

  private notify(): void {
    const all = this.getAllUploads();
    this.listeners.forEach((l) => l(all));
  }
}

export const uploadService = new UploadService();
export default uploadService;
