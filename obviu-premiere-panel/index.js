/*
 * Obviu Review — Premiere Pro UXP panel.
 *
 * Connects to an Obviu workspace via the user's account and lets editors:
 *   - browse projects -> folders -> files -> versions
 *   - import the selected media straight into the active Premiere project
 *   - read comments, post comments/replies, resolve, and approve / request
 *     changes — all without leaving Premiere
 *   - pull comments onto the active sequence as markers (colored by status)
 *   - jump the playhead to a comment's timestamp
 *   - copy a share link for the current file
 *   - auto-refresh comments every 30s
 *
 * The Premiere DOM is reached via require("premierepro"). The exact marker /
 * playhead / import API surface has changed across Premiere builds; the calls
 * below target the 25.6+ UXP API and are wrapped so a mismatch surfaces a
 * readable message instead of silently failing. See README.md.
 */

let ppro = null;
let uxp = null;
try {
  ppro = require("premierepro");
} catch (e) {
  // Running outside Premiere (e.g. a plain browser for layout work).
  ppro = null;
}
try {
  uxp = require("uxp");
} catch (e) {
  uxp = null;
}
// UXP's Node-like fs module supports positional reads (open/read/close with a
// byte offset), unlike storage File.read which loads the whole file into one
// buffer. We use it to stream multi-GB exports chunk-by-chunk on upload.
let uxpFs = null;
try {
  uxpFs = require("fs");
} catch (e) {
  uxpFs = null;
}

const POLL_MS = 30000;

const state = {
  baseUrl: "",
  token: "",
  user: null,
  project: null,
  folders: [],
  currentFolderId: null, // null = project root (no subfolder)
  file: null,
  versions: [],
  selectedVersionId: null,
  comments: [],
  pollTimer: null,
  presetPath: "",
  presetName: "",
};

// 16 MB chunks for the resumable upload, matching the web client so the
// server sees identical traffic shapes on either path.
const TUS_CHUNK = 16 * 1024 * 1024;

// ---------- storage ----------
function loadCreds() {
  state.baseUrl = (localStorage.getItem("obviu.baseUrl") || "").replace(/\/+$/, "");
  state.token = localStorage.getItem("obviu.token") || "";
}
function saveCreds(baseUrl, token) {
  state.baseUrl = baseUrl.replace(/\/+$/, "");
  state.token = token;
  localStorage.setItem("obviu.baseUrl", state.baseUrl);
  localStorage.setItem("obviu.token", state.token);
}
function clearCreds() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("obviu.token");
}

// ---------- API ----------
async function api(path, opts) {
  const o = opts || {};
  const headers = { Authorization: "Bearer " + state.token };
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(state.baseUrl + path, {
    method: o.method || "GET",
    headers,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  });
  if (res.status === 401) throw new Error("Unauthorized — check your token.");
  if (!res.ok) {
    let msg = res.status + " " + res.statusText;
    try {
      const j = await res.json();
      if (j && j.message) msg = j.message;
    } catch (_) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- view switching ----------
function show(id) {
  ["view-auth", "view-projects", "view-files", "view-file"].forEach((v) => {
    document.getElementById(v).classList.toggle("hidden", v !== id);
  });
}
function $(id) {
  return document.getElementById(id);
}

// ---------- auth ----------
// Editors sign in with their normal Obviu account. The server mints an
// independent per-login token (api_session) and returns it once; we store it
// for this machine and use it as the bearer for all subsequent calls.
async function signIn() {
  const baseUrl = $("baseUrl").value.trim();
  const username = $("username").value.trim();
  const password = $("password").value;
  $("authError").textContent = "";
  if (!baseUrl || !username || !password) {
    $("authError").textContent = "Enter the server URL, your username/email and password.";
    return;
  }
  state.baseUrl = baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(state.baseUrl + "/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      let msg = "Sign in failed.";
      try {
        const j = await res.json();
        if (j && j.message) msg = j.message;
      } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    saveCreds(state.baseUrl, data.token);
    state.user = data.user || null;
    $("password").value = "";
    state.project = null;
    await goProjects();
  } catch (e) {
    $("authError").textContent = e.message;
  }
}

// Validate a stored token on launch. If it's stale (signed out elsewhere or
// revoked), fall back to the sign-in screen.
async function reconnect() {
  try {
    const projects = await api("/api/v1/projects");
    state.project = null;
    await goProjects(projects);
  } catch (e) {
    clearCreds();
    show("view-auth");
  }
}

async function signOut() {
  stopPoll();
  try {
    if (state.token) {
      await fetch(state.baseUrl + "/api/v1/logout", {
        method: "POST",
        headers: { Authorization: "Bearer " + state.token },
      });
    }
  } catch (_) {}
  clearCreds();
  show("view-auth");
}

// ---------- projects ----------
async function goProjects(preloaded) {
  stopPoll();
  show("view-projects");
  $("meLabel").textContent = state.user
    ? state.user.name + " · " + state.baseUrl.replace(/^https?:\/\//, "")
    : state.baseUrl.replace(/^https?:\/\//, "");
  const list = $("projectsList");
  const search = $("projectSearch");
  if (search) search.value = "";
  list.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const projects = preloaded || (await api("/api/v1/projects"));
    state.projects = projects;
    renderProjects("");
  } catch (e) {
    list.innerHTML = '<div class="error"></div>';
    list.querySelector(".error").textContent = e.message;
  }
}

function renderProjects(query) {
  const list = $("projectsList");
  const all = state.projects || [];
  const q = (query || "").trim().toLowerCase();
  const projects = q
    ? all.filter((p) =>
        ((p.name || "") + " " + (p.description || "")).toLowerCase().includes(q),
      )
    : all;
  if (!all.length) {
    list.innerHTML = '<div class="empty">No projects.</div>';
    return;
  }
  if (!projects.length) {
    list.innerHTML = '<div class="empty">No matching projects.</div>';
    return;
  }
  list.innerHTML = "";
  projects.forEach((p) => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = '<div class="title"></div><div class="meta"></div>';
    el.querySelector(".title").textContent = p.name || "Untitled";
    el.querySelector(".meta").textContent = p.description || "";
    el.onclick = () => goFiles(p, null);
    list.appendChild(el);
  });
}

// ---------- files & folders ----------
async function goFiles(project, folderId) {
  stopPoll();
  resetPreview();
  state.project = project;
  state.currentFolderId = folderId == null ? null : folderId;
  show("view-files");
  $("filesTitle").textContent = project.name || "Files";

  const foldersEl = $("foldersList");
  const filesEl = $("filesList");
  const crumb = $("breadcrumb");
  foldersEl.innerHTML = "";
  filesEl.innerHTML = '<div class="empty">Loading…</div>';

  try {
    // Load folder tree once per project.
    if (!state.folders.length || state.folders._projectId !== project.id) {
      const folders = await api("/api/v1/projects/" + project.id + "/folders");
      folders._projectId = project.id;
      state.folders = folders;
    }

    // Breadcrumb.
    if (state.currentFolderId == null) {
      crumb.textContent = "";
    } else {
      const cur = state.folders.find((f) => f.id === state.currentFolderId);
      crumb.innerHTML = "";
      const back = document.createElement("a");
      back.className = "btn link";
      back.textContent = "← All files";
      back.onclick = () => goFiles(project, null);
      crumb.appendChild(back);
      const label = document.createElement("span");
      label.textContent = "  /  " + (cur ? cur.name : "Folder");
      crumb.appendChild(label);
    }

    // Show subfolders that live under the current folder.
    const children = state.folders.filter(
      (f) => (f.parentFolderId ?? null) === (state.currentFolderId ?? null)
    );
    children.forEach((f) => {
      const el = document.createElement("div");
      el.className = "item folder";
      el.innerHTML = '<div class="title"></div>';
      el.querySelector(".title").textContent = f.name || "Folder";
      el.onclick = () => goFiles(project, f.id);
      foldersEl.appendChild(el);
    });

    // Files scoped to the current folder ("root" = no subfolder).
    const scope = state.currentFolderId == null ? "root" : String(state.currentFolderId);
    const files = await api(
      "/api/v1/projects/" + project.id + "/files?folderId=" + scope
    );
    if (!files.length && !children.length) {
      filesEl.innerHTML = '<div class="empty">Nothing here.</div>';
      return;
    }
    filesEl.innerHTML = "";
    files.forEach((f) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = '<div class="title"></div><div class="meta"></div>';
      el.querySelector(".title").textContent = f.filename || f.name || "File";
      const bits = [];
      if (f.reviewStatus) bits.push(f.reviewStatus);
      if (f.version) bits.push("v" + f.version);
      el.querySelector(".meta").textContent = bits.join(" · ");
      el.onclick = () => goFile(f);
      filesEl.appendChild(el);
    });
  } catch (e) {
    filesEl.innerHTML = '<div class="error"></div>';
    filesEl.querySelector(".error").textContent = e.message;
  }
}

// ---------- file detail ----------
async function goFile(file) {
  show("view-file");
  $("fileTitle").textContent = file.filename || file.name || "File";
  $("fileStatus").textContent = "";
  $("seqStatus").textContent = "";
  $("commentInput").value = "";
  resetPreview();
  const destLabel = $("destVersionLabel");
  if (destLabel) {
    destLabel.textContent = "New version of " + (file.filename || file.name || "this file");
  }
  if ($("destGroup")) $("destGroup").selected = "version";
  if ($("destVersion")) $("destVersion").checked = true;
  if ($("destNew")) $("destNew").checked = false;
  try {
    const detail = await api("/api/v1/files/" + file.id);
    state.file = detail;
    state.versions = detail.versions || [detail];
    // Default to the latest version.
    const latest =
      state.versions.find((v) => v.isLatestVersion) ||
      state.versions[state.versions.length - 1];
    state.selectedVersionId = latest ? latest.id : file.id;
    renderVersionSelect();
    previewMedia();
    await loadComments();
    startPoll();
  } catch (e) {
    $("fileStatus").textContent = e.message;
  }
}

function selectedFile() {
  return (
    state.versions.find((v) => v.id === state.selectedVersionId) || state.file
  );
}

function renderVersionSelect() {
  const sel = $("versionSelect");
  sel.innerHTML = "";
  state.versions
    .slice()
    .sort((a, b) => (a.version || 0) - (b.version || 0))
    .forEach((v) => {
      const opt = document.createElement("option");
      opt.value = String(v.id);
      opt.textContent =
        "v" + (v.version || 1) + (v.isLatestVersion ? " (latest)" : "");
      sel.appendChild(opt);
    });
  sel.value = String(state.selectedVersionId);
  sel.onchange = () => {
    state.selectedVersionId = Number(sel.value);
    loadComments();
    previewMedia();
  };
}

// ---------- comments ----------
// The /api/v1 comments endpoint exposes a single boolean `resolved` (derived
// from the comment's isResolved flag). Comments have no per-comment
// "changes requested" state in the data model, so status is open vs resolved.
function statusOf(c) {
  return c.resolved ? "resolved" : "open";
}

function fmtTime(sec) {
  if (sec == null) return "";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ":" + String(r).padStart(2, "0");
}

async function loadComments() {
  const list = $("commentsList");
  list.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const comments = await api(
      "/api/v1/files/" + state.selectedVersionId + "/comments"
    );
    state.comments = comments;
    renderComments();
  } catch (e) {
    list.innerHTML = '<div class="error"></div>';
    list.querySelector(".error").textContent = e.message;
  }
}

function renderComments() {
  const list = $("commentsList");
  if (!state.comments.length) {
    list.innerHTML = '<div class="empty">No comments.</div>';
    return;
  }
  // Group replies under their parent so threads read top-down.
  const top = state.comments.filter((c) => !c.parentId);
  const repliesByParent = {};
  state.comments
    .filter((c) => c.parentId)
    .forEach((c) => {
      (repliesByParent[c.parentId] = repliesByParent[c.parentId] || []).push(c);
    });
  list.innerHTML = "";
  const ordered = [];
  top.forEach((c) => {
    ordered.push({ c, child: false });
    (repliesByParent[c.id] || []).forEach((r) => ordered.push({ c: r, child: true }));
  });
  ordered.forEach(({ c, child }) => list.appendChild(commentEl(c, child)));
}

function commentEl(c, child) {
  const st = statusOf(c);
  const el = document.createElement("div");
  el.className = "item comment" + (child ? " child" : "");
  const hasTime = c.timestamp != null;
  el.innerHTML =
    '<div class="top"><span><span class="dot ' +
    st +
    '"></span><b class="who"></b></span>' +
    (hasTime ? '<span class="jump"></span>' : "") +
    '</div><div class="body"></div><div class="actions"></div>';
  el.querySelector(".who").textContent = c.authorName || "Reviewer";
  el.querySelector(".body").textContent = c.content || "";
  if (hasTime) {
    const j = el.querySelector(".jump");
    const range =
      c.outPoint != null && c.outPoint !== c.inPoint
        ? fmtTime(c.inPoint != null ? c.inPoint : c.timestamp) +
          "–" +
          fmtTime(c.outPoint)
        : fmtTime(c.timestamp);
    j.textContent = "▶ " + range;
    j.onclick = () => jumpTo(c.inPoint != null ? c.inPoint : c.timestamp);
  }

  const actions = el.querySelector(".actions");
  if (!child) {
    const reply = document.createElement("span");
    reply.className = "link";
    reply.textContent = "Reply";
    reply.onclick = () => toggleReply(el, c);
    actions.appendChild(reply);
  }
  const resolve = document.createElement("span");
  resolve.className = "link";
  resolve.textContent = c.resolved ? "Unresolve" : "Resolve";
  resolve.onclick = () => setResolved(c, !c.resolved);
  actions.appendChild(resolve);

  return el;
}

function toggleReply(parentEl, parent) {
  const existing = parentEl.querySelector(".reply-box");
  if (existing) {
    existing.remove();
    return;
  }
  const box = document.createElement("div");
  box.className = "reply-box";
  const ta = document.createElement("textarea");
  ta.rows = 2;
  ta.placeholder = "Reply…";
  const btn = document.createElement("a");
  btn.className = "btn";
  btn.textContent = "Post reply";
  btn.onclick = async () => {
    const content = ta.value.trim();
    if (!content) return;
    btn.classList.add("disabled");
    try {
      await api("/api/v1/files/" + state.selectedVersionId + "/comments", {
        method: "POST",
        body: { content, parentId: parent.id },
      });
      await loadComments();
    } catch (e) {
      $("fileStatus").textContent = "Reply failed: " + e.message;
      btn.classList.remove("disabled");
    }
  };
  box.appendChild(ta);
  box.appendChild(btn);
  parentEl.appendChild(box);
  ta.focus();
}

async function setResolved(comment, resolved) {
  try {
    await api("/api/v1/comments/" + comment.id, {
      method: "PATCH",
      body: { isResolved: resolved },
    });
    await loadComments();
  } catch (e) {
    $("fileStatus").textContent = "Update failed: " + e.message;
  }
}

async function postComment() {
  const content = $("commentInput").value.trim();
  if (!content) return;
  const btn = $("btnPostComment");
  btn.classList.add("disabled");
  $("fileStatus").textContent = "";
  const body = { content };
  if ($("commentAtTime").checked) {
    const t = await currentPlayheadSeconds();
    if (t != null) body.timestamp = t;
  }
  try {
    await api("/api/v1/files/" + state.selectedVersionId + "/comments", {
      method: "POST",
      body,
    });
    $("commentInput").value = "";
    $("commentAtTime").checked = false;
    await loadComments();
  } catch (e) {
    $("fileStatus").textContent = "Post failed: " + e.message;
  } finally {
    btn.classList.remove("disabled");
  }
}

// ---------- approvals ----------
async function review(status) {
  $("fileStatus").textContent = "";
  try {
    await api("/api/v1/files/" + state.selectedVersionId + "/approve", {
      method: "POST",
      body: { status },
    });
    $("fileStatus").textContent =
      status === "approved" ? "Approved." : "Changes requested.";
    await loadComments();
  } catch (e) {
    $("fileStatus").textContent = "Failed: " + e.message;
  }
}

// ---------- share link ----------
async function copyShareLink() {
  $("fileStatus").textContent = "";
  try {
    const link = await api(
      "/api/v1/files/" + state.selectedVersionId + "/share-links",
      { method: "POST", body: { allowComments: true } }
    );
    const url = state.baseUrl + "/s/" + link.token;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch (_) {}
    $("fileStatus").textContent = copied
      ? "Share link copied: " + url
      : "Share link: " + url;
  } catch (e) {
    $("fileStatus").textContent = "Share failed: " + e.message;
  }
}

// ---------- media preview ----------
// UXP's native <video> is a limited re-implementation; a <webview> embeds a
// real browser engine (WebView2 / WKWebView) with full HTML5 playback. We
// point it at the file's public share page so the editor gets the same player,
// scrubbing and comment timeline they'd see on the web — no media bytes pass
// through the panel itself.
async function previewMedia() {
  $("fileStatus").textContent = "";
  const view = $("mediaView");
  if (!view) return;
  if (!view._obviuWired) {
    view._obviuWired = true;
    view.addEventListener("load", () => console.log("[obviu] preview webview loaded"));
    view.addEventListener("error", (e) => {
      const detail = (e && (e.message || (e.detail && e.detail.message))) || "unknown error";
      console.error("[obviu] preview webview error:", detail, e);
      $("fileStatus").textContent = "Preview failed to load: " + detail;
    });
  }
  try {
    // Reuse an existing share link when there is one so repeated previews
    // don't pile up new public links — but only one that will actually play
    // straight away: not revoked, not expired, and not gated behind a password
    // or email (the panel can't drive the unlock flow). Otherwise mint one
    // (comments enabled to match the web review experience).
    let token = null;
    try {
      const existing = await api("/api/v1/files/" + state.selectedVersionId + "/share-links");
      if (Array.isArray(existing)) {
        const now = Date.now();
        const usable = existing.find(
          (l) =>
            l &&
            l.token &&
            !l.revokedAt &&
            !l.hasPassword &&
            !l.requireEmail &&
            (!l.expiresAt || new Date(l.expiresAt).getTime() > now)
        );
        if (usable) token = usable.token;
      }
    } catch (_) {}
    if (!token) {
      const link = await api("/api/v1/files/" + state.selectedVersionId + "/share-links", {
        method: "POST",
        body: { allowComments: true },
      });
      token = link.token;
    }
    // Load the dedicated, chrome-free panel player: /panel-player/<token>?file=<id>.
    // This route renders ONLY the video + scrubber with coloured comment markers —
    // no header, no comments sidebar, no filter tabs. It's a purpose-built page
    // (not the public review page), so there's nothing to strip and nothing that
    // can reappear. Comments themselves live in the panel's own list below; only
    // the timeline markers show in the player.
    view.src =
      state.baseUrl + "/panel-player/" + token + "?file=" + state.selectedVersionId;
  } catch (e) {
    $("fileStatus").textContent = "Preview failed: " + e.message;
  }
}

function resetPreview() {
  const view = $("mediaView");
  if (view) view.src = "";
}

// ---------- polling ----------
function startPoll() {
  stopPoll();
  state.pollTimer = setInterval(loadComments, POLL_MS);
}
function stopPoll() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

// ---------- Premiere integration ----------
function requirePremiere() {
  if (!ppro) throw new Error("Premiere API unavailable (run inside Premiere).");
}

async function getActiveProject() {
  requirePremiere();
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Open a project in Premiere first.");
  return project;
}

async function getActiveSequence() {
  const project = await getActiveProject();
  const seq = await project.getActiveSequence();
  if (!seq) throw new Error("Open a sequence in Premiere first.");
  return { project, seq };
}

async function currentPlayheadSeconds() {
  try {
    const { seq } = await getActiveSequence();
    const pos = await seq.getPlayerPosition();
    if (pos == null) return null;
    // TickTime exposes seconds either as a property or a getter across builds.
    if (typeof pos.seconds === "number") return pos.seconds;
    if (typeof pos.ticks === "number" && ppro.TickTime && ppro.TickTime.TICKS_PER_SECOND) {
      return pos.ticks / ppro.TickTime.TICKS_PER_SECOND;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Marker color indices.
const MARKER_COLOR = { open: 1 /* red */, resolved: 3 /* green */, changes: 2 /* orange */ };

async function jumpTo(sec) {
  try {
    const { seq } = await getActiveSequence();
    const t = ppro.TickTime.createWithSeconds(sec);
    await seq.setPlayerPosition(t);
  } catch (e) {
    $("fileStatus").textContent = "Jump failed: " + e.message;
  }
}

// Download the selected media and import it into the active Premiere project.
async function importToPremiere() {
  $("fileStatus").textContent = "Downloading…";
  try {
    const project = await getActiveProject();
    if (!uxp) throw new Error("UXP file API unavailable.");
    const file = selectedFile();
    const name = (state.file && state.file.filename) || "obviu-media";
    const res = await fetch(
      state.baseUrl + "/api/v1/files/" + state.selectedVersionId + "/download",
      { headers: { Authorization: "Bearer " + state.token } }
    );
    if (!res.ok) throw new Error("Download failed: " + res.status);
    const buf = await res.arrayBuffer();

    const tmp = await uxp.storage.localFileSystem.getTemporaryFolder();
    // Stage each import in a fresh subfolder. Reusing a fixed temp filename
    // fails with "resource busy or locked" once Premiere has imported (and so
    // locked) that exact path — a new folder per import sidesteps the lock and
    // keeps the clip's name clean (= the original filename).
    const sub = await tmp.createFolder("obviu-imp-" + state.selectedVersionId + "-" + Date.now());
    const outFile = await sub.createFile(name, { overwrite: true });
    await outFile.write(buf, { format: uxp.storage.formats.binary });
    const nativePath = outFile.nativePath;

    $("fileStatus").textContent = "Importing…";
    // importFiles(paths, suppressUI, targetBin, importAsNumberedStills).
    // rootItem is a property on some builds, a getter on others.
    let rootBin = null;
    try {
      rootBin = typeof project.getRootItem === "function"
        ? await project.getRootItem()
        : project.rootItem;
    } catch (_) {
      rootBin = null;
    }
    await project.importFiles([nativePath], true, rootBin, false);
    $("fileStatus").textContent = "Imported " + name + ".";
  } catch (e) {
    $("fileStatus").textContent = "Import failed: " + e.message;
  }
}

async function pullMarkers() {
  $("fileStatus").textContent = "";
  try {
    const { project, seq } = await getActiveSequence();
    const markers = await ppro.Markers.getMarkers(seq);
    let added = 0;
    for (const c of state.comments) {
      if (c.timestamp == null) continue;
      const start = c.inPoint != null ? c.inPoint : c.timestamp;
      const st = statusOf(c);
      const name = (c.authorName || "Reviewer") + ": " + (c.content || "").slice(0, 60);
      // Marker mutations run inside a transaction in the 25.6+ UXP API.
      await project.executeTransaction((compoundAction) => {
        const createAction = markers.createAddMarkerAction(
          ppro.TickTime.createWithSeconds(start),
          name,
          c.content || "",
          MARKER_COLOR[st]
        );
        compoundAction.addAction(createAction);
        if (c.outPoint != null && c.outPoint > start) {
          const dur = ppro.TickTime.createWithSeconds(c.outPoint - start);
          const durAction = markers.createSetMarkerDurationAction
            ? markers.createSetMarkerDurationAction(createAction, dur)
            : null;
          if (durAction) compoundAction.addAction(durAction);
        }
      });
      added++;
    }
    $("fileStatus").textContent = "Added " + added + " marker(s).";
  } catch (e) {
    $("fileStatus").textContent = "Pull failed: " + e.message;
  }
}

// ---------- sequence export & upload (send your cut) ----------

// UTF-8 safe base64 for tus Upload-Metadata values.
function b64(str) {
  return btoa(unescape(encodeURIComponent(String(str))));
}

// tus Upload-Metadata is "key b64val,key2 b64val2". Skip empty values.
function buildUploadMetadata(meta) {
  return Object.keys(meta)
    .filter((k) => meta[k] != null && meta[k] !== "")
    .map((k) => k + " " + b64(meta[k]))
    .join(",");
}

function guessMime(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v",
    mxf: "application/mxf", webm: "video/webm", mkv: "video/x-matroska",
    avi: "video/x-msvideo", wav: "audio/wav", mp3: "audio/mpeg",
    aac: "audio/aac", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  };
  return map[ext] || "video/mp4";
}

// Let the editor pick an Adobe export preset (.epr). AME needs a preset to
// know the container/codec; we remember the chosen one per machine. We store
// the native path string (re-usable directly by the encoder) rather than a
// persistent token to keep the encoder call simple.
async function pickPreset() {
  $("seqStatus").textContent = "";
  if (!uxp) {
    $("seqStatus").textContent = "UXP file API unavailable.";
    return;
  }
  try {
    const f = await uxp.storage.localFileSystem.getFileForOpening({ types: ["epr"] });
    if (!f) return;
    state.presetPath = f.nativePath;
    state.presetName = f.name;
    localStorage.setItem("obviu.presetPath", state.presetPath);
    localStorage.setItem("obviu.presetName", state.presetName);
    $("presetLabel").textContent = state.presetName;
  } catch (e) {
    $("seqStatus").textContent = "Preset pick failed: " + e.message;
  }
}

// Export the active sequence to outPath using the chosen preset. The Premiere
// UXP encode surface has shifted across builds, so we target the 25.6+ shape
// and surface a readable error on mismatch (see README).
async function exportSequence(project, seq, outPath, presetPath) {
  const EM = ppro.EncoderManager;
  if (!EM || typeof EM.getManager !== "function") {
    throw new Error("Encoder API unavailable on this Premiere build.");
  }
  const mgr = await EM.getManager();
  const exportType =
    ppro.Constants && ppro.Constants.ExportType && ppro.Constants.ExportType.IMMEDIATELY != null
      ? ppro.Constants.ExportType.IMMEDIATELY
      : 1;
  // exportSequence(sequence, exportType, outputPath, presetPath)
  return mgr.exportSequence(seq, exportType, outPath, presetPath);
}

// A chunk source over a rendered export file. `read(offset, length)` returns
// only that slice's bytes, so the whole file never sits in memory at once.
// Uses UXP's positional fs (open/read/close); returns null if unavailable so
// callers can fall back to a whole-file read for older builds / small exports.
async function openChunkReader(nativePath) {
  if (!uxpFs || typeof uxpFs.open !== "function" || typeof uxpFs.read !== "function") {
    return null;
  }
  let fd;
  let size;
  try {
    fd = await uxpFs.open(nativePath, "r");
    const stat = await (uxpFs.lstat ? uxpFs.lstat(nativePath) : uxpFs.stat(nativePath));
    size = typeof stat.size === "number" ? stat.size : Number(stat.size);
    if (!Number.isFinite(size)) throw new Error("Could not determine export size.");
  } catch (e) {
    if (fd != null && uxpFs.close) {
      try { await uxpFs.close(fd); } catch (_) {}
    }
    return null;
  }
  return {
    size,
    async read(offset, length) {
      const buffer = new ArrayBuffer(length);
      const result = await uxpFs.read(fd, buffer, 0, length, offset);
      const bytesRead = typeof result === "number" ? result : (result && result.bytesRead);
      if (Number.isFinite(bytesRead) && bytesRead < length) {
        return buffer.slice(0, bytesRead);
      }
      return buffer;
    },
    async close() {
      if (uxpFs.close) {
        try { await uxpFs.close(fd); } catch (_) {}
      }
    },
  };
}

// Fallback source backed by an in-memory ArrayBuffer (whole-file read). Used
// only when positional reads aren't available; slicing keeps the PATCH path
// identical to the streaming reader.
function bufferSource(arrayBuffer) {
  return {
    size: arrayBuffer.byteLength,
    async read(offset, length) {
      return arrayBuffer.slice(offset, offset + length);
    },
    async close() {},
  };
}

// Minimal resumable tus client: creation POST -> chunked PATCH, resyncing the
// offset from the server (HEAD) on transient failure. The completing PATCH
// returns 200 with the created file row (the server's onUploadFinish body).
// `source` is a chunk reader ({ size, read(offset, length), close() }) so the
// export is streamed slice-by-slice rather than held whole in memory.
async function tusUpload(source, metadata, onPct) {
  const total = source.size;
  const endpoint = state.baseUrl + "/api/uploads/tus";

  const createRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + state.token,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(total),
      "Upload-Metadata": buildUploadMetadata(metadata),
    },
  });
  if (createRes.status !== 201) {
    throw new Error("Upload create failed: " + createRes.status);
  }
  const location = createRes.headers.get("Location");
  if (!location) throw new Error("Upload create returned no Location.");
  const uploadUrl = /^https?:\/\//i.test(location)
    ? location
    : state.baseUrl + (location.startsWith("/") ? location : "/" + location);

  let offset = 0;
  let attempt = 0;
  let fileRow = null;
  while (offset < total) {
    const end = Math.min(offset + TUS_CHUNK, total);
    try {
      // Read only this slice from disk; on retry the offset is resynced from
      // HEAD first, so we re-read at the corrected position next iteration.
      const chunk = await source.read(offset, end - offset);
      const patchRes = await fetch(uploadUrl, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + state.token,
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: chunk,
      });
      if (patchRes.status !== 204 && patchRes.status !== 200) {
        throw new Error("chunk HTTP " + patchRes.status);
      }
      const advertised = Number(patchRes.headers.get("Upload-Offset"));
      offset = Number.isFinite(advertised) ? advertised : end;
      attempt = 0;
      if (onPct) onPct(total > 0 ? Math.floor((offset / total) * 100) : 0);
      // The PATCH that completes the upload returns the file row as JSON.
      if (patchRes.status === 200) {
        try { fileRow = await patchRes.json(); } catch (_) {}
      }
    } catch (e) {
      attempt++;
      if (attempt > 5) throw new Error("Upload stalled: " + e.message);
      try {
        const head = await fetch(uploadUrl, {
          method: "HEAD",
          headers: { Authorization: "Bearer " + state.token, "Tus-Resumable": "1.0.0" },
        });
        const ho = Number(head.headers.get("Upload-Offset"));
        if (Number.isFinite(ho)) offset = ho;
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return fileRow;
}

async function exportAndUpload() {
  $("seqStatus").textContent = "";
  const btn = $("btnExportUpload");
  const grp = $("destGroup");
  const asNew = (grp && grp.selected != null)
    ? grp.selected === "new"
    : $("destNew").checked;
  btn.classList.add("disabled");
  let source = null;
  try {
    requirePremiere();
    if (!uxp) throw new Error("UXP file API unavailable.");
    if (!state.presetPath) throw new Error("Choose an export preset (.epr) first.");
    const { project, seq } = await getActiveSequence();

    let seqName = "sequence";
    try {
      seqName = seq.name || (typeof seq.getName === "function" ? await seq.getName() : null) || "sequence";
    } catch (_) {}
    let baseName = $("exportName").value.trim() || seqName;
    if (!/\.[a-z0-9]{2,4}$/i.test(baseName)) baseName += ".mp4";

    // 1) Export to a temp file via the encoder / AME.
    $("seqStatus").textContent = "Exporting sequence…";
    const tmp = await uxp.storage.localFileSystem.getTemporaryFolder();
    // Export into a fresh subfolder so a prior render Premiere/AME still holds
    // open can't cause a "resource busy or locked" overwrite failure.
    const sub = await tmp.createFolder("obviu-exp-" + state.selectedVersionId + "-" + Date.now());
    const outFile = await sub.createFile(baseName, { overwrite: true });
    await exportSequence(project, seq, outFile.nativePath, state.presetPath);

    // 2) Open the rendered file for slice-by-slice reads so peak memory stays
    // bounded regardless of export size (multi-GB cuts). Prefer UXP's
    // positional fs; fall back to a whole-file read only where it's missing.
    $("seqStatus").textContent = "Reading render…";
    const rendered = await sub.getEntry(baseName);
    source = await openChunkReader(rendered.nativePath);
    if (!source) {
      const buf = await rendered.read({ format: uxp.storage.formats.binary });
      source = bufferSource(buf);
    }

    // 3) Build upload metadata. To stack a new version onto the selected
    // file, customFilename must equal that file's stack key (its filename)
    // and folderId must match its folder; the server then auto-versions and
    // demotes the prior latest. For a new file we omit customFilename so the
    // export name becomes its own stack key in the current folder.
    const meta = {
      filename: baseName,
      filetype: guessMime(baseName),
      projectId: String(state.project.id),
    };
    if (state.currentFolderId != null) meta.folderId = String(state.currentFolderId);
    if (!asNew && state.file) meta.customFilename = state.file.filename;

    // 4) Upload through the resumable path with the bearer token.
    $("seqStatus").textContent = "Uploading… 0%";
    const fileRow = await tusUpload(source, meta, (pct) => {
      $("seqStatus").textContent = "Uploading… " + pct + "%";
    });

    // 5) Refresh the view and offer a share link for the new version.
    if (fileRow && fileRow.id) {
      $("seqStatus").textContent =
        "Uploaded v" + (fileRow.version || "?") + ". Use Copy share link to share it.";
      await goFile({ id: fileRow.id, filename: fileRow.filename });
    } else {
      $("seqStatus").textContent = "Upload finished.";
      await goFiles(state.project, state.currentFolderId);
    }
  } catch (e) {
    $("seqStatus").textContent = "Failed: " + e.message;
  } finally {
    if (source) {
      try { await source.close(); } catch (_) {}
    }
    btn.classList.remove("disabled");
  }
}

// ---------- wire up ----------
function init() {
  loadCreds();
  $("btnConnect").onclick = signIn;
  $("btnSignOut").onclick = signOut;
  $("btnBackProjects").onclick = () => goProjects();
  $("projectSearch").oninput = (e) => renderProjects(e.target.value);
  $("btnBackFiles").onclick = () => goFiles(state.project, state.currentFolderId);
  $("btnRefresh").onclick = loadComments;
  $("btnImport").onclick = importToPremiere;
  $("btnPullMarkers").onclick = pullMarkers;
  $("btnShare").onclick = copyShareLink;
  $("btnApprove").onclick = () => review("approved");
  $("btnRequest").onclick = () => review("requested_changes");
  $("btnPostComment").onclick = postComment;
  $("btnPickPreset").onclick = pickPreset;
  $("btnExportUpload").onclick = exportAndUpload;
  $("btnToggleExport").onclick = () => {
    const collapsed = $("exportBody").classList.toggle("hidden");
    $("exportCaret").innerHTML = collapsed ? "&#9656;" : "&#9662;";
  };

  // Restore the remembered export preset, if any.
  state.presetPath = localStorage.getItem("obviu.presetPath") || "";
  state.presetName = localStorage.getItem("obviu.presetName") || "";
  if (state.presetName) $("presetLabel").textContent = state.presetName;

  if (state.baseUrl) $("baseUrl").value = state.baseUrl;
  if (state.token) {
    reconnect();
  } else {
    show("view-auth");
  }
}

init();
