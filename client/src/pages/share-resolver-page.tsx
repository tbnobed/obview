import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import PublicSharePage from "@/pages/public-share-page";
import MultiSharePage from "@/pages/multi-share-page";
import NotFound from "@/pages/not-found";

type Resolved = "multi" | "legacy" | "notfound" | "loading" | "redirecting";

// Canonical app host baked in at build time (e.g. https://tbn.obviu.io).
// Used to cross-host redirect signed-in viewers off the short-link host
// (t.obviu.io) onto the main app, since the short-link host's nginx may
// not proxy /api/user or the authenticated app routes. Empty string ->
// stay on current host (dev / replit / single-host setups).
const APP_BASE = (import.meta.env.VITE_APP_BASE_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, "") ?? "";

function buildAuthedTarget(info: {
  scopeType: "project" | "folder" | "file";
  scopeId: number;
  fileProjectId?: number | null;
  folderProjectId?: number | null;
}, presetFile: string | null): string | null {
  if (info.scopeType === "project") {
    return presetFile
      ? `/projects/${info.scopeId}?media=${presetFile}`
      : `/projects/${info.scopeId}`;
  }
  if (info.scopeType === "file" && info.fileProjectId) {
    return `/projects/${info.fileProjectId}?media=${info.scopeId}`;
  }
  if (info.scopeType === "folder") {
    if (info.folderProjectId) {
      return `/projects/${info.folderProjectId}?folder=${info.scopeId}`;
    }
    return `/folders/${info.scopeId}`;
  }
  return null;
}

export default function ShareResolverPage() {
  const [, params] = useRoute<{ token: string }>("/:token");
  const token = params?.token ?? "";
  const [resolved, setResolved] = useState<Resolved>("loading");

  useEffect(() => {
    let cancelled = false;
    if (!token) { setResolved("notfound"); return; }
    setResolved("loading");
    (async () => {
      try {
        const multi = await fetch(`/api/public/share/${encodeURIComponent(token)}/info`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (multi.ok) {
          // Server-side cookie check: the same session cookie that would
          // make the user "logged in" in the main app is required here.
          // If the info endpoint says the viewer is authenticated, skip
          // mounting the public page entirely and send them straight to
          // the authenticated app — cross-host if APP_BASE is configured,
          // in-app pushState otherwise.
          const info = await multi.json().catch(() => null);
          const authed = !!info?.viewerAuthenticated;
          const expired = !!info?.expired;
          if (info && authed && !expired) {
            const search = new URLSearchParams(window.location.search);
            const presetFile = search.get("file");
            const path = buildAuthedTarget(info, presetFile);
            if (path) {
              setResolved("redirecting");
              const target = APP_BASE ? `${APP_BASE}${path}` : path;
              // Full-page navigation. Wouter's setLocation only does
              // pushState on the current host, which fails when the
              // short-link host doesn't serve the authenticated app.
              window.location.replace(target);
              return;
            }
          }
          setResolved("multi");
          return;
        }

        const legacy = await fetch(`/api/share/${encodeURIComponent(token)}/metadata`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (legacy.ok) {
          // Same trick for the legacy file-share path: if the metadata
          // includes the parent project id and we're authed (best-effort
          // check via /api/user — the legacy endpoint doesn't expose a
          // viewerAuthenticated flag), redirect cross-host.
          const meta = await legacy.json().catch(() => null);
          if (meta?.projectId && meta?.id) {
            try {
              const me = await fetch(`/api/user`, { credentials: "include" });
              if (me.ok) {
                setResolved("redirecting");
                const path = `/projects/${meta.projectId}?media=${meta.id}`;
                const target = APP_BASE ? `${APP_BASE}${path}` : path;
                window.location.replace(target);
                return;
              }
            } catch {
              // fall through to public page
            }
          }
          setResolved("legacy");
          return;
        }
        setResolved("notfound");
      } catch {
        if (!cancelled) setResolved("notfound");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (resolved === "loading" || resolved === "redirecting") {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-900 text-white">
        <div className="text-sm opacity-70">
          {resolved === "redirecting" ? "Opening…" : "Loading shared content..."}
        </div>
      </div>
    );
  }
  if (resolved === "multi") return <MultiSharePage />;
  if (resolved === "legacy") return <PublicSharePage />;
  return <NotFound />;
}
