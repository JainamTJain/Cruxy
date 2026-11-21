"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Keypad } from "@/components/keypad";
import { Button } from "@/components/ui/button";
import { SAMPLE_MEMBER_STARTER } from "@/lib/constants";
import {
  isRepeatedDigits,
  isStraightRun,
  validatePersonalPasscode,
} from "@/lib/auth/passcode-shape";

export default function ChoosePasscodePage() {
  const router = useRouter();
  const [first, setFirst] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const rules = useMemo(() => {
    const code = live.length === 6 ? live : first ?? live;
    return [
      {
        ok: code.length === 6 && code !== SAMPLE_MEMBER_STARTER,
        text: "Not the member code",
      },
      {
        ok: code.length === 6 && !isRepeatedDigits(code),
        text: "Not one digit repeated, like 111111",
      },
      {
        ok: code.length === 6 && !isStraightRun(code),
        text: "Not a straight run, like 123456 or 654321",
      },
    ];
  }, [live, first]);

  async function onFirst(code: string) {
    setError(null);
    const bad = validatePersonalPasscode(code, SAMPLE_MEMBER_STARTER);
    if (bad) {
      setError(bad);
      return;
    }
    setFirst(code);
    setLive("");
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
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
        <p className="font-display text-4xl font-extrabold text-cardinal">
          crux
        </p>
        <h1 className="mt-6 font-display text-3xl font-extrabold">
          Passcode saved
        </h1>
        <p className="mt-2 text-sm text-muted">
          Change it any time in Settings. Forgot it? Ask Jainam.
        </p>
        <Button className="mt-8" onClick={() => router.push("/home")}>
          Enter Crux
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 py-10 lg:flex-row lg:items-start lg:px-10">
      <aside className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
          <span>USC Ethics Bowl</span>
          <span>First sign in · sample</span>
        </div>
        <div className="flex gap-3 rounded-2xl border border-mist bg-white p-4">
          <Image
            src="/cruxy/cruxy-curious.png"
            alt="Cruxy, thinking"
            width={72}
            height={72}
            className="h-[72px] w-[72px] shrink-0"
            unoptimized
          />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cardinal">
              Cruxy
            </p>
            <p className="mt-1 text-[15px] leading-snug">
              What six digits will you still remember the morning of the
              regional, that nobody could guess?
            </p>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {rules.map((r) => (
            <li key={r.text} className="flex items-center gap-2">
              <span aria-hidden>{r.ok ? "✅" : "○"}</span>
              <span className={r.ok ? "text-ink" : "text-muted"}>{r.text}</span>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex flex-1 flex-col">
        <p className="font-display text-4xl font-extrabold text-cardinal">
          crux
        </p>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Step 3 of 3 · first time only
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold">
          Choose your passcode
        </h1>
        <p className="mt-3 text-sm text-muted">
          From now on you&apos;ll sign in with your name and this passcode. The
          member code stops working for you.
        </p>
        <p className="mt-4 rounded-2xl border border-gold/40 bg-[#FFF7DB] px-4 py-3 text-sm text-ink">
          Jainam, as technical admin, can see your passcode so he can help if
          you forget it. Don&apos;t reuse a code you use anywhere else.
        </p>

        <div className="mt-8">
          {!first ? (
            <>
              <p className="mb-4 text-sm font-medium">Type 6 digits</p>
              <Keypad
                onSubmit={onFirst}
                disabled={busy}
                onDigitsChange={setLive}
              />
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
                  setLive("");
                }}
              >
                Try the flow again
              </Button>
            </>
          )}
        </div>
        {error ? <p className="mt-3 text-sm text-cardinal">{error}</p> : null}
      </section>
    </main>
  );
}
