/*
 * Obviu Review — Premiere Pro UXP panel (Phase 1, read-only).
 *
 * Connects to an Obviu workspace via a personal API token and lets editors:
 *   - browse projects -> files -> versions
 *   - pull comments onto the active sequence as markers (colored by status)
 *   - jump the playhead to a comment's timestamp
 *   - auto-refresh comments every 30s
 *
 * The Premiere DOM is reached via require("premierepro"). The exact marker /
 * playhead API surface has changed across Premiere builds; the calls below
 * target the 25.6+ UXP API and are wrapped so a mismatch surfaces a readable
 * message instead of silently failing. See README.md.
 */

let ppro = null;
try {
  ppro = require("premierepro");
} catch (e) {
  // Running outside Premiere (e.g. a plain browser for layout work).
  ppro = null;
}

const POLL_MS = 30000;

const state = {
  baseUrl: "",
  token: "",
  user: null,
  project: null,
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
async function api(path) {
  const res = await fetch(state.baseUrl + path, {
    headers: { Authorization: "Bearer " + state.token },
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
      el.innerHTML =
        '<div class="title"></div><div class="meta"></div>';
      el.querySelector(".title").textContent = p.name || "Untitled";
      el.querySelector(".meta").textContent = p.description || "";
      el.onclick = () => goFiles(p);
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = '<div class="error"></div>';
    list.querySelector(".error").textContent = e.message;
  }
}

// ---------- files ----------
async function goFiles(project) {
  stopPoll();
  state.project = project;
  show("view-files");
  $("filesTitle").textContent = project.name || "Files";
  const list = $("filesList");
  list.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const files = await api("/api/v1/projects/" + project.id + "/files");
    if (!files.length) {
      list.innerHTML = '<div class="empty">No files.</div>';
      return;
    }
    list.innerHTML = "";
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
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = '<div class="error"></div>';
    list.querySelector(".error").textContent = e.message;
  }
}

// ---------- file detail ----------
async function goFile(file) {
  show("view-file");
  $("fileTitle").textContent = file.filename || file.name || "File";
  $("fileStatus").textContent = "";
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
  list.innerHTML = "";
  state.comments.forEach((c) => {
    const st = statusOf(c);
    const el = document.createElement("div");
    el.className = "item comment";
    const hasTime = c.timestamp != null;
    el.innerHTML =
      '<div class="top"><span><span class="dot ' +
      st +
      '"></span><b class="who"></b></span>' +
      (hasTime ? '<span class="jump"></span>' : "") +
      "</div><div class=\"body\"></div>";
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
    list.appendChild(el);
  });
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

async function getActiveSequence() {
  requirePremiere();
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Open a project in Premiere first.");
  const seq = await project.getActiveSequence();
  if (!seq) throw new Error("Open a sequence in Premiere first.");
  return { project, seq };
}

// Premiere marker color indices.
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
  $("btnBackFiles").onclick = () => goFiles(state.project);
  $("btnRefresh").onclick = loadComments;
  $("btnPullMarkers").onclick = pullMarkers;

  if (state.baseUrl) $("baseUrl").value = state.baseUrl;
  if (state.token) {
    reconnect();
  } else {
    show("view-auth");
  }
}

init();
