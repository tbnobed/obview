# Obviu Spark AI Worker

A small FastAPI service that runs on the DGX Spark node and is reachable
from the Obviu app over the 200Gb DAC link (`192.168.100.0/24`).

The data path:

> Obviu app (obtv-ai) → HTTP over DAC → Spark FastAPI → reads media via
> NFS-RDMA mount of obtv-ai's uploads volume → returns result.

Currently exposes liveness, an ffprobe probe, and Whisper transcription.
Future endpoints (CLIP embeddings, frame captioning, etc.) will follow
the same pattern.

> ⚠️ **Cancellation note**: a transcription job runs to completion on the
> GPU even if the HTTP client disconnects or times out. The job lock is
> released only when the worker thread actually finishes, which is what
> guarantees no second job can start on the same GPU mid-flight. There is
> no server-side wall-clock timeout — apply one from the client if you
> need to bound long files.

## Endpoints

| Method | Path                       | Purpose                                                       |
|--------|----------------------------|---------------------------------------------------------------|
| GET    | `/health`                  | Liveness, hostname, GPU snapshot, NFS mount sanity            |
| GET    | `/info`                    | Static service metadata (version, mount root, endpoint list)  |
| GET    | `/probe?path=<rel-path>`   | Run `ffprobe` on a file under the shared mount, return metadata |
| POST   | `/transcribe`              | Whisper transcription via faster-whisper, reads via NFS-RDMA  |
| GET    | `/transcribe/status`       | Current job + loaded models + defaults                         |

The service binds to `192.168.100.1:7681` by default — i.e. only on the
DAC interface — so it is not reachable from outside the rack.

## Bring-up (on the Spark)

```bash
# On the Spark, in this repo (e.g. ~/obviu)
cd spark
chmod +x setup.sh
./setup.sh
```

That installs Python venv + ffmpeg, creates `venv/`, writes a systemd
unit `obviu-spark-ai.service`, enables and starts it, and runs a health
probe.

Verify from the **Obviu app host** (obtv-ai):

```bash
curl -sS http://192.168.100.1:7681/health | jq
```

You should see the GPU device list (Blackwell), the mount block reporting
`fsType: nfs4` with `isRdma: true`, and a `sampleEntries` list that
includes the same files you see on obtv-ai under
`/var/lib/docker/volumes/obview_uploads/_data`.

## Wiring into the Obviu app

The app's existing `probeSpark` diagnostics already understands a JSON
worker URL. On the Obviu host, in `.env`:

```
SPARK_HOST=192.168.100.1
SPARK_PORT=7681
SPARK_DIAG_URL=http://192.168.100.1:7681/health
```

Then restart the app container. The admin diagnostics page will show
TCP reachability *and* the parsed health blob (GPU + mount status) under
the Spark section.

## Try the media probe end-to-end

Pick any file you see in the app's uploads (e.g. on obtv-ai:
`ls /var/lib/docker/volumes/obview_uploads/_data | head`), then from the
app host:

```bash
curl -sS "http://192.168.100.1:7681/probe?path=1777795884649-885951634.mp4" | jq
```

You'll get the full ffprobe JSON (streams, duration, codecs, bit rate)
served by the Spark, having read the bytes over NFS-RDMA. That confirms
the entire data path before we hand it real models.

## Transcription

`POST /transcribe` runs faster-whisper against a file in the shared NFS-RDMA
mount and (by default) writes the result to
`<mount>/transcripts/<basename>.json`. The app sees that file through the
same NFS mount — no DB schema change.

Request body:

```json
{
  "path": "1777795884649-885951634.mp4",   // required, relative to mount
  "model": "large-v3-turbo",                // optional, default per env
  "language": null,                          // optional ISO code, null = auto
  "vad_filter": true,
  "word_timestamps": true,
  "beam_size": 5,
  "save": true                               // write JSON to mount
}
```

Quick smoke test from obtv-ai:

```bash
curl -sS -X POST http://192.168.100.1:7681/transcribe \
  -H 'content-type: application/json' \
  -d '{"path": "1777795884649-885951634.mp4"}' | jq '.modelLoadMs, .transcribeMs, .totalMs, .savedTo, .result.language, .result.segments | length'
```

Concurrency: the service serialises transcription jobs with a
`threading.Lock` that is acquired *inside the worker thread* and held for
the entire compute (model load + decode + save). A second concurrent POST
returns HTTP 429 with the in-flight job in the body. Crucially, if the
HTTP client disconnects or times out mid-job, the worker thread keeps
running until done — the lock is never released while the GPU is still
busy, so a follow-up request cannot start a second job on the same GPU.
Poll `/transcribe/status` for the current job and to see which models are
currently loaded.

### Whisper on Blackwell (GB10) — known caveats

> **Reality check (verified 2026-05-03):** PyPI's `ctranslate2` aarch64
> wheel is **CPU-only** — NVIDIA only ships CUDA-enabled CT2 wheels for
> x86_64. `ctranslate2.get_cuda_device_count()` returns 0 and any
> `device="cuda"` load fails with `"This CTranslate2 package was not
> compiled with CUDA support"`. The cu12-vs-cu13 mismatch described below
> is the *next* problem you'll hit, not the current one.
>
> **Today, run on CPU.** Drop a systemd override at
> `/etc/systemd/system/obviu-spark-ai.service.d/override.conf`:
> ```ini
> [Service]
> Environment=OBVIU_WHISPER_DEVICE=cpu
> Environment=OBVIU_WHISPER_COMPUTE_TYPE=int8
> ```
> then `sudo systemctl daemon-reload && sudo systemctl restart obviu-spark-ai.service`.
> On Grace + int8 we see ~0.25× realtime for `large-v3-turbo` (52-min
> audio in ~13 min). To unlock GPU later, build CT2 from source against
> CUDA 13 — see option 2 below.

The DGX Spark's GB10 is a Grace Blackwell unified-memory part. Once you
have a CUDA-enabled CTranslate2 build, the *prebuilt* CT2 binaries link
against CUDA 12; on the Spark's CUDA 13 stack you may see a load-time
error like "Library libcublas.so.12 not found". Two fixes, easiest first:

1. **Install the CUDA 12 compatibility libs** (NVIDIA ships these in the
   `cuda-compat-12-x` packages on the CUDA repo). The 580 driver is
   forward-compatible with cu12 user-space — this usually just works:
   ```
   sudo apt-get install -y libcublas-12-9 libcudnn9-cuda-12
   sudo systemctl restart obviu-spark-ai.service
   ```

2. **Rebuild ctranslate2 from source against CUDA 13** (last resort, ~30
   min compile):
   ```
   ./venv/bin/pip uninstall -y ctranslate2
   git clone --recursive https://github.com/OpenNMT/CTranslate2 /tmp/ct2
   cd /tmp/ct2 && mkdir build && cd build
   cmake .. -DWITH_CUDA=ON -DCUDA_ARCH_LIST="12.0" -DCMAKE_BUILD_TYPE=Release
   make -j install
   cd ../python && ../../venv/bin/pip install -e .
   ```

If neither works yet, set `OBVIU_WHISPER_DEVICE=cpu` in the unit env (Grace
ARM cores are still very fast) and revisit when CT2 ships cu13 wheels.

The first transcription call downloads the model into `spark/models/`
(~3 GB for `large-v3-turbo`); subsequent calls are warm.

## Operations

```bash
# Logs
journalctl -u obviu-spark-ai.service -f

# Restart
sudo systemctl restart obviu-spark-ai.service

# Disable
sudo systemctl disable --now obviu-spark-ai.service
```

## Configuration

All via environment variables (set in the systemd unit by `setup.sh`):

| Variable             | Default                  | Purpose                                        |
|----------------------|--------------------------|------------------------------------------------|
| `SPARK_BIND_HOST`    | `192.168.100.1`          | Interface to bind. Use the DAC IP.             |
| `SPARK_BIND_PORT`    | `7681`                   | TCP port.                                      |
| `OBVIU_MOUNT_ROOT`   | `/mnt/obview-uploads`    | NFS-RDMA mount of obtv-ai's uploads volume.    |
| `OBVIU_PROBE_TIMEOUT_SEC` | `30`                | ffprobe timeout for `/probe`.                  |
| `OBVIU_WHISPER_MODEL`     | `large-v3-turbo`         | Default whisper model.                         |
| `OBVIU_WHISPER_DEVICE`    | `cuda`                   | `cuda` or `cpu`.                                |
| `OBVIU_WHISPER_COMPUTE_TYPE` | `float16`             | `float16`, `int8_float16`, `int8`, `float32`.   |
| `OBVIU_TRANSCRIPTS_SUBDIR`| `transcripts`            | Where to save result JSONs under the mount.     |
| `HF_HOME`                 | `<service-dir>/models`   | HuggingFace cache root (set by setup.sh).       |
