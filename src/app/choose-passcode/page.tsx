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
    const code = live.length === 6 ? live : (first ?? live);
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
      <main className="flex min-h-dvh flex-col bg-paper lg:flex-row">
        <section className="flex flex-1 flex-col justify-between bg-cardinal px-10 py-12 text-white">
          <p className="text-[13px] font-semibold tracking-[0.08em]">
            USC ETHICS BOWL
          </p>
          <h1 className="font-display inline-block rounded-[18px] border-[3px] border-genie-bright px-3 py-1 text-[120px] font-extrabold leading-[0.82] tracking-[-0.05em]">
            crux
          </h1>
        </section>
        <section className="flex flex-1 flex-col justify-center bg-white px-10 py-12 sm:px-14">
          <h2 className="font-display text-3xl font-extrabold">Passcode saved</h2>
          <p className="mt-2 text-sm text-muted">
            Change it any time in Settings. Forgot it? Ask Jainam.
          </p>
          <Button
            className="mt-8 w-fit"
            onClick={() => router.push("/checklist")}
          >
            Enter Crux
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper lg:flex-row">
      {/* ChooseCode.html: full-height cardinal left panel */}
      <section className="flex min-h-[50vh] flex-1 flex-col justify-between gap-8 bg-cardinal px-8 py-10 text-white sm:px-12 sm:py-12 lg:min-h-dvh">
        <div className="flex items-center justify-between gap-4 text-[13px] font-semibold tracking-[0.08em]">
          <span>USC ETHICS BOWL</span>
          <span className="text-right">
            First sign in
            <br />
            Choose your code
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-5">
          <Image
            src="/cruxy/cruxy-curious.png"
            alt="Cruxy, thinking"
            width={170}
            height={170}
            className="h-[170px] w-[170px] shrink-0"
            unoptimized
            priority
          />
          <div className="mb-[7.5rem] max-w-[360px] rounded-[20px] rounded-bl-[4px] bg-white px-5 py-[18px] text-ink">
            <p className="font-display text-[17px] font-extrabold">Cruxy</p>
            <p className="mt-1.5 text-[17px] leading-snug">
              What six digits will you still remember the morning of the
              regional, that nobody could guess?
            </p>
          </div>
        </div>
        <h1 className="font-display inline-block rounded-[18px] border-[3px] border-genie-bright px-3 py-1 text-[clamp(4.5rem,14vw,7.5rem)] font-extrabold leading-[0.82] tracking-[-0.05em]">
          crux
        </h1>
      </section>

      <section className="flex flex-1 flex-col gap-5 bg-white px-8 py-10 sm:px-14 sm:py-12">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Step 3 of 3
          </p>
          <p className="text-xs text-muted">First time only</p>
          <h2 className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-[-0.02em]">
            Choose your passcode
          </h2>
        </div>
        <p className="max-w-[520px] text-sm text-muted">
          From now on you&apos;ll sign in with your name and this passcode. The
          member code stops working for you.
        </p>
        <div className="flex max-w-[520px] gap-3 rounded-[14px] bg-[#FFF7DB] px-4 py-3.5">
          <p className="text-sm text-ink">
            Jainam, as technical admin, can see your passcode so he can help if
            you forget it. Don&apos;t reuse a code you use anywhere else.
          </p>
        </div>

        <div className="max-w-[420px] rounded-[18px] bg-[#E8F5F1] p-6">
          {!first ? (
            <>
              <p className="mb-4 text-sm font-semibold">Type 6 digits</p>
              <Keypad
                onSubmit={onFirst}
                disabled={busy}
                onDigitsChange={setLive}
              />
            </>
          ) : (
            <>
              <p className="mb-4 text-sm font-semibold">Type them again</p>
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

        <ul className="space-y-2 text-sm">
          {rules.map((r) => (
            <li key={r.text} className="flex items-center gap-2">
              <span aria-hidden>{r.ok ? "✅" : "○"}</span>
              <span className={r.ok ? "text-ink" : "text-muted"}>{r.text}</span>
            </li>
          ))}
        </ul>
        {error ? <p className="text-sm text-cardinal">{error}</p> : null}
      </section>
    </main>
  );
}
