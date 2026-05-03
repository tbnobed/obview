# Obviu Spark AI Worker

A small FastAPI service that runs on the DGX Spark node and is reachable
from the Obviu app over the 200Gb DAC link (`192.168.100.0/24`).

This is **iteration 1: plumbing only**. It exposes liveness and a media
probe so we can prove the round-trip works:

> Obviu app (obtv-ai) → HTTP over DAC → Spark FastAPI → reads media via
> NFS-RDMA mount of obtv-ai's uploads volume → returns metadata.

Real inference endpoints (whisper-large transcription, CLIP embeddings,
frame captioning) come in iteration 2.

## Endpoints

| Method | Path                       | Purpose                                                       |
|--------|----------------------------|---------------------------------------------------------------|
| GET    | `/health`                  | Liveness, hostname, GPU snapshot, NFS mount sanity            |
| GET    | `/info`                    | Static service metadata (version, mount root, endpoint list)  |
| GET    | `/probe?path=<rel-path>`   | Run `ffprobe` on a file under the shared mount, return metadata |

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
