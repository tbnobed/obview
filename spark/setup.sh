#!/usr/bin/env bash
# Bring-up script for the Obviu Spark AI worker on the DGX Spark node.
#
# What it does:
#   1. Installs Python venv + ffmpeg (idempotent).
#   2. Creates a venv in ./venv and installs pinned requirements.
#   3. Writes a systemd unit that runs service.py on boot, bound to the
#      DAC interface (192.168.100.1:7681) so the worker is reachable only
#      from inside the rack.
#   4. Enables + starts the unit and prints a quick health check.
#
# Re-running is safe: each step is idempotent.

set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"
BIND_HOST="${SPARK_BIND_HOST:-192.168.100.1}"
BIND_PORT="${SPARK_BIND_PORT:-7681}"
MOUNT_ROOT="${OBVIU_MOUNT_ROOT:-/mnt/obview-uploads}"
UNIT_NAME="obviu-spark-ai.service"
UNIT_PATH="/etc/systemd/system/${UNIT_NAME}"

echo "==> service dir : ${SERVICE_DIR}"
echo "==> service user: ${SERVICE_USER}"
echo "==> bind        : ${BIND_HOST}:${BIND_PORT}"
echo "==> mount root  : ${MOUNT_ROOT}"

echo "==> installing system packages (python venv + ffmpeg)"
# Note: findmnt ships in util-linux, which is part of every Ubuntu base
# install — no separate package needed. Listing it here as a guard would
# fail apt because there's no package literally named 'findmnt'.
sudo apt-get update -qq
sudo apt-get install -y python3-venv python3-pip ffmpeg util-linux >/dev/null

echo "==> creating venv at ${SERVICE_DIR}/venv"
if [ ! -d "${SERVICE_DIR}/venv" ]; then
  python3 -m venv "${SERVICE_DIR}/venv"
fi
"${SERVICE_DIR}/venv/bin/pip" install --quiet --upgrade pip
# faster-whisper + ctranslate2 are heavy installs (~500MB) the first time;
# drop --quiet so the user sees progress.
"${SERVICE_DIR}/venv/bin/pip" install -r "${SERVICE_DIR}/requirements.txt"

mkdir -p "${SERVICE_DIR}/models"

echo "==> writing systemd unit at ${UNIT_PATH}"
sudo tee "${UNIT_PATH}" >/dev/null <<EOF
[Unit]
Description=Obviu Spark AI worker (FastAPI)
After=network-online.target
Wants=network-online.target
# Hard dependency on the NFS-RDMA mount: systemd will pull in (and wait
# for) the corresponding .mount unit derived from this path. If the mount
# fails, the service won't start — preferable to silently coming up
# without media access.
RequiresMountsFor=${MOUNT_ROOT}

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${SERVICE_DIR}
Environment=SPARK_BIND_HOST=${BIND_HOST}
Environment=SPARK_BIND_PORT=${BIND_PORT}
Environment=OBVIU_MOUNT_ROOT=${MOUNT_ROOT}
# Pin HuggingFace cache to a known location under the service dir so model
# downloads are visible, persistent across reinstalls, and easy to inspect.
Environment=HF_HOME=${SERVICE_DIR}/models
Environment=HUGGINGFACE_HUB_CACHE=${SERVICE_DIR}/models/hub
# Make the GPU visible to faster-whisper / ctranslate2.
Environment=CUDA_VISIBLE_DEVICES=0
ExecStart=${SERVICE_DIR}/venv/bin/python ${SERVICE_DIR}/service.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> reloading systemd, enabling + starting ${UNIT_NAME}"
sudo systemctl daemon-reload
sudo systemctl enable "${UNIT_NAME}" >/dev/null
sudo systemctl restart "${UNIT_NAME}"

sleep 1
echo "==> service status"
sudo systemctl --no-pager --full status "${UNIT_NAME}" | head -20 || true

echo
echo "==> health probe"
if command -v curl >/dev/null; then
  curl -sS --max-time 5 "http://${BIND_HOST}:${BIND_PORT}/health" | python3 -m json.tool || {
    echo "(health probe failed — check 'journalctl -u ${UNIT_NAME} -n 50')"
    exit 1
  }
else
  echo "(install curl to auto-probe; or open http://${BIND_HOST}:${BIND_PORT}/health from the app host)"
fi

echo
echo "Done. On the Obviu app host, set in your .env:"
echo "  SPARK_HOST=${BIND_HOST}"
echo "  SPARK_PORT=${BIND_PORT}"
echo "  SPARK_DIAG_URL=http://${BIND_HOST}:${BIND_PORT}/health"
echo "Then restart the app container so admin diagnostics will pick it up."
