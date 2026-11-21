"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Keypad } from "@/components/keypad";
import { Button } from "@/components/ui/button";

export default function ChoosePasscodePage() {
  const router = useRouter();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFirst(code: string) {
    setError(null);
    setFirst(code);
  }

  async function onConfirm(code: string) {
    if (!first) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/choose-passcode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: first, confirm: code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not set passcode.");
        setFirst(null);
        return;
      }
      router.push("/checklist");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Step 3 of 3 · first time only
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        Choose your passcode
      </h1>
      <p className="mt-3 text-sm text-muted">
        From now on you&apos;ll sign in with your name and this passcode. The
        member code stops working for you.
      </p>
      <p className="mt-4 rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm text-ink">
        Jainam, as technical admin, can see your passcode so he can help if you
        forget it. Don&apos;t reuse a code you use anywhere else.
      </p>

      <div className="mt-8">
        {!first ? (
          <>
            <p className="mb-4 text-sm font-medium">Type 6 digits</p>
            <Keypad onSubmit={onFirst} disabled={busy} />
          </>
        ) : (
          <>
            <p className="mb-4 text-sm font-medium">Type them again</p>
            <Keypad onSubmit={onConfirm} disabled={busy} />
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => {
                setFirst(null);
                setError(null);
              }}
            >
              Start over
            </Button>
          </>
        )}
      </div>

      <ul className="mt-6 space-y-1 text-sm text-muted">
        <li>· Not the member code</li>
        <li>· Not one digit repeated, like 111111</li>
        <li>· Not a straight run, like 123456 or 654321</li>
      </ul>
      {error ? <p className="mt-3 text-sm text-cardinal">{error}</p> : null}
    </main>
  );
}
