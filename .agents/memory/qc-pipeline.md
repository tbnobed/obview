---
name: QC pipeline design
description: How the per-file QC report works — detector split between app and GPU worker, regenerate semantics, migration guard
---

Three detectors feed one `qc_reports` row per file (UNIQUE file_id, migration 0037):

- **Frames** (black/freeze) run locally in the app with ffmpeg — never on the worker. They also auto-run for silent videos, where transcription bails early with "no audio stream".
- **Audio events (PANNs) and OCR (easyocr)** run on the GPU worker as extra stages of the *transcription job* (flags `audio_events`/`ocr`, fail-soft like diarization; deps in `ai-worker/requirements-qc.txt`, PANNs checkpoint auto-downloads ~400MB to ~/panns_data).
- **Spell check** is an app-side LLM pass over worker OCR blocks.

**Why regenerate is partial:** a manual QC re-run has no fresh worker payload (worker stages only run with transcription). It re-runs frames locally, re-spell-checks stored `ocr_blocks`, and *keeps* previous audio-event findings. To refresh audio/OCR data, regenerate the transcript.

**How to apply:** any new detector must record its own status in `detectors` json (one failure must not hide other findings), and any new table needs a numbered `migrations/*.sql` or the startup schema-drift guard aborts boot in prod. QC toggles: `TRANSCRIPTION_QC` (worker stages), `QC_ENABLED` (app orchestration).
