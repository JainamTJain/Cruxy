"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageIntro } from "@/components/page-intro";

function ApproveInner() {
  const params = useSearchParams();
  const router = useRouter();
  const requestId = params.get("requestId");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!requestId) setMsg("Missing reset request.");
  }, [requestId]);

  async function approve() {
    if (!requestId) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/forgot-passcode/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const j = (await res.json()) as { error?: string; message?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(j.error ?? "Could not approve.");
      return;
    }
    setMsg(j.message ?? "Approved.");
    window.setTimeout(() => router.push("/coach"), 1200);
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <PageIntro title="Approve passcode reset">
        One tap lets them set a new passcode. The old passcode is never shown.
      </PageIntro>
      {!requestId ? (
        <p className="text-sm text-cardinal">No request linked.</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void approve()}
          className="rounded-xl bg-cardinal px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Approving…" : "Approve reset"}
        </button>
      )}
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      <Link href="/coach" className="block text-sm underline">
        Back to coach view
      </Link>
    </main>
  );
}

export default function ApproveResetPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading…</p>}>
      <ApproveInner />
    </Suspense>
  );
}
