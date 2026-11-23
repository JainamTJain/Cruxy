"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { JudgePhoneCard } from "@/components/practice/judge-phone-card";
import { TextOnlyBanner } from "@/components/practice/text-only-banner";
import type { AppeItemKey } from "@/lib/practice/types";
import { PRACTICE_FIXTURE_CODE } from "@/lib/practice/fixture-ids";

type Access = {
  path: string;
  judge: { id: string; name: string };
  roundId: string;
  teamIds: string[];
  caseNumber?: number | null;
  teams?: { id: string; name: string; role: "presenting" | "commenting" }[];
  guestToken?: string;
  textOnlyNames?: string[];
};

const ACCESS_KEY = "crux_judging_access";

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
  const [entering, setEntering] = useState(false);
  const [demo, setDemo] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);
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
      return;
    }
    try {
      const raw = sessionStorage.getItem(ACCESS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Access;
        if (saved?.roundId && saved?.judge?.id) setAccess(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!demo || access) return;
    void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, code, name]);

  useEffect(() => {
    if (!access || access.roundId === "demo") return;
    try {
      sessionStorage.setItem(ACCESS_KEY, JSON.stringify(access));
    } catch {
      /* ignore */
    }
  }, [access]);

  async function enter() {
    if (entering) return;
    setEntering(true);
    setError(null);
    try {
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
      let data: {
        error?: string;
        path?: string;
        judge?: { id: string; name: string };
        roundId?: string;
        teamIds?: string[];
        caseNumber?: number | null;
        teams?: Access["teams"];
        guestToken?: string;
        textOnlyBanner?: { names?: string[] };
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        data = {};
      }
      if (!res.ok) {
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
        setError(
          data.error ??
            "Could not open judging. Check the session code and try again.",
        );
        return;
      }
      if (!data.judge || !data.roundId) {
        setError("Could not open judging. Try again.");
        return;
      }
      setAccess({
        path: data.path ?? (guest ? "guest" : "known"),
        judge: data.judge,
        roundId: data.roundId,
        teamIds: data.teamIds ?? [],
        caseNumber: data.caseNumber ?? null,
        teams: data.teams,
        guestToken: data.guestToken,
        textOnlyNames: Array.isArray(data.textOnlyBanner?.names)
          ? data.textOnlyBanner.names
          : [],
      });
    } catch {
      setError(
        "Network error. Check your connection and try again. Nothing was lost.",
      );
    } finally {
      setEntering(false);
    }
  }

  async function submitScores(payload: {
    teamId: string;
    scores: { item: AppeItemKey; score: number; comment?: string }[];
    spirit?: number;
    overallComment?: string;
    moments?: { line_id: string; note: string }[];
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
        moments: payload.moments,
      }),
    });
    let data: { error?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      data = {};
    }
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

  const draftKey =
    access && access.roundId !== "demo"
      ? `crux_judge_draft_${access.roundId}_${access.judge.id}`
      : undefined;

  if (access) {
    return (
      <>
        <div className="mx-auto max-w-lg px-4 pt-4">
          <TextOnlyBanner names={access.textOnlyNames ?? []} />
        </div>
        <JudgePhoneCard
          draftKey={draftKey}
          judgeName={
            access.judge.name.startsWith("Prof")
              ? access.judge.name
              : `Prof. ${access.judge.name}`
          }
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
          <p
            className="fixed bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs text-white"
            role="status"
            aria-live="polite"
          >
            {momentNote}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-white px-4 py-8">
      <header className="mb-8">
        <Link
          href="/"
          className="font-display text-2xl font-extrabold text-cardinal"
        >
          crux
        </Link>
        <h1 className="mt-4 font-display text-3xl font-extrabold">
          Judging portal
        </h1>
        <p className="mt-1 text-sm text-muted">
          Score a practice round on a judge card. Enter the session code the
          room reads aloud. Guests can join with a name if they are not in Crux.
        </p>
      </header>

      <div className="space-y-4 rounded-[20px] border border-line bg-white p-5">
        <div className="flex gap-2">
          <button
            type="button"
            className={
              !guest
                ? "min-h-11 rounded-xl bg-ink px-3 py-2 text-sm text-white"
                : "min-h-11 rounded-xl bg-paper px-3 py-2 text-sm"
            }
            onClick={() => setGuest(false)}
          >
            I am on the team
          </button>
          <button
            type="button"
            className={
              guest
                ? "min-h-11 rounded-xl bg-ink px-3 py-2 text-sm text-white"
                : "min-h-11 rounded-xl bg-paper px-3 py-2 text-sm"
            }
            onClick={() => setGuest(true)}
          >
            I am a guest judge
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
                autoComplete="name"
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
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>
        {error ? (
          <p className="text-sm text-cardinal" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={entering}
          onClick={() => void enter()}
          className="h-12 w-full rounded-xl bg-cardinal text-base font-bold text-white disabled:opacity-60"
        >
          {entering ? "Opening…" : "Open scoring card"}
        </button>
      </div>
    </div>
  );
}
