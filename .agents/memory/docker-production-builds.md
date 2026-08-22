---
name: Docker production builds
description: Non-obvious dependency and external-asset constraints in the multi-stage production image.
---

The application builder must not rely on dev-dependency inclusion. Keep the required Vite/esbuild/CSS toolchain available as regular dependencies and assert the binaries exist before copying source or compiling.

The runtime schema verification also uses tsx, so tsx must remain a regular dependency unless that verification path is replaced with compiled JavaScript.

Do not use npm to install dependencies in the Docker builder. Use the Corepack-pinned pnpm version and the committed frozen pnpm lockfile. Both npm 10.8.2 and 10.9.8 crashed on the external host with `Exit handler never called`; retries only repeated the crash.

For BtbN FFmpeg downloads, use a currently published stable asset with a master-build fallback. Old versioned assets are eventually removed from the upstream `latest` release.

**Why:** A deployment omitted Vite even after npm was told to include dev dependencies, then npm's installer crashed repeatedly across patched versions despite an identical local Docker build succeeding. A frozen pnpm install avoids that host-specific npm failure. A builder-only repair also exposed a separate 404 for the retired FFmpeg 7.1 asset.

**How to apply:** Keep the npm and pnpm lockfiles synchronized when dependencies change. After Docker or dependency changes, build the complete final image with production build arguments, then verify the server bundle, frontend assets, FFmpeg, ffprobe, and whisper.cpp inside it.