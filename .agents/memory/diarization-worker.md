---
name: Diarization & local-GPU worker
description: Design decisions for speaker diarization and running the AI worker on the app host's L4 GPU
---

# Diarization & local-GPU worker

- The same worker service (ai-worker/service.py) deploys to both the DGX Spark (DAC-bound) and the app host's L4 (`ai-worker/setup-local-gpu.sh`, 127.0.0.1:7682, mount root = local uploads dir). The app switches targets purely via `SPARK_AI_URL` — no app code change.
- Diarization is **fail-soft by design**: a pyannote failure must never discard a good transcript. The worker reports the outcome in `payload.diarization` (ok/error) and the app logs it; transcript is stored either way, without speaker labels.
- **Why:** transcription is the primary deliverable; diarization is an enhancement dependent on a gated HF token that can break independently.
- pyannote models are gated on HuggingFace — need a token that accepted terms for BOTH speaker-diarization-3.1 and segmentation-3.0. Token lives in /etc/default/obviu-local-ai (0600), never in the unit file or repo.
- Honest device reporting: `Pipeline.to(cuda)` can silently fail → CPU. The worker records the *actual* device it landed on and the setup script fails install if torch resolved CPU-only. Never trust "device: cuda" from config alone.
- pyannote reads audio via torchaudio, which is unreliable on video containers — always feed it a clean ffmpeg-extracted 16kHz mono WAV.
- Speaker assignment: per transcript segment, pick the diarization turn with maximum temporal overlap; segments with no overlap keep `speaker: null` (music/silence).
- Old workers ignore the extra request fields and old transcripts lack `speaker` — everything downstream must treat `speaker` as optional (it does).
- NVENC (video encode) and CUDA compute (whisper/pyannote) use different silicon on the L4, so transcode + AI coexist without contention; plain nvidia-smi GPU-util under-reports NVENC — use `nvidia-smi dmon -s u` (enc column).
