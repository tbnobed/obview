---
name: UXP export needs a real .epr
description: Why the Premiere panel's export presets are bundled .epr files, not code-defined settings.
---

Premiere UXP `EncoderManager.exportSequence(seq, type, outPath, presetPath)` only
accepts a real `.epr` preset **path** — there is no API to pass raw encoder
settings from code. So any "choose export quality" UI must resolve to actual
`.epr` files on disk.

**How to apply:** bundle curated `.epr` files under the plugin's own `presets/`
folder and read them via `uxp.storage.localFileSystem.getPluginFolder()` — the
plugin folder is the one location UXP reads without a per-machine permission
prompt (manifest `localFileSystem: "request"` gates everything else). The
"Export quality" dropdown lists whatever `.epr` sit there (label = filename minus
`.epr`) plus a "Custom .epr…" picker fallback.

**Why not hand-author .epr:** `.epr` internals are exporter/version-specific XML
and fragile when written by hand — derive variants from a known-good exported
preset (duplicate + edit resolution/bitrate) instead.

**Why H.264 MP4 masters:** Obviu's server re-encodes every upload to H.264 MP4
proxies, so a clean high-bitrate H.264 export is the sweet spot (small/fast over
WAN, no meaningful quality loss vs. shipping ProRes that gets transcoded anyway).
