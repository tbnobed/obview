import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import PublicSharePage from "@/pages/public-share-page";
import MultiSharePage from "@/pages/multi-share-page";
import NotFound from "@/pages/not-found";

type Resolved = "multi" | "legacy" | "notfound" | "loading";

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
        if (multi.ok) { setResolved("multi"); return; }

        const legacy = await fetch(`/api/share/${encodeURIComponent(token)}/metadata`, {
          credentials: "include",
        });
        if (cancelled) return;
        setResolved(legacy.ok ? "legacy" : "notfound");
      } catch {
        if (!cancelled) setResolved("notfound");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (resolved === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-900 text-white">
        <div className="text-sm opacity-70">Loading shared content...</div>
      </div>
    );
  }
  if (resolved === "multi") return <MultiSharePage />;
  if (resolved === "legacy") return <PublicSharePage />;
  return <NotFound />;
}
