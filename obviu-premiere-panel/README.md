# Obviu Review — Premiere Pro panel

A UXP panel for Adobe Premiere Pro that connects to an Obviu workspace so editors
can browse projects, folders, files and versions, import media into Premiere, read
and write review comments, approve / request changes, copy share links, and pull
comments onto the timeline as markers — without leaving Premiere.

> This folder is **not** part of the Obviu web-app build. It is a standalone UXP
> plugin that runs inside Premiere. The only meaningful way to test it is to load
> it in Premiere via the UXP Developer Tool (UDT).

## Requirements

- Premiere Pro **25.6 or newer** (UXP for Premiere went GA in 25.6, Dec 2025).
- [UXP Developer Tool (UDT)](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/) for loading during development.
- A normal **Obviu account** (the same username/email + password you use on the web).

## What it does

- **Sign in** with your Obviu server URL (e.g. `https://app.obviu.io`) and your
  normal account credentials. No token copy-paste — the panel signs in for you and
  stores its own per-machine session token. Because each sign-in mints an
  independent session, **shared workstations work**: people can sign in and out all
  day and one station signing in never logs another out. Use **Sign out** when you
  leave the workstation.
- **Browse** projects → folders → files → versions (defaults to the latest version).
  Subfolders are navigable; "All files" shows the project root.
- **Import to Premiere** downloads the selected version and imports it into the
  active Premiere project's root bin.
- **Comment** on the selected version: post a comment (optionally pinned to the
  current playhead time), **reply** to a thread, and **resolve / unresolve**.
- **Approve / Request changes** on the selected version (you can't review a file you
  uploaded yourself).
- **Copy share link** mints a file share link and copies its `…/s/<token>` URL to
  the clipboard.
- **Pull comments to markers** on the active sequence. Marker color encodes status:
  - open → red
  - resolved → green
  - changes requested → orange
  - Range comments (with an out point) become marker spans.
- **Jump to comment** sets the sequence playhead (CTI) to the comment timestamp.
- **Auto-refresh** comments every 30 seconds.

It talks only to the API under `/api/v1/*` using `Authorization: Bearer <token>`.

## Server endpoints used

| Method | Path                                      | Purpose                         |
|--------|-------------------------------------------|---------------------------------|
| POST   | `/api/v1/login`                           | sign in (username/email + password) → returns a session token |
| POST   | `/api/v1/logout`                          | revoke the current session token |
| GET    | `/api/v1/projects`                        | list projects (also validates the token) |
| GET    | `/api/v1/projects/:projectId/folders`     | folder tree for a project       |
| GET    | `/api/v1/projects/:projectId/files`       | files in a project (optional `?folderId=<n>` or `?folderId=root`) |
| GET    | `/api/v1/files/:id`                        | file detail incl. `versions[]`  |
| GET    | `/api/v1/files/:id/download`               | media bytes (for import)        |
| GET    | `/api/v1/files/:id/comments`               | comments for a file/version     |
| POST   | `/api/v1/files/:id/comments`               | create a comment / reply        |
| PATCH  | `/api/v1/comments/:commentId`              | resolve / unresolve a comment   |
| POST   | `/api/v1/files/:id/approve`                | approve / request changes       |
| POST   | `/api/v1/files/:id/share-links`            | create a file share link        |
| GET    | `/api/v1/files/:id/share-links`            | list file share links           |
| GET    | `/api/v1/files/:id/transcript`             | transcript (reserved for later) |

### CORS

The panel's webview sends an `Origin` header. The server reflects/allows origins
listed in the `PANEL_CORS_ORIGINS` env var (comma-separated). During first run the
server logs the panel's `Origin` when it is not yet listed — add that value to
`PANEL_CORS_ORIGINS` and restart.

## Load it in Premiere (development)

1. Launch Premiere Pro (25.6+) and open a project + sequence.
2. Open the **UXP Developer Tool**.
3. **Add Plugin** → select this folder's `manifest.json`.
4. Click **Load**. The panel appears under **Window → Extensions (or UXP) → Obviu Review**.
5. Enter your server URL + API token and **Connect**.

Use **⋯ → Watch** in UDT to auto-reload on file changes while developing.

## Package a `.ccx` for distribution

1. In UDT, use the plugin's **⋯ → Package** action to produce a `.ccx` bundle, or
   use the UXP CLI:
   ```bash
   npx @adobe/uxp-cli plugin package ./obviu-premiere-panel
   ```
2. Host the resulting file at `tbn.obviu.io/downloads/obviu-premiere.ccx` for direct
   install (double-click `.ccx` → installs via Creative Cloud).
3. Marketplace listing (Adobe Creative Cloud) can come later for auto-update + mass
   distribution; expect a 1–4 week review per submission.

## Notes / caveats

- The Premiere marker and playhead API (`premierepro`: `Markers.getMarkers`,
  `createAddMarkerAction`, `Project.executeTransaction`, `TickTime.createWithSeconds`,
  `Sequence.setPlayerPosition`) targets the 25.6+ UXP surface. Adobe is still
  iterating on these APIs; if a call name differs on a given build, the panel surfaces
  the error in the status line rather than failing silently — adjust the call in
  `index.js` (`pullMarkers` / `jumpTo` / `importToPremiere`) to match your Premiere version.
- **Import** writes the downloaded media to the UXP temporary folder and calls
  `Project.importFiles([path], suppressUI, rootBin, false)`. The `rootBin` accessor
  (`getRootItem()` vs `rootItem`) and the `importFiles` signature have shifted across
  builds; the call is wrapped so a mismatch shows in the status line.
- **Send for review** → AME export → tus upload as a new version is still out of
  scope here (tracked separately). The server already mirrors bearer auth onto the
  tus upload route so that work can build on this foundation.

## Files

- `manifest.json` — UXP manifest v5 (panel entrypoint, network + localStorage perms).
- `index.html` / `styles.css` — panel UI.
- `index.js` — auth, API calls, rendering, and Premiere import/marker/playhead integration.
