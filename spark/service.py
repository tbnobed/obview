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

SERVICE_VERSION = "0.2.0"
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

# Backend selector. faster_whisper uses the in-process WhisperModel cache
# (currently CPU-only on aarch64 because PyPI's ctranslate2 wheel ships no
# CUDA backend). whisper_cpp shells out to a CUDA-built whisper-cli binary
# for real GPU acceleration; the model is loaded per invocation but the
# decode runs on the GPU at ~10-20x realtime on GB10.
WHISPER_BACKEND = os.environ.get("OBVIU_WHISPER_BACKEND", "faster_whisper").strip().lower()
WHISPER_CPP_BIN = os.environ.get(
    "OBVIU_WHISPER_CPP_BIN", "/opt/whisper.cpp/build/bin/whisper-cli"
)
WHISPER_CPP_MODEL_PATH = os.environ.get(
    "OBVIU_WHISPER_CPP_MODEL_PATH",
    "/opt/whisper.cpp/models/ggml-large-v3-turbo.bin",
)
WHISPER_CPP_THREADS = _env_int("OBVIU_WHISPER_CPP_THREADS", 8, minimum=1, maximum=256)
WHISPER_CPP_USE_GPU = os.environ.get("OBVIU_WHISPER_CPP_USE_GPU", "1").strip().lower() not in (
    "0", "false", "no", "off",
)
WHISPER_CPP_TIMEOUT_SEC = _env_int(
    "OBVIU_WHISPER_CPP_TIMEOUT_SEC", 4 * 3600, minimum=60, maximum=24 * 3600
)
FFMPEG_BIN = os.environ.get("OBVIU_FFMPEG_BIN", "ffmpeg")
FFMPEG_TIMEOUT_SEC = _env_int(
    "OBVIU_FFMPEG_TIMEOUT_SEC", 1800, minimum=10, maximum=24 * 3600
)

# --- Speaker diarization (pyannote.audio) ---------------------------------
# Optional stage that labels each transcript segment with SPEAKER_00/01/...
# Requires `pip install -r requirements-diarization.txt` and a HuggingFace
# token that has accepted the pyannote model terms
# (https://huggingface.co/pyannote/speaker-diarization-3.1).
DIARIZATION_MODEL = os.environ.get(
    "OBVIU_DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1"
)
DIARIZATION_DEVICE = os.environ.get("OBVIU_DIARIZATION_DEVICE", DEFAULT_DEVICE)
HF_TOKEN = (
    os.environ.get("OBVIU_HF_TOKEN")
    or os.environ.get("HF_TOKEN")
    or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    or None
)

app = FastAPI(title="Obviu Spark AI Worker", version=SERVICE_VERSION)

# Whisper models are large (1-3 GB) and slow to load (10-30s); cache one
# instance per (model, device, compute_type) for the process lifetime.
_MODEL_CACHE: dict[tuple[str, str, str], Any] = {}
_MODEL_LOAD_LOCK = threading.Lock()

# Diarization pipeline is ~1GB and slow to instantiate; cache the single
# configured (model, device) instance for the process lifetime.
_DIARIZATION_CACHE: dict[tuple[str, str], Any] = {}
_DIARIZATION_LOCK = threading.Lock()


def _diarization_available() -> dict[str, Any]:
    """Static availability report for /info and fail-fast checks."""
    try:
        import pyannote.audio  # type: ignore  # noqa: F401
        installed = True
    except ImportError:
        installed = False
    return {
        "installed": installed,
        "hasHfToken": bool(HF_TOKEN),
        "model": DIARIZATION_MODEL,
        "device": DIARIZATION_DEVICE,
    }


def _load_diarization() -> tuple[Any, str]:
    """Lazy-load the pyannote diarization pipeline and cache it.

    Returns (pipeline, actual_device). actual_device is the device the
    pipeline genuinely runs on — if the CUDA transfer fails we fall back to
    CPU but must report that truthfully, not claim "cuda".
    """
    key = (DIARIZATION_MODEL, DIARIZATION_DEVICE)
    cached = _DIARIZATION_CACHE.get(key)
    if cached is not None:
        return cached
    with _DIARIZATION_LOCK:
        cached = _DIARIZATION_CACHE.get(key)
        if cached is not None:
            return cached
        try:
            from pyannote.audio import Pipeline  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "pyannote.audio is not installed. Run "
                "`./venv/bin/pip install -r requirements-diarization.txt`. "
                f"({e})"
            )
        if not HF_TOKEN:
            raise RuntimeError(
                "No HuggingFace token configured (set OBVIU_HF_TOKEN or HF_TOKEN). "
                "The pyannote diarization models are gated — create a free HF "
                "account, accept the terms for "
                f"{DIARIZATION_MODEL!r} and pyannote/segmentation-3.0, then set the token."
            )
        pipeline = Pipeline.from_pretrained(DIARIZATION_MODEL, use_auth_token=HF_TOKEN)
        if pipeline is None:
            raise RuntimeError(
                f"Pipeline.from_pretrained({DIARIZATION_MODEL!r}) returned None — "
                "usually the HF token hasn't accepted the model's gated terms."
            )
        actual_device = "cpu"
        if DIARIZATION_DEVICE.startswith("cuda"):
            try:
                import torch  # type: ignore
                if not torch.cuda.is_available():
                    raise RuntimeError("torch.cuda.is_available() is False (CPU-only torch build or no visible GPU)")
                pipeline.to(torch.device(DIARIZATION_DEVICE))
                actual_device = DIARIZATION_DEVICE
            except Exception as e:  # noqa: BLE001
                print(f"[obviu-spark-ai] WARN: could not move diarization to {DIARIZATION_DEVICE}: {e} — using CPU")
        entry = (pipeline, actual_device)
        _DIARIZATION_CACHE[key] = entry
        return entry


def _run_diarization(
    wav_path: Path,
    *,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Run diarization on a 16kHz mono WAV; return (sorted speaker turns, actual device)."""
    pipeline, actual_device = _load_diarization()
    kwargs: dict[str, Any] = {}
    if num_speakers is not None:
        kwargs["num_speakers"] = num_speakers
    else:
        if min_speakers is not None:
            kwargs["min_speakers"] = min_speakers
        if max_speakers is not None:
            kwargs["max_speakers"] = max_speakers
    annotation = pipeline(str(wav_path), **kwargs)
    turns = [
        {
            "start": round(float(turn.start), 3),
            "end": round(float(turn.end), 3),
            "speaker": str(label),
        }
        for turn, _, label in annotation.itertracks(yield_label=True)
    ]
    turns.sort(key=lambda t: t["start"])
    return turns, actual_device


def _assign_speakers(segments: list[dict[str, Any]], turns: list[dict[str, Any]]) -> list[str]:
    """Label each segment with the speaker that overlaps it most.

    Mutates segments in place (adds seg["speaker"], possibly None when no
    turn overlaps — e.g. music-only stretches). Returns the ordered list of
    distinct speakers actually used.
    """
    speakers_seen: list[str] = []
    for seg in segments:
        best_speaker: str | None = None
        best_overlap = 0.0
        for t in turns:
            overlap = min(seg["end"], t["end"]) - max(seg["start"], t["start"])
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = t["speaker"]
        seg["speaker"] = best_speaker
        if best_speaker is not None and best_speaker not in speakers_seen:
            speakers_seen.append(best_speaker)
    return speakers_seen

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
    diarize: bool = Field(False, description="run pyannote speaker diarization and label segments")
    num_speakers: int | None = Field(None, ge=1, le=32, description="exact speaker count, if known")
    min_speakers: int | None = Field(None, ge=1, le=32)
    max_speakers: int | None = Field(None, ge=1, le=32)


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
            "backend": WHISPER_BACKEND,
            "model": DEFAULT_MODEL,
            "device": DEFAULT_DEVICE,
            "computeType": DEFAULT_COMPUTE_TYPE,
            "whisperCpp": {
                "bin": WHISPER_CPP_BIN,
                "binExists": Path(WHISPER_CPP_BIN).exists(),
                "modelPath": WHISPER_CPP_MODEL_PATH,
                "modelExists": Path(WHISPER_CPP_MODEL_PATH).exists(),
                "threads": WHISPER_CPP_THREADS,
                "useGpu": WHISPER_CPP_USE_GPU,
            },
        },
        "diarization": _diarization_available(),
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
            "backend": WHISPER_BACKEND,
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
                "diarize": req.diarize,
                "num_speakers": req.num_speakers,
                "min_speakers": req.min_speakers,
                "max_speakers": req.max_speakers,
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
        if WHISPER_BACKEND == "whisper_cpp":
            payload = _do_transcribe_whispercpp(req, target, model_name, started)
        else:
            payload = _do_transcribe_faster_whisper(req, target, model_name, started)

        if req.diarize:
            _diarize_payload(req, target, payload, started)

        if req.save:
            _save_payload_to_nfs(payload, target)

        return payload
    finally:
        _set_job(None)
        _JOB_LOCK.release()


def _diarize_payload(
    req: "TranscribeRequest", target: Path, payload: dict[str, Any], started: float
) -> None:
    """Diarization stage: label payload segments with speakers.

    Runs inside _JOB_LOCK (same GPU serialization as transcription).
    Fail-soft by design: a diarization failure must not throw away a good
    transcript, so errors are reported explicitly in payload["diarization"]
    instead of failing the whole job.
    """
    import tempfile

    segs = (payload.get("result") or {}).get("segments") or []
    diar: dict[str, Any] = {
        "requested": True,
        "model": DIARIZATION_MODEL,
        "device": DIARIZATION_DEVICE,
    }
    payload["diarization"] = diar

    if not segs:
        diar.update(ok=False, error="no transcript segments to label")
        return

    _set_job({
        "path": req.path,
        "model": payload.get("model"),
        "startedAt": started,
        "phase": "diarizing",
    })
    diar_start = time.time()
    try:
        with tempfile.TemporaryDirectory(prefix="obviu-diarize-") as scratch:
            wav_path = Path(scratch) / "input.wav"
            # pyannote reads via torchaudio, which is unreliable on video
            # containers — always feed it a clean 16kHz mono WAV.
            ok, _, err = _run(
                [
                    FFMPEG_BIN, "-y",
                    "-i", str(target),
                    "-ar", "16000",
                    "-ac", "1",
                    "-c:a", "pcm_s16le",
                    str(wav_path),
                ],
                timeout=FFMPEG_TIMEOUT_SEC,
            )
            if not ok:
                raise RuntimeError(f"ffmpeg WAV extraction failed: {err.strip()[:500] or 'unknown error'}")
            turns, actual_device = _run_diarization(
                wav_path,
                num_speakers=req.num_speakers,
                min_speakers=req.min_speakers,
                max_speakers=req.max_speakers,
            )
        speakers = _assign_speakers(segs, turns)
        diar.update(
            ok=True,
            device=actual_device,
            speakers=speakers,
            speakerCount=len(speakers),
            turnCount=len(turns),
            diarizeMs=int((time.time() - diar_start) * 1000),
        )
    except Exception as e:  # noqa: BLE001
        diar.update(
            ok=False,
            error=f"{type(e).__name__}: {e}",
            diarizeMs=int((time.time() - diar_start) * 1000),
        )
        print(f"[obviu-spark-ai] diarization failed for {req.path}: {e}")


def _save_payload_to_nfs(payload: dict[str, Any], target: Path) -> None:
    """Persist a transcription result alongside its source file on the NFS mount.

    Mutates payload in-place to add either ``savedTo`` (success) or
    ``saveError`` (failure). Atomic via tmp-file + os.replace so a partial
    write is never observable.
    """
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


def _do_transcribe_faster_whisper(
    req: "TranscribeRequest", target: Path, model_name: str, started: float
) -> dict[str, Any]:
    """faster-whisper backend (in-process WhisperModel; CPU-only on aarch64 PyPI wheel)."""
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
    # actual decode happens.
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

    return {
        "ok": True,
        "path": req.path,
        "absPath": str(target),
        "backend": "faster_whisper",
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


def _do_transcribe_whispercpp(
    req: "TranscribeRequest", target: Path, model_name: str, started: float
) -> dict[str, Any]:
    """whisper.cpp backend — shells out to a CUDA-built whisper-cli for real GPU work.

    Pipeline: ffmpeg → 16kHz mono WAV → whisper-cli with --output-json-full
    → parse JSON → map into the same payload shape as the faster_whisper
    backend so the app side is backend-agnostic.

    The model is loaded per invocation (no in-process cache) — for
    large-v3-turbo that's a few seconds of mmap on top of the actual
    decode. If this becomes the bottleneck, switch to whisper-server
    (keeps the model resident) as a follow-up.
    """
    import tempfile

    if not Path(WHISPER_CPP_BIN).exists():
        raise HTTPException(
            status_code=503,
            detail=(
                f"whisper-cli binary not found at {WHISPER_CPP_BIN}. "
                "Run spark/build-whispercpp-cuda.sh on the spark or set "
                "OBVIU_WHISPER_CPP_BIN."
            ),
        )
    if not Path(WHISPER_CPP_MODEL_PATH).exists():
        raise HTTPException(
            status_code=503,
            detail=(
                f"whisper.cpp model not found at {WHISPER_CPP_MODEL_PATH}. "
                "Run the bundled download-ggml-model.sh or set "
                "OBVIU_WHISPER_CPP_MODEL_PATH."
            ),
        )

    with tempfile.TemporaryDirectory(prefix="obviu-whisper-") as scratch:
        scratch_path = Path(scratch)
        wav_path = scratch_path / "input.wav"
        out_base = scratch_path / "out"

        # Step 1: transcode to 16kHz mono PCM WAV (whisper.cpp's required input format).
        _set_job({"path": req.path, "model": model_name, "startedAt": started, "phase": "ffmpeg"})
        ff_start = time.time()
        ok, _, err = _run(
            [
                FFMPEG_BIN, "-y",
                "-i", str(target),
                "-ar", "16000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                str(wav_path),
            ],
            timeout=FFMPEG_TIMEOUT_SEC,
        )
        if not ok:
            raise HTTPException(status_code=500, detail=f"ffmpeg failed: {err.strip() or 'unknown error'}")
        ffmpeg_ms = int((time.time() - ff_start) * 1000)

        # Step 2: run whisper-cli on the GPU.
        _set_job({"path": req.path, "model": model_name, "startedAt": started, "phase": "transcribing"})
        # whisper-cli flag notes: --print-progress is a boolean TOGGLE (no
        # value); passing it would force progress output. We just omit it
        # since the default is silent. --no-gpu is also a toggle. Boolean
        # flags must never be followed by "true"/"false".
        wc_cmd = [
            WHISPER_CPP_BIN,
            "-m", WHISPER_CPP_MODEL_PATH,
            "-f", str(wav_path),
            "--output-json-full",
            "--output-file", str(out_base),
            "--threads", str(WHISPER_CPP_THREADS),
            "--language", req.language or "auto",
            "--beam-size", str(req.beam_size),
        ]
        if not WHISPER_CPP_USE_GPU:
            wc_cmd.append("--no-gpu")
        # NOTE: do NOT pass `--max-len 1` here. That flag forces
        # one-token-per-segment, which makes the UI render every word as
        # its own row. `--output-json-full` already emits per-token
        # offsets inside each segment's `tokens[]` array, which we map
        # into seg["words"] below — so word-level timing is preserved
        # while segments stay at natural phrase boundaries.

        wc_start = time.time()
        ok, stdout, stderr = _run(wc_cmd, timeout=WHISPER_CPP_TIMEOUT_SEC)
        if not ok:
            raise HTTPException(
                status_code=500,
                detail=f"whisper-cli failed: {(stderr or stdout).strip() or 'unknown error'}",
            )
        transcribe_ms = int((time.time() - wc_start) * 1000)

        # Step 3: parse the JSON the CLI dumped next to out_base.
        json_path = Path(str(out_base) + ".json")
        if not json_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"whisper-cli produced no JSON at {json_path} (stderr: {stderr.strip()[:500]})",
            )
        try:
            with json_path.open("r", encoding="utf-8") as f:
                wc_json = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            raise HTTPException(status_code=500, detail=f"failed to parse whisper-cli JSON: {e}")

    # Map whisper.cpp's JSON shape into the faster_whisper-style payload.
    language = (wc_json.get("result") or {}).get("language")
    transcription = wc_json.get("transcription") or []

    # Sanity check: a real run produces at least one segment unless the
    # source is genuinely silent. An empty result for a non-trivial input
    # almost always means a flag/parse drift in whisper-cli — fail loud
    # so we don't silently store empty transcripts.
    if not transcription:
        # Allow the empty case only if the file is < 1 second (truly tiny
        # / silent test inputs).
        try:
            file_seconds = target.stat().st_size / (16000 * 2)  # rough lower bound
        except OSError:
            file_seconds = 0
        if file_seconds > 1.0:
            raise HTTPException(
                status_code=500,
                detail=(
                    "whisper-cli produced an empty transcription for a non-trivial "
                    "input — likely a CLI flag drift. stderr: "
                    f"{(stderr or '')[:500]}"
                ),
            )
    segs: list[dict[str, Any]] = []
    duration_s = 0.0

    for i, t in enumerate(transcription):
        offsets = t.get("offsets") or {}
        start_s = (offsets.get("from") or 0) / 1000.0
        end_s = (offsets.get("to") or 0) / 1000.0
        duration_s = max(duration_s, end_s)
        seg: dict[str, Any] = {
            "id": i,
            "start": round(start_s, 3),
            "end": round(end_s, 3),
            "text": t.get("text", ""),
            "avgLogprob": None,
            "noSpeechProb": None,
        }
        if req.word_timestamps:
            words = []
            for tok in t.get("tokens") or []:
                tok_text = tok.get("text", "")
                # Filter whisper.cpp's special tokens (e.g. "[_BEG_]", "[_TT_]").
                if not tok_text or tok_text.startswith("[_"):
                    continue
                tok_off = tok.get("offsets") or {}
                words.append({
                    "start": round((tok_off.get("from") or 0) / 1000.0, 3),
                    "end": round((tok_off.get("to") or 0) / 1000.0, 3),
                    "word": tok_text,
                    "probability": tok.get("p"),
                })
            if words:
                seg["words"] = words
        segs.append(seg)

    full_text = "".join(s["text"] for s in segs).strip()

    # Report the actual model file in use, not just whatever the request
    # asked for — whisper.cpp ignores `model_name` and decodes with whatever
    # binary file is at WHISPER_CPP_MODEL_PATH. Diagnostics need the truth.
    actual_model = Path(WHISPER_CPP_MODEL_PATH).stem
    if actual_model.startswith("ggml-"):
        actual_model = actual_model[len("ggml-"):]

    return {
        "ok": True,
        "path": req.path,
        "absPath": str(target),
        "backend": "whisper_cpp",
        "model": actual_model,
        "requestedModel": model_name,
        "device": "cuda" if WHISPER_CPP_USE_GPU else "cpu",
        "computeType": "whisper.cpp/ggml",
        "modelLoadMs": 0,  # bundled into transcribeMs by the CLI
        "ffmpegMs": ffmpeg_ms,
        "transcribeMs": transcribe_ms,
        "totalMs": int((time.time() - started) * 1000),
        "result": {
            "language": language,
            "languageProbability": None,
            "duration": round(duration_s, 3),
            "segments": segs,
            "text": full_text,
        },
    }


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
