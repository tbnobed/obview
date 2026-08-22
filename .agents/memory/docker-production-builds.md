---
name: Docker production builds
description: Non-obvious dependency and external-asset constraints in the multi-stage production image.
---

The application builder must not rely on dev-dependency inclusion. Keep the required Vite/esbuild/CSS toolchain available as regular dependencies and assert the binaries exist before copying source or compiling.

The runtime schema verification also uses tsx, so tsx must remain a regular dependency unless that verification path is replaced with compiled JavaScript.

Pin the builder to npm 10.9.8 before `npm ci`. The Node 20 image's npm 10.8.2 can crash in Docker with `Exit handler never called`; retrying with a second npm install only repeats the crash.

For BtbN FFmpeg downloads, use a currently published stable asset with a master-build fallback. Old versioned assets are eventually removed from the upstream `latest` release.

**Why:** A deployment omitted Vite even after npm was told to include dev dependencies, then npm 10.8.2 itself crashed on the next clean install. Making the toolchain non-optional and pinning patched npm fixed both host-specific failures. A builder-only repair also exposed a separate 404 for the retired FFmpeg 7.1 asset.

**How to apply:** After Docker or dependency changes, build the complete final image with production build arguments, then verify the server bundle, frontend assets, FFmpeg, ffprobe, and whisper.cpp inside the resulting image.