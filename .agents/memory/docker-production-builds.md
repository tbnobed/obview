---
name: Docker production builds
description: Non-obvious dependency and external-asset constraints in the multi-stage production image.
---

The application builder must not rely on dev-dependency inclusion. Keep the required Vite/esbuild/CSS toolchain available as regular dependencies, retain a builder-stage fallback install for older checkouts, and assert the binaries exist before copying source or compiling.

The runtime schema verification also uses tsx, so tsx must remain a regular dependency unless that verification path is replaced with compiled JavaScript.

For BtbN FFmpeg downloads, use a currently published stable asset with a master-build fallback. Old versioned assets are eventually removed from the upstream `latest` release.

**Why:** A deployment omitted Vite even after npm was told to include dev dependencies. Making the toolchain non-optional fixed the host-specific behavior. A builder-only repair also exposed a separate 404 for the retired FFmpeg 7.1 asset.

**How to apply:** After Docker or dependency changes, build the complete final image with production build arguments, then verify the server bundle, frontend assets, FFmpeg, ffprobe, and whisper.cpp inside the resulting image.