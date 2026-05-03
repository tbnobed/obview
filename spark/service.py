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

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

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

app = FastAPI(title="Obviu Spark AI Worker", version=SERVICE_VERSION)


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
        "endpoints": {
            "GET /health": "liveness + GPU snapshot + NFS mount status",
            "GET /info": "this payload",
            "GET /probe?path=<relative-path>": "ffprobe a media file in the shared mount",
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


if __name__ == "__main__":
    import uvicorn

    bind_host = os.environ.get("SPARK_BIND_HOST", "192.168.100.1")
    bind_port = int(os.environ.get("SPARK_BIND_PORT", "7681"))
    uvicorn.run("service:app", host=bind_host, port=bind_port, log_level="info")
