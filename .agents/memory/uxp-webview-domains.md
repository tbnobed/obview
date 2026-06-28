---
name: UXP webview domain permission
description: Why a UXP <webview> renders blank/black and loads nothing in a Premiere panel
---

# UXP webview blank / loads nothing

A UXP `<webview>` that renders as a black box but never navigates is almost always
a `manifest.json` `requiredPermissions.webview.domains` problem. UXP validates the
domain allowlist **at plugin load**, not at navigation time; if the target origin
isn't allowed, setting `.src` silently does nothing (blank webview, no obvious error).

**Rule:** `webview.domains` does NOT allow a TLD wildcard. `["*"]` is invalid and
blocks everything. Valid forms:
- explicit origins: `["https://app.example.com"]`
- subdomain wildcard (only before a fixed TLD): `["https://*.example.com"]`
- allow-all escape hatch: the **string** `"all"` (not an array) — `"domains": "all"`

**Why:** the panel signs in against an arbitrary user-supplied base URL, so no static
allowlist covers every self-host/staging domain. `"all"` mirrors the `network` permission
(which already uses `"domains": "all"`).

**How to apply:** if a webview is blank, first check the manifest domains value, then add
`load`/`error` listeners on the element (`WebViewEvent.message` carries the enriched cause).
Give the element explicit `width`/`height` attributes too — CSS-only sizing can collapse it.
