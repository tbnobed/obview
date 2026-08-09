---
name: Spark reserved for large QC LLM
description: Decision — the DGX Spark will host a large language model for asset QC, not transcription
---

# Spark reserved for a large QC LLM

Decision (Aug 2026): transcription/diarization moves to the app host's L4 GPU (see diarization-worker.md); the DGX Spark (GB10, ~128GB unified memory) is reserved to serve a **large LLM** (70B-class quantized, e.g. Llama 3.3 70B / Qwen2.5 72B via llama.cpp server / Ollama / vLLM) whose primary job is **QC of uploaded assets**.

**Why:** the L4 has spare CUDA capacity (NVENC uses separate silicon), and the Spark's big unified memory is wasted on a ~3GB whisper model; a large model enables meaningful QC (transcript coherence, wrong language, missing/silent audio, compliance flags, title/description mismatch, optionally CLIP-based visual checks).

**How to apply:**
- `server/llm-client.ts` already supports remote mode via `LLAMA_API_URL` — point it at the Spark-hosted LLM endpoint; summarization/chapters switch over automatically (transcript budget rises 16k→80k chars).
- Don't propose putting whisper back on the Spark or a big LLM on the L4.
- QC pipeline hook point: after transcription completes in `server/transcription.ts` (same spot that triggers summarization/chapters).
