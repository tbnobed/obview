#!/usr/bin/env bash
#
# Build whisper.cpp with CUDA support on the Obviu spark (DGX Spark / GB10
# aarch64 + CUDA). One-shot installer: clones, builds, downloads the model.
#
# Usage:
#   sudo ./build-whispercpp-cuda.sh                  # installs to /opt/whisper.cpp
#   ./build-whispercpp-cuda.sh ~/whisper.cpp         # installs elsewhere
#
# Env overrides:
#   OBVIU_WHISPER_CPP_MODEL=large-v3-turbo  # any whisper.cpp model name
#   GGML_CUDA=1                             # forced; passed through to cmake
#
# After install, point spark/service.py at it via:
#   OBVIU_WHISPER_BACKEND=whisper_cpp
#   OBVIU_WHISPER_CPP_BIN=<install_dir>/build/bin/whisper-cli
#   OBVIU_WHISPER_CPP_MODEL_PATH=<install_dir>/models/ggml-<MODEL>.bin
#
set -euo pipefail

INSTALL_DIR="${1:-/opt/whisper.cpp}"
MODEL="${OBVIU_WHISPER_CPP_MODEL:-large-v3-turbo}"
JOBS="${JOBS:-$(nproc)}"

log() { printf '\n[whispercpp-cuda] %s\n' "$*"; }
die() { printf '\n[whispercpp-cuda] ERROR: %s\n' "$*" >&2; exit 1; }

# ----- preflight -----
log "preflight checks"
command -v git   >/dev/null || die "git missing — apt install git"
command -v cmake >/dev/null || die "cmake missing — apt install cmake"
command -v make  >/dev/null || die "make missing — apt install build-essential"
command -v nvcc  >/dev/null || die "nvcc missing — install CUDA toolkit (apt install cuda-toolkit-13-0 or similar)"
command -v ffmpeg>/dev/null || die "ffmpeg missing — apt install ffmpeg"
command -v nvidia-smi >/dev/null || die "nvidia-smi missing — driver not installed?"

NVCC_VER=$(nvcc --version | grep -oE 'release [0-9.]+' | awk '{print $2}')
log "nvcc version: ${NVCC_VER}"
nvidia-smi --query-gpu=name,driver_version --format=csv,noheader || true

# ----- clone / update -----
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  log "cloning whisper.cpp into ${INSTALL_DIR}"
  if [[ -e "${INSTALL_DIR}" && ! -d "${INSTALL_DIR}" ]]; then
    die "${INSTALL_DIR} exists and is not a directory"
  fi
  mkdir -p "$(dirname "${INSTALL_DIR}")"
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "${INSTALL_DIR}"
else
  log "updating existing checkout at ${INSTALL_DIR}"
  git -C "${INSTALL_DIR}" fetch --depth 1 origin
  git -C "${INSTALL_DIR}" reset --hard origin/HEAD
fi

cd "${INSTALL_DIR}"

# ----- build -----
log "configuring with CUDA (-DGGML_CUDA=1)"
rm -rf build
cmake -B build \
  -DGGML_CUDA=1 \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF

log "building (jobs=${JOBS}) — this can take 5-10 minutes"
cmake --build build --config Release -j"${JOBS}"

if [[ ! -x build/bin/whisper-cli ]]; then
  die "whisper-cli binary not produced; check the cmake/build output above"
fi
log "built: $(realpath build/bin/whisper-cli)"

# ----- model -----
MODEL_FILE="models/ggml-${MODEL}.bin"
if [[ -f "${MODEL_FILE}" ]]; then
  log "model already present: ${MODEL_FILE} ($(du -h "${MODEL_FILE}" | cut -f1))"
else
  log "downloading model: ${MODEL}"
  bash ./models/download-ggml-model.sh "${MODEL}"
fi

# ----- smoke test -----
log "smoke test: GPU enumeration via whisper-cli --help"
./build/bin/whisper-cli --help >/dev/null 2>&1 || die "whisper-cli --help failed"

# Tiny CUDA sanity probe: convert a synthesized 1s tone and run it.
SMOKE_DIR=$(mktemp -d)
trap 'rm -rf "${SMOKE_DIR}"' EXIT
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "sine=frequency=440:duration=1" \
  -ar 16000 -ac 1 -c:a pcm_s16le "${SMOKE_DIR}/silence.wav"

log "smoke test: 1s decode (should print backend init lines mentioning CUDA)"
set +e
./build/bin/whisper-cli \
  -m "${MODEL_FILE}" \
  -f "${SMOKE_DIR}/silence.wav" \
  --threads 4 \
  2>&1 | tee "${SMOKE_DIR}/smoke.log" | grep -E "(CUDA|cuBLAS|GPU|backend|init)" | head -20
SMOKE_EXIT=${PIPESTATUS[0]}
set -e
if [[ "${SMOKE_EXIT}" -ne 0 ]]; then
  die "smoke decode failed (exit=${SMOKE_EXIT}); see ${SMOKE_DIR}/smoke.log"
fi

# ----- done -----
cat <<EOF

[whispercpp-cuda] DONE.

Set these in the spark service environment (e.g. systemd unit or shell):

  OBVIU_WHISPER_BACKEND=whisper_cpp
  OBVIU_WHISPER_CPP_BIN=${INSTALL_DIR}/build/bin/whisper-cli
  OBVIU_WHISPER_CPP_MODEL_PATH=${INSTALL_DIR}/${MODEL_FILE}
  OBVIU_WHISPER_CPP_THREADS=8         # tune to taste
  OBVIU_WHISPER_CPP_USE_GPU=1

Then restart the spark service and verify:
  curl -s http://192.168.100.1:7681/info | jq '.whisper'
  curl -s http://192.168.100.1:7681/transcribe/status | jq '.defaults'

Both should report backend="whisper_cpp" and binExists/modelExists=true.
EOF
