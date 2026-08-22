---
name: Docker production builds
description: Non-obvious dependency and external-asset constraints in the multi-stage production image.
---

The application builder must explicitly include development dependencies even when producing a production image. Hosting environments may inject production-mode npm settings, but Vite and esbuild are still required during the builder stage.

Do not prune all development dependencies from the runtime image without first replacing its TypeScript-based schema verification path with compiled JavaScript.

For BtbN FFmpeg downloads, use a currently published stable asset with a master-build fallback. Old versioned assets are eventually removed from the upstream `latest` release.

**Why:** A deployment omitted Vite despite a normal package install, and a builder-only repair then exposed a separate 404 for the retired FFmpeg 7.1 asset. Testing only the application builder would have missed the production-stage failure.

**How to apply:** After Docker or dependency changes, build the complete final image with production build arguments, then verify the server bundle, frontend assets, FFmpeg, ffprobe, and whisper.cpp inside the resulting image.