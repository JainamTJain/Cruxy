"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { JudgePhoneCard } from "@/components/practice/judge-phone-card";
import { TextOnlyBanner } from "@/components/practice/text-only-banner";
import type { AppeItemKey } from "@/lib/practice/types";
import { PRACTICE_FIXTURE_CODE } from "@/lib/practice/fixture-ids";

/**
 * Judging portal: known members enter session code; guests enter name + background.
 * Phone-first APPE card (JudgePhone.html).
 */
export default function JudgingPortalPage() {
  const [guest, setGuest] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [background, setBackground] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [access, setAccess] = useState<{
    path: string;
    judge: { id: string; name: string };
    roundId: string;
    teamIds: string[];
    caseNumber?: number | null;
    teams?: { id: string; name: string; role: "presenting" | "commenting" }[];
    guestToken?: string;
    textOnlyNames?: string[];
  } | null>(null);
  const [momentNote, setMomentNote] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("guest") === "1") setGuest(true);
    if (params.get("demo") === "1") {
      setDemo(true);
      setGuest(true);
      setName("Prof. Rivera");
      setBackground("Past APPE judge");
      setCode(PRACTICE_FIXTURE_CODE);
    }
  }, []);

  useEffect(() => {
    if (!demo || access) return;
    void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, code, name]);

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
      // Demo / shots fallback: show the card UI with fixture labels
      if (demo || code.replace(/\s/g, "") === PRACTICE_FIXTURE_CODE) {
        setAccess({
          path: guest ? "guest" : "known",
          judge: { id: "demo", name: name || "Prof. Rivera" },
          roundId: "demo",
          teamIds: ["t3", "t1"],
          caseNumber: 9,
          teams: [
            { id: "t3", name: "Team 3", role: "presenting" },
            { id: "t1", name: "Team 1", role: "commenting" },
          ],
        });
        return;
      }
      setError(data.error ?? "Could not enter");
      return;
    }
    setAccess({
      ...data,
      caseNumber: data.caseNumber ?? 9,
      teams:
        data.teams ??
        (data.teamIds ?? []).map((id: string, i: number) => ({
          id,
          name: `Team ${i === 0 ? 3 : 1}`,
          role: i === 0 ? "presenting" : "commenting",
        })),
      textOnlyNames: Array.isArray(data.textOnlyBanner?.names)
        ? data.textOnlyBanner.names
        : [],
    });
  }

  async function submitScores(payload: {
    teamId: string;
    scores: { item: AppeItemKey; score: number; comment?: string }[];
    spirit?: number;
    overallComment?: string;
  }) {
    if (!access) return;
    if (access.roundId === "demo") return;
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
  }

  const teams = useMemo(
    () =>
      access?.teams ?? [
        { id: "t3", name: "Team 3", role: "presenting" as const },
        { id: "t1", name: "Team 1", role: "commenting" as const },
      ],
    [access],
  );

  if (access) {
    return (
      <>
        <div className="mx-auto max-w-lg px-4 pt-4">
          <TextOnlyBanner names={access.textOnlyNames ?? []} />
        </div>
        <JudgePhoneCard
          judgeName={access.judge.name.startsWith("Prof") ? access.judge.name : `Prof. ${access.judge.name}`}
          caseNumber={access.caseNumber ?? 9}
          roundLabel="ROUND 1"
          teams={teams}
          hasCommentingTeam={teams.length > 1}
          hasJudgesQa
          onMarkMoment={() =>
            setMomentNote(
              "Moment marked. It is pinned when the transcript lands.",
            )
          }
          onSubmit={submitScores}
        />
        {momentNote ? (
          <p className="fixed bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs text-white">
            {momentNote}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-white px-4 py-8">
      <header className="mb-8">
        <Link href="/" className="font-display text-2xl font-extrabold text-cardinal">
          crux
        </Link>
        <h1 className="mt-4 font-display text-3xl font-extrabold">
          Judging portal
        </h1>
        <p className="mt-1 text-sm text-muted">
          Enter the session code the admin reads aloud, or scan the QR for
          guests.
        </p>
      </header>

      <div className="space-y-4 rounded-[20px] border border-line bg-white p-5">
        <div className="flex gap-2">
          <button
            type="button"
            className={
              !guest
                ? "rounded-xl bg-ink px-3 py-2 text-sm text-white"
                : "rounded-xl bg-paper px-3 py-2 text-sm"
            }
            onClick={() => setGuest(false)}
          >
            Someone in Crux
          </button>
          <button
            type="button"
            className={
              guest
                ? "rounded-xl bg-ink px-3 py-2 text-sm text-white"
                : "rounded-xl bg-paper px-3 py-2 text-sm"
            }
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
                className="mt-1 h-11 w-full rounded-xl border border-line px-3"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Prof. Rivera"
              />
            </label>
            <label className="block text-sm">
              Judging background
              <input
                className="mt-1 h-11 w-full rounded-xl border border-line px-3"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Past APPE judge, faculty, …"
              />
            </label>
          </>
        ) : null}
        <label className="block text-sm">
          Session code
          <input
            className="mt-1 h-11 w-full rounded-xl border border-line px-3 font-mono uppercase tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="482913"
            maxLength={8}
          />
        </label>
        {error ? <p className="text-sm text-cardinal">{error}</p> : null}
        <button
          type="button"
          onClick={() => void enter()}
          className="h-12 w-full rounded-xl bg-cardinal text-base font-bold text-white"
        >
          Open scoring card
        </button>
      </div>
    </div>
  );
}
