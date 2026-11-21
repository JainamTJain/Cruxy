"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AppeScoringCard } from "@/components/practice/appe-scoring-card";
import type { AppeItemKey } from "@/lib/practice/types";

/**
 * Judging portal: known members enter session code; guests enter name + background.
 * QR on admin screen can deep-link here with ?guest=1.
 */
export default function JudgingPortalPage() {
  const [guest, setGuest] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [background, setBackground] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState("/judging?guest=1");
  const [access, setAccess] = useState<{
    path: string;
    judge: { id: string; name: string };
    roundId: string;
    teamIds: string[];
    guestToken?: string;
  } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("guest") === "1") setGuest(true);
    setQrUrl(`${window.location.origin}/judging?guest=1`);
  }, []);

  async function enter() {
    setError(null);
    const res = await fetch("/api/practice/judging/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        guest,
        name: guest ? name : undefined,
        background: background || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not enter");
      return;
    }
    setAccess(data);
  }

  async function submitScores(payload: {
    teamId: string;
    scores: { item: AppeItemKey; score: number; comment?: string }[];
    spirit?: number;
    overallComment?: string;
  }) {
    if (!access) return;
    const res = await fetch("/api/practice/judging/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId: access.roundId,
        judgeId: access.judge.id,
        guestToken: access.guestToken,
        teamId: payload.teamId,
        scores: payload.scores,
        spirit: payload.spirit,
        overallComment: payload.overallComment,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Submit failed");
    setDone(true);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-8">
      <header className="mb-8">
        <Link href="/" className="font-display text-2xl font-semibold text-cardinal">
          crux
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold">Judging portal</h1>
        <p className="mt-1 text-sm text-muted">
          Enter the session code the admin reads aloud — or scan the QR for guests.
        </p>
      </header>

      {!access ? (
        <div className="space-y-4 rounded-2xl border border-ink/10 bg-white/70 p-5">
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-sm ${!guest ? "bg-ink text-white" : "bg-mist"}`}
              onClick={() => setGuest(false)}
            >
              Someone in Crux
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-sm ${guest ? "bg-ink text-white" : "bg-mist"}`}
              onClick={() => setGuest(true)}
            >
              Someone new
            </button>
          </div>

          {guest ? (
            <>
              <label className="block text-sm">
                Your name
                <input
                  className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Judging background
                <input
                  className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2"
                  placeholder="Faculty, past APPE judge, …"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                />
              </label>
            </>
          ) : null}

          <label className="block text-sm">
            Session code
            <input
              className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2 font-mono uppercase tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={8}
            />
          </label>

          {error ? <p className="text-sm text-cardinal">{error}</p> : null}
          <Button type="button" onClick={() => void enter()}>
            Open scoring card
          </Button>

          <div className="border-t border-ink/10 pt-4 text-xs text-muted">
            Admin QR target (guests):{" "}
            <span className="break-all font-mono">{qrUrl}</span>
          </div>
        </div>
      ) : done ? (
        <p className="rounded-2xl border border-ink/10 bg-white/70 p-5">
          Thanks, {access.judge.name}. Your card is with the admin.
        </p>
      ) : (
        <AppeScoringCard
          teams={access.teamIds.map((id) => ({
            id,
            name: `Team ${id.slice(0, 4)}`,
          }))}
          hasCommentingTeam={access.teamIds.length > 1}
          hasJudgesQa
          onSubmit={submitScores}
        />
      )}
    </div>
  );
}
