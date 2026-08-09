#!/usr/bin/env bash
# Bring-up script for the Obviu AI worker on the LOCAL GPU host (obtv-ai, L4).
#
# Same service.py as the DGX Spark deployment, but configured for the app
# host itself:
#   - binds to 127.0.0.1:7682 (app and worker share the box; never exposed)
#   - mount root = the app's local uploads directory (no NFS involved)
#   - faster_whisper backend with real CUDA (x86_64 ctranslate2 ships CUDA)
#   - optional pyannote diarization (requires an HF token, see
#     requirements-diarization.txt)
#
# Usage (on obtv-ai, from the repo checkout):
#   UPLOADS_DIR=/home/obtv-admin/obview/uploads ./ai-worker/setup-local-gpu.sh
#   # with diarization:
#   OBVIU_HF_TOKEN=hf_xxx UPLOADS_DIR=... ./ai-worker/setup-local-gpu.sh
#
# Then point the app at it in .env and restart the app:
#   TRANSCRIBE_WORKER_URL=http://127.0.0.1:7682
#   TRANSCRIPTION_DIARIZE=true
#
# Re-running is safe: each step is idempotent. The HF token is stored in
# /etc/default/obviu-local-ai (root-only), not in the unit file.

set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"
BIND_HOST="${SPARK_BIND_HOST:-127.0.0.1}"
BIND_PORT="${SPARK_BIND_PORT:-7682}"
UPLOADS_DIR="${UPLOADS_DIR:-${OBVIU_MOUNT_ROOT:-}}"
UNIT_NAME="obviu-local-ai.service"
UNIT_PATH="/etc/systemd/system/${UNIT_NAME}"
ENV_FILE="/etc/default/obviu-local-ai"

if [ -z "${UPLOADS_DIR}" ]; then
  echo "ERROR: set UPLOADS_DIR to the app's uploads directory, e.g."
  echo "  UPLOADS_DIR=/home/obtv-admin/obview/uploads $0"
  exit 1
fi
if [ ! -d "${UPLOADS_DIR}" ]; then
  echo "ERROR: UPLOADS_DIR ${UPLOADS_DIR} does not exist"
  exit 1
fi

echo "==> service dir : ${SERVICE_DIR}"
echo "==> service user: ${SERVICE_USER}"
echo "==> bind        : ${BIND_HOST}:${BIND_PORT}"
echo "==> uploads dir : ${UPLOADS_DIR}"

echo "==> installing system packages (python venv + ffmpeg)"
sudo apt-get update -qq
sudo apt-get install -y python3-venv python3-pip ffmpeg util-linux >/dev/null

echo "==> creating venv at ${SERVICE_DIR}/venv"
if [ ! -d "${SERVICE_DIR}/venv" ]; then
  python3 -m venv "${SERVICE_DIR}/venv"
fi
"${SERVICE_DIR}/venv/bin/pip" install --quiet --upgrade pip
"${SERVICE_DIR}/venv/bin/pip" install -r "${SERVICE_DIR}/requirements.txt"

# Diarization stack (torch + pyannote, ~2.5GB first install). Installed
# unconditionally so the worker is diarization-capable; it only activates
# per-request and only works once an HF token is configured.
echo "==> installing diarization stack (torch + pyannote — big download on first run)"
"${SERVICE_DIR}/venv/bin/pip" install -r "${SERVICE_DIR}/requirements-diarization.txt"

echo "==> verifying CUDA is available to torch (fail loud, not silently CPU)"
"${SERVICE_DIR}/venv/bin/python" - <<'PYEOF'
import sys
import torch
if not torch.cuda.is_available():
    print("ERROR: torch resolved to a CPU-only build or cannot see the GPU.")
    print(f"       torch={torch.__version__}, cuda_built={torch.backends.cuda.is_built()}")
    print("       Diarization would silently run on CPU (impractically slow).")
    print("       Check nvidia drivers (nvidia-smi) and reinstall torch from a CUDA wheel index.")
    sys.exit(1)
print(f"OK: torch {torch.__version__} sees {torch.cuda.get_device_name(0)}")
PYEOF

mkdir -p "${SERVICE_DIR}/models"

echo "==> writing env file at ${ENV_FILE} (root-only; holds the HF token)"
sudo touch "${ENV_FILE}"
sudo chmod 600 "${ENV_FILE}"
if [ -n "${OBVIU_HF_TOKEN:-}" ]; then
  # Replace or append the token line without clobbering other settings.
  sudo sed -i '/^OBVIU_HF_TOKEN=/d' "${ENV_FILE}"
  echo "OBVIU_HF_TOKEN=${OBVIU_HF_TOKEN}" | sudo tee -a "${ENV_FILE}" >/dev/null
  echo "    (HF token written)"
else
  if ! sudo grep -q '^OBVIU_HF_TOKEN=' "${ENV_FILE}"; then
    echo "    NOTE: no OBVIU_HF_TOKEN provided — diarization requests will fail"
    echo "    until you add one:  echo 'OBVIU_HF_TOKEN=hf_...' | sudo tee -a ${ENV_FILE}"
    echo "    then: sudo systemctl restart ${UNIT_NAME}"
  fi
fi

echo "==> writing systemd unit at ${UNIT_PATH}"
sudo tee "${UNIT_PATH}" >/dev/null <<EOF
[Unit]
Description=Obviu local AI worker (whisper + diarization on the L4)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${SERVICE_DIR}
EnvironmentFile=-${ENV_FILE}
Environment=SPARK_BIND_HOST=${BIND_HOST}
Environment=SPARK_BIND_PORT=${BIND_PORT}
Environment=OBVIU_MOUNT_ROOT=${UPLOADS_DIR}
# faster-whisper with CUDA on x86_64 (default backend).
Environment=OBVIU_WHISPER_BACKEND=faster_whisper
Environment=OBVIU_WHISPER_DEVICE=cuda
Environment=OBVIU_WHISPER_COMPUTE_TYPE=float16
# Pin HuggingFace cache under the service dir so model downloads are
# persistent and easy to inspect.
Environment=HF_HOME=${SERVICE_DIR}/models
Environment=HUGGINGFACE_HUB_CACHE=${SERVICE_DIR}/models/hub
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

sleep 2
echo "==> service status"
sudo systemctl --no-pager --full status "${UNIT_NAME}" | head -20 || true

echo
echo "==> health probe"
curl -sS --max-time 10 "http://${BIND_HOST}:${BIND_PORT}/health" | python3 -m json.tool || {
  echo "(health probe failed — check 'journalctl -u ${UNIT_NAME} -n 50')"
  exit 1
}

echo
echo "Done. In the app's .env on this host, set:"
echo "  TRANSCRIBE_WORKER_URL=http://${BIND_HOST}:${BIND_PORT}"
echo "  TRANSCRIPTION_DIARIZE=true"
echo "then restart the app. New uploads will transcribe + diarize on the L4."
