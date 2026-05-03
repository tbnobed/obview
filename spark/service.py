"""
Obviu Spark AI worker.

Tiny FastAPI service that runs on the DGX Spark node and is reachable from
the Obviu app over the 200Gb DAC link (192.168.100.0/24). The Obviu app
probes /health from its admin diagnostics page; future iterations will add
real inference endpoints (whisper-large transcription, CLIP embeddings,
frame captioning) that read media directly from the NFS-RDMA mount of the
app's uploads volume — no copy, no upload.

Iteration 1 (this file) is plumbing only. It exposes:

  GET  /health   - service liveness, hostname, GPU snapshot, NFS mount sanity
  GET  /info     - static service metadata
  GET  /probe?path=<relative-path-under-mount>
                 - runs ffprobe against a file in the shared NFS mount and
                   returns its metadata; proves the round-trip
                   app -> spark -> NFS-RDMA -> media works.

Bind address defaults to 192.168.100.1 (the DAC interface) so this service
is never reachable from outside the rack. Override with SPARK_BIND_HOST.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path
from typing import Any

import asyncio
import threading
import uuid
import queue as queue_mod
from collections import OrderedDict

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

SERVICE_VERSION = "0.1.0"
MOUNT_ROOT = Path(os.environ.get("OBVIU_MOUNT_ROOT", "/mnt/obview-uploads")).resolve()


def _env_int(name: str, default: int, *, minimum: int = 1, maximum: int = 3600) -> int:
    """Parse an integer env var defensively — never crash startup on bad input."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        val = int(raw)
    except ValueError:
        print(f"[obviu-spark-ai] WARN: {name}={raw!r} is not an integer, using default {default}")
        return default
    if val < minimum or val > maximum:
        print(f"[obviu-spark-ai] WARN: {name}={val} out of range [{minimum},{maximum}], clamping")
        return max(minimum, min(maximum, val))
    return val


PROBE_TIMEOUT_SEC = _env_int("OBVIU_PROBE_TIMEOUT_SEC", 30, minimum=1, maximum=600)
DEFAULT_MODEL = os.environ.get("OBVIU_WHISPER_MODEL", "large-v3-turbo")
DEFAULT_DEVICE = os.environ.get("OBVIU_WHISPER_DEVICE", "cuda")
DEFAULT_COMPUTE_TYPE = os.environ.get("OBVIU_WHISPER_COMPUTE_TYPE", "float16")
TRANSCRIPTS_SUBDIR = os.environ.get("OBVIU_TRANSCRIPTS_SUBDIR", "transcripts")

app = FastAPI(title="Obviu Spark AI Worker", version=SERVICE_VERSION)

# Whisper models are large (1-3 GB) and slow to load (10-30s); cache one
# instance per (model, device, compute_type) for the process lifetime.
_MODEL_CACHE: dict[tuple[str, str, str], Any] = {}
_MODEL_LOAD_LOCK = threading.Lock()

# True one-job-at-a-time guarantee: this lock is held by the worker thread
# for the entire duration of the compute. We deliberately use a synchronous
# threading.Lock (not asyncio.Lock) because the GPU work runs on a worker
# thread via asyncio.to_thread; if the HTTP request is cancelled or the
# client disconnects, the asyncio coroutine unwinds but the worker thread
# (and the GPU) keeps running — the lock stays held until the actual
# compute finishes, so no second job can start on the same GPU.
_JOB_LOCK = threading.Lock()
_JOB_STATE_LOCK = threading.Lock()
_CURRENT_JOB: dict[str, Any] | None = None

# Async job registry: jobId -> dict with status, request, result, timing.
# An OrderedDict gives us cheap LRU-style pruning so we can keep the most
# recent N completed jobs around for the app to poll, without growing
# memory unboundedly across days of operation.
_JOBS: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_JOBS_LOCK = threading.Lock()
_JOBS_RETAIN = _env_int("OBVIU_JOBS_RETAIN", 200, minimum=10, maximum=10000)
_JOB_QUEUE: "queue_mod.Queue[str]" = queue_mod.Queue()
_WORKER_STARTED = threading.Event()
_WORKER_START_LOCK = threading.Lock()


def _set_job(state: dict[str, Any] | None) -> None:
    global _CURRENT_JOB
    with _JOB_STATE_LOCK:
        _CURRENT_JOB = state


def _get_job() -> dict[str, Any] | None:
    with _JOB_STATE_LOCK:
        return None if _CURRENT_JOB is None else dict(_CURRENT_JOB)


def _job_snapshot(job_id: str) -> dict[str, Any] | None:
    """Public-shape snapshot of a job; None if unknown."""
    with _JOBS_LOCK:
        j = _JOBS.get(job_id)
        if j is None:
            return None
        _JOBS.move_to_end(job_id)
        return {
            "jobId": job_id,
            "status": j["status"],
            "submittedAt": j["submittedAt"],
            "startedAt": j.get("startedAt"),
            "completedAt": j.get("completedAt"),
            "request": j.get("requestPublic"),
            "result": j.get("result"),
            "error": j.get("error"),
        }


def _prune_jobs_locked() -> None:
    """Caller must hold _JOBS_LOCK. Drops oldest finished entries past the cap."""
    if len(_JOBS) <= _JOBS_RETAIN:
        return
    excess = len(_JOBS) - _JOBS_RETAIN
    for jid in list(_JOBS.keys()):
        if excess <= 0:
            break
        if _JOBS[jid]["status"] in ("completed", "failed"):
            del _JOBS[jid]
            excess -= 1


def _worker_loop() -> None:
    """Single dedicated worker thread that drains _JOB_QUEUE serially.

    Each job acquires _JOB_LOCK for the duration of its compute, preserving
    the one-job-at-a-time GPU guarantee. The legacy sync POST /transcribe
    bypasses this queue and goes directly to _do_transcribe_locked.
    """
    while True:
        job_id = _JOB_QUEUE.get()
        try:
            with _JOBS_LOCK:
                job = _JOBS.get(job_id)
                if job is None or job["status"] != "queued":
                    continue
                req = job["request"]
                target = job["target"]
                model_name = job["modelName"]
                job["status"] = "running"
                job["startedAt"] = time.time()

            try:
                # Block until the GPU lock is free. The worker is the only
                # async-path producer for the lock, but the legacy sync
                # POST /transcribe can still hold it; we wait rather than
                # failing the user's job on coexistence contention.
                result = _do_transcribe_locked(req, target, model_name, blocking=True)
                if result.get("_busy"):
                    raise RuntimeError("internal: lock contention in worker thread")
                with _JOBS_LOCK:
                    j = _JOBS.get(job_id)
                    if j is not None:
                        j["status"] = "completed"
                        j["completedAt"] = time.time()
                        j["result"] = result
                        _prune_jobs_locked()
            except HTTPException as e:
                with _JOBS_LOCK:
                    j = _JOBS.get(job_id)
                    if j is not None:
                        j["status"] = "failed"
                        j["completedAt"] = time.time()
                        j["error"] = {"status": e.status_code, "detail": e.detail}
                        _prune_jobs_locked()
            except Exception as e:  # noqa: BLE001
                with _JOBS_LOCK:
                    j = _JOBS.get(job_id)
                    if j is not None:
                        j["status"] = "failed"
                        j["completedAt"] = time.time()
                        j["error"] = {"status": 500, "detail": f"{type(e).__name__}: {e}"}
                        _prune_jobs_locked()
        finally:
            _JOB_QUEUE.task_done()


def _ensure_worker() -> None:
    """Lazily start the worker thread on first submission. Idempotent under concurrency."""
    if _WORKER_STARTED.is_set():
        return
    with _WORKER_START_LOCK:
        if _WORKER_STARTED.is_set():
            return
        t = threading.Thread(target=_worker_loop, name="spark-job-worker", daemon=True)
        t.start()
        _WORKER_STARTED.set()


def _load_whisper(name: str, device: str, compute_type: str):
    """Lazy-load a faster-whisper model and cache the instance."""
    key = (name, device, compute_type)
    cached = _MODEL_CACHE.get(key)
    if cached is not None:
        return cached
    with _MODEL_LOAD_LOCK:
        cached = _MODEL_CACHE.get(key)
        if cached is not None:
            return cached
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as e:
            raise HTTPException(
                status_code=503,
                detail=(
                    "faster-whisper is not installed. Run "
                    "`./venv/bin/pip install -r requirements.txt` on the spark."
                    f" ({e})"
                ),
            )
        try:
            model = WhisperModel(name, device=device, compute_type=compute_type)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(
                status_code=503,
                detail=(
                    f"failed to load whisper model {name!r} on device={device}, "
                    f"compute_type={compute_type}: {type(e).__name__}: {e}"
                ),
            )
        _MODEL_CACHE[key] = model
        return model


class TranscribeRequest(BaseModel):
    path: str = Field(..., description="path relative to OBVIU_MOUNT_ROOT")
    model: str | None = Field(None, description="whisper model name (default: large-v3-turbo)")
    language: str | None = Field(None, description="ISO code, e.g. 'en'; auto-detect if omitted")
    vad_filter: bool = Field(True, description="apply VAD to skip silence")
    word_timestamps: bool = Field(True, description="emit per-word timing")
    beam_size: int = Field(5, ge=1, le=10)
    save: bool = Field(True, description="persist result to <mount>/transcripts/<basename>.json")


def _run(cmd: list[str], timeout: int = 5) -> tuple[bool, str, str]:
    """Run a command, capture stdout/stderr, never raise."""
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return proc.returncode == 0, proc.stdout, proc.stderr
    except FileNotFoundError as e:
        return False, "", f"binary not found: {e}"
    except subprocess.TimeoutExpired:
        return False, "", f"timeout after {timeout}s"
    except Exception as e:  # noqa: BLE001
        return False, "", f"{type(e).__name__}: {e}"


_NVSMI_NULLS = {"", "[not supported]", "not supported", "n/a", "[n/a]", "[unknown error]"}


def _nvsmi_int(raw: str) -> int | None:
    """Parse a single nvidia-smi CSV cell as int, tolerant of '[Not Supported]'.

    Required because the DGX Spark's GB10 uses unified memory with the CPU, so
    memory.total / memory.used / utilization.gpu come back as '[Not Supported]'
    instead of integers — the original strict int() parse caused us to drop the
    whole row and report an empty device list.
    """
    s = raw.strip().lower()
    if s in _NVSMI_NULLS:
        return None
    try:
        return int(raw.strip())
    except ValueError:
        return None


def _probe_gpu() -> dict[str, Any]:
    """Snapshot of all visible NVIDIA GPUs via nvidia-smi --query-gpu."""
    fields = "index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu"
    ok, out, err = _run(
        ["nvidia-smi", f"--query-gpu={fields}", "--format=csv,noheader,nounits"],
        timeout=5,
    )
    if not ok:
        return {"ok": False, "error": err.strip() or "nvidia-smi failed"}
    devices = []
    for line in out.strip().splitlines():
        cols = [c.strip() for c in line.split(",")]
        if len(cols) < 8:
            continue
        # index/name/uuid/driver are always real strings; numeric fields may
        # be '[Not Supported]' on unified-memory parts (Grace Blackwell, Tegra).
        try:
            idx = int(cols[0])
        except ValueError:
            continue
        devices.append(
            {
                "index": idx,
                "name": cols[1],
                "uuid": cols[2],
                "driver": cols[3],
                "memoryTotalMb": _nvsmi_int(cols[4]),
                "memoryUsedMb": _nvsmi_int(cols[5]),
                "utilizationPct": _nvsmi_int(cols[6]),
                "temperatureC": _nvsmi_int(cols[7]),
                "unifiedMemory": _nvsmi_int(cols[4]) is None,
            }
        )
    return {"ok": True, "devices": devices, "count": len(devices)}


def _probe_mount() -> dict[str, Any]:
    """Confirm the NFS-RDMA mount of obtv-ai's uploads is alive and listable."""
    info: dict[str, Any] = {"path": str(MOUNT_ROOT)}
    if not MOUNT_ROOT.exists():
        info.update(ok=False, error="mount path does not exist")
        return info
    try:
        statvfs = os.statvfs(MOUNT_ROOT)
        info["totalBytes"] = statvfs.f_blocks * statvfs.f_frsize
        info["freeBytes"] = statvfs.f_bavail * statvfs.f_frsize
    except OSError as e:
        info["statvfsError"] = str(e)

    # findmnt confirms it's actually NFS over RDMA (not a stale local fallback).
    ok, out, _ = _run(
        ["findmnt", "-n", "-o", "FSTYPE,OPTIONS", "-T", str(MOUNT_ROOT), "--raw"],
        timeout=5,
    )
    if ok and out.strip():
        cols = out.strip().split(None, 1)
        info["fsType"] = cols[0] if cols else None
        info["mountOptions"] = cols[1] if len(cols) > 1 else None
        info["isRdma"] = bool(cols and len(cols) > 1 and "rdma" in cols[1].lower())
        info["isNfs"] = bool(cols and cols[0].startswith("nfs"))

    try:
        sample = sorted(p.name for p in MOUNT_ROOT.iterdir())[:5]
        info["sampleEntries"] = sample
        info["ok"] = True
    except OSError as e:
        info["ok"] = False
        info["error"] = str(e)
    return info


@app.get("/health")
def health() -> JSONResponse:
    started = time.time()
    payload = {
        "ok": True,
        "service": "obviu-spark-ai",
        "version": SERVICE_VERSION,
        "hostname": socket.gethostname(),
        "uptime": time.monotonic(),
        "gpu": _probe_gpu(),
        "mount": _probe_mount(),
        "durationMs": int((time.time() - started) * 1000),
    }
    return JSONResponse(payload)


@app.get("/info")
def info() -> dict[str, Any]:
    return {
        "service": "obviu-spark-ai",
        "version": SERVICE_VERSION,
        "mountRoot": str(MOUNT_ROOT),
        "transcriptsDir": TRANSCRIPTS_SUBDIR,
        "whisper": {
            "model": DEFAULT_MODEL,
            "device": DEFAULT_DEVICE,
            "computeType": DEFAULT_COMPUTE_TYPE,
        },
        "endpoints": {
            "GET /health": "liveness + GPU snapshot + NFS mount status",
            "GET /info": "this payload",
            "GET /probe?path=<relative-path>": "ffprobe a media file in the shared mount",
            "POST /transcribe": "SYNC transcribe (legacy; blocks until done)",
            "POST /transcribe/jobs": "ASYNC submit; returns 202 + jobId immediately",
            "GET /transcribe/jobs/{jobId}": "poll job status/result",
            "GET /transcribe/status": "current job + loaded models + defaults",
        },
    }


@app.get("/probe")
def probe(path: str = Query(..., description="path relative to OBVIU_MOUNT_ROOT")) -> JSONResponse:
    """Run ffprobe against a file in the shared NFS mount.

    Path traversal protection: the resolved absolute path must remain inside
    MOUNT_ROOT. Symlinks are resolved before the check.
    """
    if not path or path.startswith("/") or ".." in path.split("/"):
        raise HTTPException(status_code=400, detail="path must be relative and must not contain '..'")

    target = (MOUNT_ROOT / path).resolve()
    try:
        target.relative_to(MOUNT_ROOT)
    except ValueError:
        raise HTTPException(status_code=400, detail="path escapes mount root")

    if not target.exists():
        raise HTTPException(status_code=404, detail=f"file not found: {path}")
    if not target.is_file():
        raise HTTPException(status_code=400, detail=f"not a regular file: {path}")

    ok, out, err = _run(
        [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(target),
        ],
        timeout=PROBE_TIMEOUT_SEC,
    )
    if not ok:
        raise HTTPException(status_code=500, detail=f"ffprobe failed: {err.strip()}")
    try:
        meta = json.loads(out)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"ffprobe returned non-JSON: {e}")

    stat = target.stat()
    return JSONResponse({
        "ok": True,
        "path": path,
        "absPath": str(target),
        "sizeBytes": stat.st_size,
        "mtime": stat.st_mtime,
        "ffprobe": meta,
    })


def _resolve_safe(rel_path: str) -> Path:
    """Resolve a relative path under MOUNT_ROOT, rejecting traversal."""
    if not rel_path or rel_path.startswith("/") or ".." in rel_path.split("/"):
        raise HTTPException(status_code=400, detail="path must be relative and must not contain '..'")
    target = (MOUNT_ROOT / rel_path).resolve()
    try:
        target.relative_to(MOUNT_ROOT)
    except ValueError:
        raise HTTPException(status_code=400, detail="path escapes mount root")
    return target


@app.get("/transcribe/status")
def transcribe_status() -> dict[str, Any]:
    job = _get_job()
    with _JOBS_LOCK:
        queued = sum(1 for v in _JOBS.values() if v["status"] == "queued")
        running = sum(1 for v in _JOBS.values() if v["status"] == "running")
        retained = len(_JOBS)
    return {
        "busy": _JOB_LOCK.locked(),
        "job": job,
        "queue": {"queued": queued, "running": running, "retained": retained},
        "loadedModels": [
            {"model": k[0], "device": k[1], "computeType": k[2]} for k in _MODEL_CACHE.keys()
        ],
        "defaults": {
            "model": DEFAULT_MODEL,
            "device": DEFAULT_DEVICE,
            "computeType": DEFAULT_COMPUTE_TYPE,
        },
    }


@app.post("/transcribe/jobs", status_code=202)
def submit_transcribe_job(req: TranscribeRequest) -> JSONResponse:
    """Submit an async transcription job. Returns immediately with a jobId.

    Poll GET /transcribe/jobs/{jobId} for status/result. The job runs on a
    single dedicated worker thread that drains a FIFO queue, so concurrent
    submissions queue cleanly without overlapping on the GPU. This is the
    preferred endpoint for long-running transcriptions because it avoids
    holding an HTTP connection open for the duration (which is fragile
    across NAT, proxies, and idle-connection timeouts).
    """
    target = _resolve_safe(req.path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"file not found: {req.path}")

    model_name = req.model or DEFAULT_MODEL
    job_id = uuid.uuid4().hex
    submitted_at = time.time()

    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "status": "queued",
            "submittedAt": submitted_at,
            "request": req,
            "requestPublic": {
                "path": req.path,
                "model": model_name,
                "language": req.language,
                "vad_filter": req.vad_filter,
                "word_timestamps": req.word_timestamps,
                "beam_size": req.beam_size,
                "save": req.save,
            },
            "target": target,
            "modelName": model_name,
        }

    _ensure_worker()
    _JOB_QUEUE.put(job_id)

    snap = _job_snapshot(job_id) or {"jobId": job_id, "status": "queued"}
    return JSONResponse(snap, status_code=202)


@app.get("/transcribe/jobs/{job_id}")
def get_transcribe_job(job_id: str) -> dict[str, Any]:
    snap = _job_snapshot(job_id)
    if snap is None:
        raise HTTPException(status_code=404, detail=f"unknown jobId: {job_id}")
    return snap


def _do_transcribe_locked(
    req: "TranscribeRequest",
    target: Path,
    model_name: str,
    blocking: bool = False,
) -> dict[str, Any]:
    """Run one transcription end-to-end while holding _JOB_LOCK.

    By default, acquires the lock non-blocking and returns ``{"_busy": True}``
    if another job is in flight (used by the legacy sync POST /transcribe so
    callers can produce a 429). When ``blocking=True``, waits for the lock —
    used by the async worker thread so queued jobs survive coexistence with
    a legacy in-flight request instead of failing on contention. The lock
    is held for the entire duration of model load + decode + save, so
    cancellation of the HTTP request cannot cause overlapping GPU work.
    """
    if not _JOB_LOCK.acquire(blocking=blocking):
        return {"_busy": True, "current": _get_job()}
    started = time.time()
    try:
        _set_job({"path": req.path, "model": model_name, "startedAt": started, "phase": "loading_model"})

        load_start = time.time()
        model = _load_whisper(model_name, DEFAULT_DEVICE, DEFAULT_COMPUTE_TYPE)
        model_load_ms = int((time.time() - load_start) * 1000)

        _set_job({"path": req.path, "model": model_name, "startedAt": started, "phase": "transcribing"})
        transcribe_start = time.time()

        segments_iter, info = model.transcribe(
            str(target),
            language=req.language,
            vad_filter=req.vad_filter,
            word_timestamps=req.word_timestamps,
            beam_size=req.beam_size,
        )
        # faster-whisper streams segments lazily; this loop is where the
        # actual GPU decode happens.
        segs = []
        for s in segments_iter:
            seg: dict[str, Any] = {
                "id": s.id,
                "start": round(float(s.start), 3),
                "end": round(float(s.end), 3),
                "text": s.text,
                "avgLogprob": getattr(s, "avg_logprob", None),
                "noSpeechProb": getattr(s, "no_speech_prob", None),
            }
            if req.word_timestamps and getattr(s, "words", None):
                seg["words"] = [
                    {
                        "start": round(float(w.start), 3) if w.start is not None else None,
                        "end": round(float(w.end), 3) if w.end is not None else None,
                        "word": w.word,
                        "probability": getattr(w, "probability", None),
                    }
                    for w in s.words
                ]
            segs.append(seg)

        transcribe_ms = int((time.time() - transcribe_start) * 1000)

        payload: dict[str, Any] = {
            "ok": True,
            "path": req.path,
            "absPath": str(target),
            "model": model_name,
            "device": DEFAULT_DEVICE,
            "computeType": DEFAULT_COMPUTE_TYPE,
            "modelLoadMs": model_load_ms,
            "transcribeMs": transcribe_ms,
            "totalMs": int((time.time() - started) * 1000),
            "result": {
                "language": info.language,
                "languageProbability": getattr(info, "language_probability", None),
                "duration": round(float(info.duration), 3),
                "segments": segs,
                "text": "".join(s["text"] for s in segs).strip(),
            },
        }

        if req.save:
            out_dir = MOUNT_ROOT / TRANSCRIPTS_SUBDIR
            try:
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / (target.stem + ".json")
                tmp_path = out_path.with_suffix(".json.tmp")
                with tmp_path.open("w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
                os.replace(tmp_path, out_path)
                payload["savedTo"] = str(out_path.relative_to(MOUNT_ROOT))
            except OSError as e:
                payload["saveError"] = str(e)

        return payload
    finally:
        _set_job(None)
        _JOB_LOCK.release()


@app.post("/transcribe")
async def transcribe(req: TranscribeRequest) -> JSONResponse:
    """Transcribe a media file with faster-whisper.

    Reads bytes directly from the NFS-RDMA mount (no upload). The compute
    runs on a worker thread that holds _JOB_LOCK for its entire lifetime,
    so the one-job-at-a-time guarantee survives client disconnect /
    request cancellation. There is no server-side wall-clock timeout —
    very long files are expected; cap from the client if you need one.
    """
    target = _resolve_safe(req.path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"file not found: {req.path}")

    model_name = req.model or DEFAULT_MODEL

    # Fast path: peek before scheduling so the busy response is immediate.
    if _JOB_LOCK.locked():
        raise HTTPException(
            status_code=429,
            detail={"error": "spark is busy with another transcription", "current": _get_job()},
        )

    result = await asyncio.to_thread(_do_transcribe_locked, req, target, model_name)
    if result.get("_busy"):
        # Race: another request acquired the lock between our peek and the
        # thread's acquire. Surface 429 with the same shape as the fast path.
        raise HTTPException(
            status_code=429,
            detail={"error": "spark is busy with another transcription", "current": result.get("current")},
        )
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn

    bind_host = os.environ.get("SPARK_BIND_HOST", "192.168.100.1")
    bind_port = int(os.environ.get("SPARK_BIND_PORT", "7681"))
    uvicorn.run("service:app", host=bind_host, port=bind_port, log_level="info")
