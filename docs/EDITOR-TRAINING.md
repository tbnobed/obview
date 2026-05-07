# Obviu.io — Editor Training Guide

A complete, click-by-click reference for video editors using Obviu to deliver
work, take review notes, and ship final cuts. Read it once end-to-end the
first time; after that use the table of contents to jump.

---

## Table of contents

1. [Concepts and terminology](#1-concepts-and-terminology)
2. [Logging in and your account](#2-logging-in-and-your-account)
3. [Projects and folders](#3-projects-and-folders)
4. [Uploading media](#4-uploading-media)
5. [The media player](#5-the-media-player)
6. [Keyboard shortcuts (the cheat sheet)](#6-keyboard-shortcuts-the-cheat-sheet)
7. [Comments, replies, reactions, mentions](#7-comments-replies-reactions-mentions)
8. [Drawing annotations on a frame](#8-drawing-annotations-on-a-frame)
9. [Versions and the version picker](#9-versions-and-the-version-picker)
10. [Side-by-side & wipe compare](#10-side-by-side--wipe-compare)
11. [Approval workflow](#11-approval-workflow)
12. [Sharing with reviewers (public links)](#12-sharing-with-reviewers-public-links)
13. [Exporting markers to your NLE](#13-exporting-markers-to-your-nle)
14. [AI features: synopsis, chapters, transcript](#14-ai-features-synopsis-chapters-transcript)
15. [Downloads and quality switching](#15-downloads-and-quality-switching)
16. [End-to-end example workflows](#16-end-to-end-example-workflows)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Concepts and terminology

Read this section once. Every other section assumes you know these terms.

- **Project** — the container for everything related to one piece of work
  (e.g. *"Tara-Leigh Cobble — Reading In Order, Episode 12"*). A project
  has a status (`draft`, `in_review`, `approved`, etc.), an owner, and a
  list of files.
- **File** — one media asset (video, audio, image) inside a project.
- **Version** — a re-cut of the same file. Versions live under one
  filename; v1 is the first upload, v2 is the next "Upload New Version,"
  and so on. **Versions are how you iterate**, not separate files.
- **Folder** — an optional grouping of projects in the sidebar. Use it
  when you have a series ("Sermons / 2026 / Q2").
- **Comment** — a note on a file. Comments can be:
  - *timestamped* (anchored to a specific second of the video)
  - *threaded* (replies under a parent comment)
  - *annotated* (have a drawing on the frame)
  - *public* (left by a reviewer via a share link, no login)
- **Annotation** — a drawing (pen/circle/rect/arrow) overlaid on a
  specific frame, attached to a comment.
- **Approval** — the formal "approved" or "request changes" decision a
  reviewer or admin records on a project.
- **Share link** — a public URL you give to outside reviewers. They
  don't need an Obviu login. You set the password, expiry, and what they
  can do (comment, download).
- **Marker** — every comment with a timestamp is also a marker. You can
  export markers to FCP XML, EDL, or CSV and load them in
  Premiere / Resolve / Avid.

---

## 2. Logging in and your account

### Logging in

Open the URL your admin sent you (e.g. `https://tbn.obviu.io`). Use
your username/email and password.

### Forgot password

Click **Forgot password?** on the login page. You'll get an email with
a reset link valid for a limited time.

### Editing your profile

- Click your name top-right → **Settings**
- Tabs:
  - **Account** — change email, display name
  - **Password** — change your password (requires current password)

### Roles you might have

- **Editor / User** — upload, comment, manage your own projects.
- **Admin** — everything plus: invite users, manage everyone's
  projects, view activity log, configure system settings.

You'll know if you're an admin because there's an **Admin** link in
the header.

---

## 3. Projects and folders

### Creating a project

1. Click **+ New Project** (top-right of Projects page or on the home
   page).
2. Fill in:
   - **Name** — required. Use a clear, searchable name. Example:
     `Cobble — Reading In Order — Ep 12 — Master 1080p`.
   - **Description** — context for collaborators. Episode notes,
     deadline, anything reviewers need.
   - **Folder** — optional. Pick from the sidebar list.
3. Click **Create**.

You land on the empty project page, ready to upload.

### Editing project details

On the project page click the **pencil icon** next to the project name.
You can also change the folder there.

### Project status (top of project page)

| Status | What it means |
|---|---|
| `draft` | Work in progress. Not yet sent for review. |
| `in_review` | You've marked it ready; reviewers are looking. |
| `approved` | Final approval recorded. |
| `changes_requested` | A reviewer wants edits. |

The status changes automatically as approvals come in, or manually with
the *Mark as ready for review* button (see [§11](#11-approval-workflow)).

### Folders

In the left sidebar:
- **Create folder** — `+` icon next to "Folders"
- **Drag a project into a folder** — grab the project card and drop
- **Rename / delete folder** — right-click the folder name (or `…`
  menu)

Folders are organizational only. They don't affect permissions or
share links.

---

## 4. Uploading media

### Two ways to upload

1. From a project page: click the **Upload** button.
2. From anywhere via drag-and-drop onto a project card.

### The upload form

- **File** — drag in or click to pick. Anything FFmpeg can read
  (MP4, MOV, MKV, WAV, MP3, JPG, PNG, etc.). Max ~20 GB per file.
- **Custom file name** *(optional)* — overrides the original
  filename. Use this when you want a clean name like
  `Cobble-Ep12-master-v3.mp4` instead of `proxy_export_FINAL_FINAL2.mp4`.
- Click **Upload**.

### What happens during upload (the upload tray, bottom-right)

- Each upload shows: thumbnail, filename, % complete, MB/s, ETA, and a
  pause/cancel control.
- **Files ≥ 100 MB** are automatically split into 4 parallel chunks.
  This is invisible to you — you just see one upload bar that fills
  faster than a single stream would. Don't close the browser tab; the
  pieces are reassembled when they all finish.
- **Pause / Resume** — top-right of each upload row. Network drops
  don't kill the upload; it auto-resumes when you're back online (Tus
  protocol). For chunked uploads this means individual chunks resume.
- **Cancel** — the X icon. Cancels server-side too; no orphan files.

### Upload version vs new file

- **Same filename → goes into the same file as a new version**
  (see [§9](#9-versions-and-the-version-picker)).
- **Different filename → creates a new file in the project.**

So if you're delivering a re-cut of the master, name it identically to
the previous master (or use the **Upload New Version** button on the
existing file — it bypasses naming entirely).

### Background processing

After the upload completes, the server:
- Generates a 720p proxy for fast playback
- Generates a sprite-sheet for hover scrubbing on thumbnails
- Extracts audio for transcription if AI is enabled
- (Audio/video) queues a transcript + AI synopsis + chapters job

You'll see "Processing…" on the file card. Playback works as soon as
the proxy is ready (usually a fraction of upload time). AI tabs
populate when their jobs finish.

---

## 5. The media player

Click any file from the project page to open the player. Layout:

```
┌──────────────────────────────────────────┬─────────────────────┐
│                                          │  ┌───────────────┐  │
│           VIDEO / IMAGE / AUDIO          │  │   COMMENTS    │  │
│                                          │  │   TRANSCRIPT  │  │
│                                          │  │   AI          │  │
│                                          │  │   VERSIONS    │  │
│                                          │  │   DETAILS     │  │
│   [drawing canvas overlays here]         │  │               │  │
│                                          │  │   (tabs)      │  │
├──────────────────────────────────────────┤  │               │  │
│  [timeline w/ comment dots]              │  │               │  │
│  ◀ ▶  ⏮ ⏭   00:01:23:14 / 00:05:00:00     │  │               │  │
│  [scrub bar with comment indicators]     │  │               │  │
│  Vol  Quality  Fullscreen  Approve  ⋯   │  │               │  │
└──────────────────────────────────────────┴─────────────────────┘
```

### Player controls bar (left to right)

- **Play / Pause** — Space
- **Frame ←** / **Frame →** — single-frame nudge (Shift = 10 frames)
- **Mute / Unmute** — speaker icon, **M**
- **Quality toggle** — `720p proxy` ↔ `Original`. Default is proxy
  (faster, smoother seeking). Switch to original for color-critical
  review or to confirm a fix at full resolution.
- **Fullscreen** — `F` or the icon
- **Approve / Request changes / Mark for review** — far right, see
  [§11](#11-approval-workflow)

### The timeline

- The thin bar above the scrub bar shows **comment markers** as colored
  dots. Hover any dot to preview the comment text. Click to jump.
- The scrub bar itself: click to seek. Drag for scrubbing.
- **Hover scrubbing** on a file thumbnail (in the file grid) shows a
  sprite-sheet preview — 121 frames at intervals across the duration.

### The right-hand tab strip

- **Comments** — chronological by timestamp, threaded
- **Transcript** — auto-generated, click any line to seek
- **AI** — synopsis + chapters
- **Versions** — list of all versions with upload date, comments
  count, "Upload New Version" button
- **Details** — codec, resolution, bitrate, file size, audio streams,
  fps, etc.

---

## 6. Keyboard shortcuts (the cheat sheet)

These all work whenever the player is on screen and the focus is **not
in a text field**.

### Playback

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `K` | Pause (explicit; also stops JKL shuttle) |
| `J` | Reverse shuttle. Tap repeatedly to double speed (1× → 2× → 4× → 8×). |
| `L` | Forward shuttle. Same doubling. |
| `M` | Mute / Unmute |
| `F` | Toggle fullscreen |
| `Esc` | Exit fullscreen |
| `Home` | Jump to start |
| `End` | Jump to end |

### Frame-accurate stepping

| Key | Action |
|---|---|
| `←` | Step back 1 frame |
| `→` | Step forward 1 frame |
| `Shift + ←` | Step back 10 frames |
| `Shift + →` | Step forward 10 frames |

(Frame rate defaults to 30 fps; adjust your edit timeline accordingly
when exporting markers.)

### File navigation

| Key | Action |
|---|---|
| `Cmd/Ctrl + Shift + ←` | Previous file in the project |
| `Cmd/Ctrl + Shift + →` | Next file in the project |

### In/out points (for marker reference)

| Key | Action |
|---|---|
| `I` | Set in point at current time |
| `O` | Set out point at current time |

A toast will show the set timestamp. The range appears on the timeline.

### Comments

| Key | Action |
|---|---|
| `C` | Focus the comment box (with the current timestamp pre-attached) |

> **Pro tip:** the `C` shortcut is the single biggest time-saver. Find
> a moment, hit `C`, type the note, hit `Enter`. The timestamp is
> captured automatically.

### In comment box (the textarea)

| Key | Action |
|---|---|
| `Enter` | Submit comment |
| `Shift + Enter` | New line within the comment |

`Space` and `K` don't trigger the player while you're typing.

---

## 7. Comments, replies, reactions, mentions

### Leaving a comment

Two paths:

**Path A — keyboard-driven (fastest):**
1. Play the video, find the moment.
2. Press `C` (or hit `Space` to pause first if you prefer).
3. The comment box gets focus. The current timestamp is auto-attached
   ("Add a comment at 00:01:23:14…").
4. Type your note, hit `Enter`.

**Path B — mouse:**
1. Pause near the moment.
2. Click the comment box at the bottom of the right panel.
3. Type, click the **Send** (paper plane) icon.

### Comment options before submitting (the toolbar under the textarea)

- **Toggle timestamp** — paperclip-with-clock icon. If you turn it OFF
  the comment is general (no time anchor, sorts to the top of the
  list).
- **Add drawing** — pen icon (see [§8](#8-drawing-annotations-on-a-frame)).
  Pauses video, opens the canvas overlay.

### Replying

Each comment has a **Reply** button. Replies are threaded under the
parent and don't carry a separate timestamp — they inherit the
parent's.

> **Example:** Editor leaves "Color shift on this shot" at `00:01:14:09`.
> Colorist replies "Fixed in v3" — the reply lives under that note,
> still anchored to the same frame.

### Reactions (emoji)

- Hover any comment → smiley icon → pick an emoji (👍 ❤️ 🔥 🎉 etc.)
- Useful as quick "ack" without typing.

### Mentions

Type `@` in a comment box to open a member picker. Pick a teammate;
they'll get an email notification with a deep link straight to that
comment's timestamp.

> **Example:** `@sarah can you re-grade this shot?` — Sarah gets an
> email titled "New comment on Cobble-Ep12 by John" with a "Jump to
> comment" button that opens the file at `00:01:14:09`.

### Public reviewer comments

When a reviewer comments via a share link, their comment shows their
name + email and a small "External" badge. They can be replied to
just like internal comments. They appear in the same list, sorted by
timestamp.

### Comment filters & sorting

Top of the Comments tab:
- **Filter** — all / mine / mentions of me / unresolved
- **Sort** — by timestamp (default) or recent

### Resolving / un-resolving

Click the checkmark on a comment to mark it resolved. Resolved
comments collapse out of the default view. Re-open the filter to
"All" to see them again.

---

## 8. Drawing annotations on a frame

Draw on the video to point at exactly what you mean.

### Starting an annotation

1. Pause at the frame you want to mark.
2. Click the **pen icon** in the comment toolbar (or the **Add
   drawing** option when composing a comment).
3. The video pauses (if not already), and a drawing canvas appears
   over the frame with a tool palette at the top.

### The tool palette

| Icon | Tool | Use for |
|---|---|---|
| ✎ | **Draw** (freehand) | Circling a face, scribbling on a problem area |
| ◯ | **Circle** (ellipse) | Highlighting a region cleanly |
| □ | **Rectangle** | Bounding boxes, framing issues |
| ↗ | **Arrow** | Pointing at a specific spot |

Then a row of **color swatches** (red, yellow, green, blue, white,
etc.). Click to set the current color. Each shape uses whatever color
was active when you drew it.

### Editing the drawing

- **Undo** — the curved-arrow icon. Removes the last shape.
- **Clear all** — trash icon.
- **Cancel** (X) — discard everything, close canvas.
- **Done** (✓) — attach the drawing to the comment you're composing.

### What the reviewer sees

When anyone (or you) clicks on that comment later, the canvas
re-renders read-only on top of the paused video at that exact
timestamp. A little pen icon appears next to the comment in the list
so you can see at a glance which comments have drawings.

> **Example:** You spot a boom-mic dip at `00:00:42:18`.
> 1. Pause. Hit `C`.
> 2. Click the pen icon → pick **Arrow** + red.
> 3. Draw an arrow pointing at the boom.
> 4. Hit **Done**.
> 5. Type "Boom dip — please patch from B-cam." Hit `Enter`.
>
> The colorist opens the comment, the frame jumps to `00:00:42:18`,
> and they see your red arrow on the boom.

---

## 9. Versions and the version picker

Versions let you iterate without losing history.

### Uploading a new version

Two ways:

**A) From the file's Versions tab:**
1. Open the file in the player.
2. Right panel → **Versions** tab.
3. Click **Upload New Version**.
4. Pick the new cut. Optional: add a "what changed" note.
5. Upload.

**B) From the project's file grid:**
- Hover the file thumbnail → **Upload new version** icon (the small
  upward-arrow + plus).

### The version selector

In the player header (next to the filename), the version dropdown
shows `v3 (latest)` etc. Pick any prior version to play it. Comments
are version-scoped — each version has its own comment thread.

### What carries forward / what doesn't

| Item | Carries to new version? |
|---|---|
| Comments | No — each version has its own thread |
| Approvals | No — each version is approved independently |
| Share links | Yes — share links resolve to the latest version |
| Project-level settings | Yes |

> **Best practice:** when you upload v2 in response to feedback,
> reference the v1 comments in your upload note ("Addresses comments
> #3, #5, #7 from v1").

---

## 10. Side-by-side & wipe compare

Compare any two versions of the same file.

### Opening compare

1. Open the file in the player.
2. Click the **Compare** icon in the header (two rectangles).
3. The compare dialog opens. The main player is paused
   automatically.

### Modes

- **Wipe** *(default)* — both versions overlap; a vertical handle in
  the middle wipes between them. Drag the handle (or use `←` / `→`).
  Use for spotting subtle changes (color, timing, a single-frame fix).
- **Side by Side** — A on the left, B on the right. Use for spotting
  layout/composition differences.

Toggle modes with the buttons in the header.

### A / B picker

Two version dropdowns at the top: **A** (blue) and **B** (green).
Pick any pair. By default A is the next-to-latest and B is the latest.

### Playback controls (bottom of compare)

- **Play / Pause** — runs both videos in sync
- **Restart** — both back to 00:00
- **Scrub bar** — keeps both in sync (seeks both)
- **Frame counter** — A's current time

> **Audio:** only A plays audio. B is muted on purpose, so you don't
> hear two slightly-offset copies echoing.

### Closing compare

Click **Close** in the header (or hit `Esc` if you're in fullscreen).
The main player stays paused — hit play yourself when you're ready.

> **Pro workflow:** color review of a v2 vs v1.
> 1. Pick A=v1, B=v2 in the dropdowns.
> 2. Wipe mode.
> 3. Play through. Drag the handle on a problem shot to verify the fix.
> 4. Close. Approve or leave a comment from the main player.

---

## 11. Approval workflow

Approvals turn "looks good" into a recorded decision.

### The three buttons (top-right of the player)

- **Mark as ready for review** — only visible while the project is in
  `draft`. Flips the project to `in_review` and notifies designated
  reviewers by email. Use this when the cut is done and you want
  feedback.
- **Approve** — records your approval on the current file/version.
  If you're the final approver the project status becomes `approved`.
- **Request changes** — records a "needs work" decision. The project
  goes to `changes_requested` and a notification fires.

### Who can approve

By default any logged-in user with edit access on the project. Admins
can approve any project. Public reviewers (share link users) can
approve **only if** the share link is configured to allow it (see
[§12](#12-sharing-with-reviewers-public-links)).

### Approval history

Each approval is recorded with: who, when, which version, the
decision, and an optional note. Visible in the **Activity** section
of the project page.

> **Recommended workflow:**
> 1. Editor uploads v1, marks the project ready for review.
> 2. Reviewers leave timestamped comments.
> 3. Editor uploads v2 addressing comments.
> 4. Reviewer compares v1 ↔ v2 (wipe mode), spot-checks fixes.
> 5. Reviewer hits **Approve**.
> 6. Editor exports markers (just for archive) and ships.

---

## 12. Sharing with reviewers (public links)

Send a single URL to anyone — they review without an Obviu account.

### Creating a share link

1. From the project page (or any file): click **Share** (the share
   icon, paper-airplane-with-link).
2. Choose the scope:
   - **Project** — link gives access to all files in the project
   - **File** — link gives access to one file
3. Configure the link options (described below).
4. Click **Create**. The URL is copied to your clipboard.

### Link options

| Option | Default | What it does |
|---|---|---|
| **Password** *(optional)* | none | Reviewer must enter this before viewing. Use for sensitive content. |
| **Expires** *(optional)* | none | After this date/time the link returns "expired." |
| **Allow downloads** | OFF | Lets reviewers download the original file. |
| **Allow comments** | ON | Lets reviewers leave timestamped comments. |
| **Require reviewer email** | (your default) | Reviewer must provide name + email before viewing. Their comments are then attributed to that email. |
| **Reviewer label** *(optional)* | auto | Custom name shown on their comments instead of "auto from email + timestamp." |

### Sharing the link

The URL looks like `https://tbn.obviu.io/s/Ab12CdEf34GhIj56`. Send it
in email/Slack/wherever. The reviewer opens it, optionally enters
password + email, and lands on a stripped-down player with comment
support.

### Revoking / editing a link

Same dialog → existing links are listed. Each row has:
- **Open** — preview as a reviewer would
- **Copy** — re-copy the URL
- **Set/clear password**
- **Set/clear expiry**
- **Toggle download / comments / require-email**
- **Revoke** — kill the link permanently

Expired links show a red label. Revoked links return "this link is
no longer active."

### What the reviewer sees on a public link

- The player (no admin chrome, no project sidebar)
- All versions of the file (or all files of the project)
- The comment box (if comments allowed) with timestamps
- Drawing annotations work the same as for editors
- Download button (if allowed)
- Approve / Request changes (if you've enabled approvals on the link)

> **Example email to a reviewer:**
> "Hi Sarah, the v3 cut is ready for your review. Public link:
> `https://tbn.obviu.io/s/Ab12...` (password: `cobble26`). Please
> leave timestamped notes by Friday. Thanks."

---

## 13. Exporting markers to your NLE

Every timestamped comment becomes a marker. Export them once you're
done reviewing and bring them straight into your edit.

### Where the export button lives

Open the file in the player → **Export** dropdown in the header
(arrow-down icon labeled "Export").

### The three formats

| Format | Use for | What you get |
|---|---|---|
| **FCP XML** | **Premiere Pro, DaVinci Resolve**, Final Cut Pro | An XML file with markers at each timestamp. Import into Premiere/Resolve via *File → Import* and drop the timeline marker track onto your sequence. |
| **EDL** (CMX 3600) | Avid Media Composer, older NLEs | A `.edl` file with marker comments. Import as a marker EDL. |
| **CSV** | Spreadsheets, custom pipelines, archive | Plain CSV: `timecode, author, comment, resolved`. Open in Excel/Sheets/Numbers. |

Frames per second is assumed to be 30 by default — if your project is
24/25/29.97/60, **set the frame rate in your NLE timeline** to match
before importing markers; otherwise the timecodes will drift.

### What's in a marker

- **Timecode** — the comment's timestamp (HH:MM:SS:FF)
- **Author** — who left the comment (internal name or
  `external: reviewer@example.com`)
- **Comment text** — the full comment body
- **Resolved status** — column in CSV; comment text suffix in EDL/XML

Replies are flattened — each reply becomes its own marker at the same
timecode as its parent.

> **Premiere example:**
> 1. Hit **Export → FCP XML**. Save `Cobble-Ep12-v3-notes.xml`.
> 2. In Premiere: *File → Import → Cobble-Ep12-v3-notes.xml*.
> 3. Premiere creates a sequence with the markers attached.
> 4. Open *Window → Markers* to see them as a list. Click any marker
>    to jump.
>
> **Resolve example:**
> 1. Same XML import, *File → Import Timeline → Pre-Conformed XML*.
> 2. Markers land on the timeline marker bar.
>
> **Avid example:**
> 1. Export EDL.
> 2. *File → Import → EDL*. Choose "Import as markers."

### Bulk export

Currently per-file. To export markers for an entire project, export
each file individually.

---

## 14. AI features: synopsis, chapters, transcript

Each video/audio file gets three auto-generated AI tabs (when the
backend AI worker is enabled):

### Transcript

Right panel → **Transcript** tab.

- Auto-generated from the audio. Each line is a clickable timestamp.
- Click a line → the player seeks to that timestamp.
- Use it to find a specific moment by what was said.
- **Regenerate** button (top-right of the tab) — re-runs transcription
  if you suspect a bad result or you re-uploaded a different language.
- The transcript is also what powers synopsis and chapters; if it's
  bad, regenerate it before regenerating those.

### Synopsis

Right panel → **AI** tab → **Synopsis** section.

- A 1–3 paragraph plain-English summary of the file.
- Useful for: project descriptions, social copy, quickly briefing
  someone who hasn't watched.
- **Regenerate** button — re-runs the LLM on the current transcript.

### Chapters

Right panel → **AI** tab → **Chapters** section.

- Timestamped chapter list ("0:00 Intro / 2:14 Main story / ...").
- Click any chapter timestamp → player seeks.
- Use them to: structure long-form content, generate YouTube chapter
  markers, find segments quickly.
- **Regenerate** button — same idea.

### When AI tabs are empty

- "Transcript not yet generated" — wait for processing to complete
  (visible on the file card as a "Processing…" badge).
- "Open the Transcript tab to start one" — synopsis/chapters depend
  on transcript. Start the transcript first.

---

## 15. Downloads and quality switching

### Quality toggle (in the player)

`720p proxy` ↔ `Original` toggle in the controls bar. Tooltip shows
which one you're playing.

- **Proxy** is the default. It's smooth on any connection, scrubs
  instantly, and is the right choice for note-taking.
- **Original** is the actual uploaded file. Use it for color-critical
  review, audio review, or to confirm a specific defect that might be
  caused by the proxy encode.

The proxy is always 720p H.264. Original quality is whatever you
uploaded.

### Downloading a file

If you have edit access (or you're on a share link with downloads
allowed):

- **Player** → **⋯** menu → **Download**
- **File grid** → file thumbnail hover → **download icon**

You always download the **original** file, never the proxy.

### Frame export (single still)

Pause on the frame you want, then in the **⋯** menu → **Save frame**.
Downloads a PNG of the current frame (not the proxy — the original
quality).

---

## 16. End-to-end example workflows

Three realistic editor workflows from start to ship.

### Workflow A — Internal review with one external client

**Scene:** finished a 5-minute brand spot, need internal QC then
external client sign-off.

1. **Upload v1** to project `Acme Q2 Spot`. Custom name:
   `acme-q2-spot-v1.mp4`.
2. **Mark as ready for review.** Internal reviewers (added in project
   settings) get an email.
3. **Internal pass:** Color lead leaves 4 timestamped comments, two
   with red-arrow drawings.
4. **You upload v2** addressing them. In the upload note: "v2
   addresses comments 1–4 from v1."
5. **Compare v1 ↔ v2 in wipe mode**, confirm the fixes.
6. **Internal approves.** Status flips to `approved` (internally).
7. **Create a public share link** for the client:
   - Password: `acme26`
   - Expires: 7 days from now
   - Allow downloads: OFF
   - Allow comments: ON
   - Require reviewer email: ON
8. **Send the URL** to the client.
9. Client leaves 1 comment ("Logo too small at 0:42"). They appear in
   your comments list with their email and "External" badge.
10. **Upload v3** with the fix.
11. Client opens the same link, sees v3 (links resolve to latest),
    hits **Approve**.
12. **Export FCP XML** for archive (in case you ever need to revisit
    notes in the timeline).
13. **Download original v3**, deliver to the client.

### Workflow B — Long-form sermon series

**Scene:** weekly 45-minute sermon, need transcript + chapters for
YouTube.

1. **Upload** the master cut.
2. Wait for processing to finish. AI worker generates transcript,
   synopsis, chapters automatically.
3. Open the **AI tab → Chapters**. Skim the chapter list. If
   timestamps look reasonable, copy the list.
4. (Optional) **AI tab → Synopsis**. Copy as the YouTube description.
5. (Optional) **Transcript tab** → click a line to spot-check audio
   quality.
6. **Export CSV** of any markers you left for the audio engineer.
7. **Download original** for upload to YouTube. Paste chapters as
   timestamped lines in the YouTube description.

### Workflow C — Documentary cut iteration

**Scene:** 90-minute doc, multiple rounds of director feedback.

1. **Upload v1.** Create a public share link for the director. Allow
   comments. Disable downloads.
2. Director leaves ~30 timestamped comments + 5 drawings over the
   week.
3. **Filter Comments → Unresolved.** Work through each in JKL shuttle
   mode. As you fix each one, mark it resolved.
4. **Upload v2.** Don't lose v1's comments — they stay attached to v1
   forever.
5. **Compare** v1↔v2 in side-by-side mode for structural changes,
   wipe mode for shot-level changes.
6. Director re-reviews v2 on the same link. New comments are scoped
   to v2.
7. Repeat.
8. Final: **Export FCP XML** of resolved-marker history per version
   for the archive. Each version's markers are exported separately.

---

## 17. Troubleshooting

### "Video won't play / black screen"

- Check the file card on the project page. If it says "Processing,"
  the proxy isn't ready yet. Wait or refresh.
- If processing is **stuck** for over an hour, ping your admin.
- Try toggling **Quality** to **Original** — sometimes the proxy
  failed but the original works.

### "Upload stuck at 99%"

- If it's a chunked upload (file ≥ 100 MB), one chunk's finalize step
  is concatenating server-side. Multi-GB files can take 30–60s here.
- If it stays >5 min, cancel and retry. The system cleans up orphan
  parts automatically after an hour.

### "Comments aren't appearing"

- Refresh. Comment list polls but a forced refresh resolves any
  stuck cache.
- Check the **Filter** dropdown — you might be on "Unresolved" or
  "Mine."

### "Drawing annotation looks misaligned"

- The annotation canvas is sized to the playback container. If you
  draw in fullscreen and re-open in a small window the drawing
  rescales — that's expected. The geometry is stored as percentages.

### "JKL shuttle keeps going after I tap K"

- `K` should always pause. If it doesn't: click the player area once
  to make sure focus is on the player, not in a textarea, then `K`
  again.

### "Compare audio is echoing"

- Should not happen — only A's audio plays. If it does, the main
  player wasn't paused when compare opened. Close compare, hit
  `Space` to pause the main player explicitly, re-open compare.

### "I can't approve / I don't see the buttons"

- You probably don't have edit access on this project. Ask the
  project owner or an admin to add you, or to send you a share link
  with approval permission.

### "I exported FCP XML but Premiere markers are at the wrong time"

- Frame rate mismatch. The export assumes 30 fps. Set your Premiere
  sequence to 30 fps before importing, or open the CSV instead and
  re-time the markers manually.

### "Public reviewer says the link is expired"

- Open the share dialog, find the link, check the expiry. If it's
  past, click **Set expires** and pick a new date, or revoke and
  create a fresh one.

### "Reviewer can't see the latest version"

- Share links always resolve to the latest version. Have the
  reviewer hard-refresh (Cmd/Ctrl+Shift+R). If they still see the
  old version it's their browser cache.

---

## Quick reference card (print this)

```
PLAYBACK            ANNOTATION/COMMENT        NAVIGATION
Space  play/pause   C    focus comment        ←/→     1-frame nudge
K      pause        Pen  draw on frame        Shift+←/→  10-frame
J/L    shuttle      I/O  set in/out           Cmd+Shift+←/→  prev/next file
M      mute         Enter submit comment      Home / End  start / end
F      fullscreen
Esc    exit FS

VERSIONS                          REVIEW
Right panel → Versions tab        Approve, Request changes, Mark for review
Compare icon → wipe / side-by-side  Share icon → public links
                                  Export → FCP XML / EDL / CSV
```

---

*Questions, bugs, feature requests: ping your Obviu admin.*
