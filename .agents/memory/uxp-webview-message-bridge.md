---
name: UXP webview message bridge
description: Talking to a page inside a UXP <webview> requires a manifest flag; have a hash fallback.
---

Plugin→page messaging on a UXP `<webview>` (`webviewEl.postMessage(...)`) only
works when the manifest's webview permission includes
`"enableMessageBridge": "localAndRemote"`. Without it the call is missing or
silently dead — no error surfaces in the panel.

**Why:** needed when the panel must drive state inside its embedded player
page (e.g. "seek to this comment and show its drawing").

**How to apply:** add the flag to `requiredPermissions.webview`, and keep a
fallback channel: change only the URL **hash** on the webview src
(`base + "#key=value&n=" + Date.now()`) — that's a same-document navigation
(no reload) the page can pick up via `hashchange`. Include a nonce so
repeat clicks re-fire.
