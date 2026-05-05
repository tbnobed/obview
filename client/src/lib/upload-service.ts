// Resumable, chunked upload client built on the tus protocol.
//
// Why this exists:
//   The previous implementation POSTed the whole file in a single XHR.
//   Any network blip mid-upload restarted from zero, which made multi-GB
//   uploads on slow / mobile connections nearly impossible to complete.
//
// What this gives users:
//   - 8 MB chunks: each chunk is its own short HTTP request, so a flaky
//     link only re-sends the failing chunk instead of the whole file.
//   - Automatic resume across reloads (tus-js-client persists the upload
//     URL by file fingerprint in localStorage).
//   - Exponential-backoff retries on transient network errors.
//   - Pause / resume controls so users can stop on a tethered hotspot
//     and continue when they're back on wifi.
//   - Live throughput + ETA so a slow upload is at least a *visible* slow
//     upload instead of a frozen-looking progress bar.
//
// Public API (`uploadFile`, `cancelUpload`, `cancelAllUploads`,
// `removeUpload`, `subscribe`, `hasActiveUploads`, `getAllUploads`,
// `getUpload`) is preserved so existing callers keep working unchanged.

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
  status: "pending" | "uploading" | "paused" | "completed" | "error";
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

class UploadService {
  private uploads: Map<string, UploadProgress> = new Map();
  private tusInstances: Map<string, TusUpload> = new Map();
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
      (u) => u.status === "uploading" || u.status === "pending" || u.status === "paused"
    );
  }

  uploadFile(file: File, projectId: number, customFilename?: string): string {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const entry: UploadProgress = {
      id: uploadId,
      filename: customFilename || file.name,
      projectId,
      fileSize: file.size,
      bytesUploaded: 0,
      progress: 0,
      status: "pending",
      createdAt: new Date(),
    };
    this.uploads.set(uploadId, entry);
    this.notify();

    const metadata: Record<string, string> = {
      filename: file.name,
      filetype: file.type || "application/octet-stream",
      projectId: String(projectId),
    };
    if (customFilename && customFilename !== file.name) {
      metadata.customFilename = customFilename;
    }

    const tus = new TusUpload(file, {
      endpoint: "/api/uploads/tus",
      // 16 MB chunks. Larger chunks = fewer HTTP roundtrips per file
      // (a 7 GB file becomes ~470 PATCHes instead of ~1800), which is
      // the dominant overhead on a fast link. Each PATCH still finishes
      // well under proxy request timeouts at typical broadband speeds.
      chunkSize: 16 * 1024 * 1024,
      // Upload 4 chunks in parallel to saturate the link instead of
      // serializing one PATCH at a time. Uses the tus Concatenation
      // extension (supported by @tus/server's FileStore): the file is
      // split into N partial uploads streamed concurrently, then the
      // server concatenates them on completion. On a 64 Mbps link this
      // is the difference between ~16 min and ~4 min for a 7 GB file.
      parallelUploads: 4,
      // Aggressive retry schedule. Total delay before giving up is
      // ~10 minutes, which lets us ride out long upstream stalls
      // (proxy reconnects, DNS blips, transient 502s from a restarting
      // container) without forcing the user to start over on a multi-GB
      // upload. tus-js-client retries with the same offset, so any
      // accepted bytes are not re-uploaded.
      retryDelays: [
        0, 1000, 3000, 5000, 10000, 30000, 60000, 60000, 120000, 120000, 300000,
      ],
      // Retry on every transient failure we'd realistically see in
      // front of nginx/Cloudflare. Default tus only retries on a handful
      // of statuses; we widen it to anything that isn't a clear
      // permanent client error.
      onShouldRetry: (err: any, _retryAttempt, _options) => {
        const status = err?.originalResponse?.getStatus?.() ?? 0;
        // Permanent client errors → don't retry (4xx except 408/423/429).
        if (status >= 400 && status < 500) {
          return status === 408 || status === 423 || status === 429;
        }
        // Network errors (status 0) and 5xx → always retry.
        return true;
      },
      removeFingerprintOnSuccess: true,
      metadata,
      onError: (err) => {
        // tus-js-client only fires onError after exhausting retryDelays,
        // so by the time we get here it really is a fatal error.
        // Skip if the user paused or already cancelled — otherwise we
        // double-toast a "failed" message on top of their explicit action.
        const cur = this.uploads.get(uploadId);
        if (!cur || cur.status === "paused" || cur.status === "completed") return;
        if (cur.status === "error" && cur.error === "Upload cancelled") return;
        const message = err?.message || "Upload failed";
        this.update(uploadId, { status: "error", error: message });
        toast({
          title: "Upload failed",
          description: message,
          variant: "destructive",
        });
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0;
        const now = Date.now();
        const t = this.speedTrackers.get(uploadId) || {
          lastBytes: bytesUploaded,
          lastTs: now,
          emaBps: 0,
        };
        const dt = (now - t.lastTs) / 1000;
        // Update the EMA at most every ~500ms to keep the displayed speed
        // legible (otherwise it bounces wildly each progress event).
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
      },
      onSuccess: () => {
        this.update(uploadId, { status: "completed", progress: 100, etaSeconds: 0 });
        toast({
          title: "Upload successful",
          description: `${entry.filename} has been uploaded.`,
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/projects/${projectId}/files`],
        });
        this.tusInstances.delete(uploadId);
        this.speedTrackers.delete(uploadId);
        // Auto-clear completed uploads after a short delay so the panel
        // doesn't accumulate stale entries.
        setTimeout(() => this.removeUpload(uploadId), 4000);
      },
    });

    this.tusInstances.set(uploadId, tus);

    // Resume any prior upload of the same file (tus-js-client matches by
    // file fingerprint in localStorage). If none, just start fresh.
    // The user can pause/cancel before findPreviousUploads resolves; in
    // that case we must NOT call start(), or we'd silently revive the
    // upload they thought they'd stopped.
    tus.findPreviousUploads()
      .then((previous) => {
        const cur = this.uploads.get(uploadId);
        if (!cur || cur.status === "paused" || cur.status === "error") return;
        if (previous.length > 0) {
          tus.resumeFromPreviousUpload(previous[0]);
        }
        if (this.tusInstances.get(uploadId) === tus) {
          tus.start();
        }
      })
      .catch(() => {
        const cur = this.uploads.get(uploadId);
        if (!cur || cur.status === "paused" || cur.status === "error") return;
        if (this.tusInstances.get(uploadId) === tus) {
          tus.start();
        }
      });

    return uploadId;
  }

  pauseUpload(id: string): boolean {
    const tus = this.tusInstances.get(id);
    if (!tus) return false;
    // abort(false) keeps the server-side upload URL so we can resume later.
    void tus.abort(false);
    this.update(id, { status: "paused" });
    return true;
  }

  resumeUpload(id: string): boolean {
    const tus = this.tusInstances.get(id);
    if (!tus) return false;
    tus.start();
    this.update(id, { status: "uploading", error: undefined });
    return true;
  }

  cancelUpload(id: string): boolean {
    const tus = this.tusInstances.get(id);
    if (tus) {
      // shouldTerminate=true asks the server to drop the partial blob too.
      void tus.abort(true).catch(() => {});
      this.tusInstances.delete(id);
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
          u.status === "paused")
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
    this.uploads.set(id, { ...cur, ...patch });
    this.notify();
  }

  private notify(): void {
    const all = this.getAllUploads();
    this.listeners.forEach((l) => l(all));
  }
}

export const uploadService = new UploadService();
export default uploadService;
