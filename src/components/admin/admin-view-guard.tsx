"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Admin pages need admin view on. When an admin opens one directly, turn it
 * on first, then show the page, so nothing on it fails with Forbidden.
 */
export function AdminViewGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = (await fetch("/api/auth/me").then((r) => r.json()).catch(() => null)) as {
        session?: { role?: string; adminView?: boolean };
      } | null;
      const role = me?.session?.role;
      const isAdmin = role === "tech_admin" || role === "coach_admin";
      if (!isAdmin) {
        if (!cancelled) setState("denied");
        return;
      }
      if (!me?.session?.adminView) {
        await fetch("/api/auth/admin-view", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ adminView: true }),
        });
        router.refresh();
      }
      if (!cancelled) setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state === "checking") {
    return <p className="text-sm text-muted">Opening admin tools...</p>;
  }
  if (state === "denied") {
    return (
      <p className="rounded-2xl bg-white p-5 text-sm text-ink">
        These tools are for Dr. B and Jainam. If you need something here, ask one of them.
      </p>
    );
  }
  return <>{children}</>;
}
