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
};

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
  list.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const projects = preloaded || (await api("/api/v1/projects"));
    if (!projects.length) {
      list.innerHTML = '<div class="empty">No projects.</div>';
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
  } catch (e) {
    list.innerHTML = '<div class="error"></div>';
    list.querySelector(".error").textContent = e.message;
  }
}

// ---------- files & folders ----------
async function goFiles(project, folderId) {
  stopPoll();
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
      const back = document.createElement("button");
      back.className = "link";
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
  $("commentInput").value = "";
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
  const btn = document.createElement("button");
  btn.textContent = "Post reply";
  btn.onclick = async () => {
    const content = ta.value.trim();
    if (!content) return;
    btn.disabled = true;
    try {
      await api("/api/v1/files/" + state.selectedVersionId + "/comments", {
        method: "POST",
        body: { content, parentId: parent.id },
      });
      await loadComments();
    } catch (e) {
      $("fileStatus").textContent = "Reply failed: " + e.message;
      btn.disabled = false;
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
  btn.disabled = true;
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
    btn.disabled = false;
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
    const outFile = await tmp.createFile(name, { overwrite: true });
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

// ---------- wire up ----------
function init() {
  loadCreds();
  $("btnConnect").onclick = signIn;
  $("btnSignOut").onclick = signOut;
  $("btnBackProjects").onclick = () => goProjects();
  $("btnBackFiles").onclick = () => goFiles(state.project, state.currentFolderId);
  $("btnRefresh").onclick = loadComments;
  $("btnImport").onclick = importToPremiere;
  $("btnPullMarkers").onclick = pullMarkers;
  $("btnShare").onclick = copyShareLink;
  $("btnApprove").onclick = () => review("approved");
  $("btnRequest").onclick = () => review("requested_changes");
  $("btnPostComment").onclick = postComment;

  if (state.baseUrl) $("baseUrl").value = state.baseUrl;
  if (state.token) {
    reconnect();
  } else {
    show("view-auth");
  }
}

init();
