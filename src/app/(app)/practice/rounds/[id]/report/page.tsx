"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppeScoringCard } from "@/components/practice/appe-scoring-card";
import { CalibratedJudgeSummary } from "@/components/practice/calibrated-judge-summary";
import { RoundReflectionPrompt } from "@/components/practice/round-reflection-prompt";
import { SpeakerConfirmPanel } from "@/components/practice/speaker-confirm";
import { WhoIsThisPanel } from "@/components/practice/who-is-this";
import { APPE_SCORE_ITEMS } from "@/lib/practice/types";

type Score = {
  card_id: string;
  item: string;
  score: number;
  comment: string | null;
  evidence_line_ids: string[];
};

type Feedback = {
  id: string;
  person_id: string;
  kind: string;
  quote_line_id: string | null;
  reasoning: string;
  better_version: string | null;
  scoring_item: string | null;
};

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function scorePos(v: number) {
  return `calc(${((v - 1) / 9) * 100}% - 8px)`;
}

export default function RoundReportPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{
    report: { headline: string; socratic_followups: string[] } | null;
    feedback: Feedback[];
    redos: {
      id: string;
      feedback_item_id: string;
      score_before: number | null;
      score_after: number | null;
      open: boolean;
      person_id: string;
    }[];
    cards: {
      id: string;
      team_id: string;
      cruxy: boolean;
      judge_id: string | null;
    }[];
    scores: Score[];
    lines: {
      id: string;
      text: string;
      start_ms: number;
      speaker_label: string | null;
      speaker_person_id: string | null;
    }[];
    round: {
      sides: { commenting: string | null; presenting: string | null };
      team_ids: string[];
      mode: string;
      case_id: string | null;
      case_number: number | null;
      ended_at: string | null;
      recording_layout?: string;
    };
    skills: { person_id: string; skills: Record<string, number> }[];
    talk: {
      person_id: string;
      talk_ms: number;
      words: number;
      filler_count: number;
      time_to_first_answer_ms: number | null;
    }[];
    bank: {
      id: string;
      lesson: string;
      why: string | null;
      improved: string | null;
      seen_count: number;
      example_line_id: string | null;
    }[];
    people: { id: string; name: string; team_id: string | null }[];
    teams: { id: string; name: string; colour: string }[];
    judges: { id: string; name: string; person_id: string | null }[];
    calibrated?: {
      enough: boolean;
      message: string;
      n_cards: number;
      overall_kappa: number | null;
    } | null;
  } | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [bankMsg, setBankMsg] = useState<string | null>(null);
  const [redoRecording, setRedoRecording] = useState(false);
  const [ideas, setIdeas] = useState<{ text: string; lineId: string }[]>([]);
  const [ideasMsg, setIdeasMsg] = useState<string | null>(null);
  const [doThisMsg, setDoThisMsg] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function refresh() {
    setLoadError(null);
    try {
      const res = await fetch(`/api/practice/rounds/${params.id}/report`);
      const rep = await res.json();
      if (!res.ok) {
        setLoadError(rep.error ?? "Could not load this report.");
        setData(null);
        return;
      }
      setData(rep);
      if (!who && rep.feedback?.[0]) setWho(rep.feedback[0].person_id);
      void fetch(`/api/practice/rounds/${params.id}/ideas`)
        .then((r) => r.json())
        .then((d: { ideas?: { text: string; lineId: string }[] }) =>
          setIdeas(d.ideas ?? []),
        )
        .catch(() => undefined);
      void fetch("/api/auth/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const role = d?.person?.role ?? d?.session?.role;
          setIsAdmin(
            Boolean(
              d?.session?.adminView &&
                (role === "tech_admin" || role === "coach_admin"),
            ),
          );
        })
        .catch(() => undefined);
    } catch {
      setLoadError("Could not load this report.");
      setData(null);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const lineById = useMemo(
    () => Object.fromEntries((data?.lines ?? []).map((l) => [l.id, l])),
    [data],
  );
  const peopleById = useMemo(
    () => Object.fromEntries((data?.people ?? []).map((p) => [p.id, p])),
    [data],
  );

  const humanCard = data?.cards.find((c) => !c.cruxy);
  const cruxyCard = data?.cards.find((c) => c.cruxy);
  const humanJudgeName = humanCard
    ? data?.judges.find((j) => j.id === humanCard.judge_id)?.name ??
      peopleById[
        data?.judges.find((j) => j.id === humanCard.judge_id)?.person_id ?? ""
      ]?.name ??
      "Judge"
    : "Judge";

  const humanTotal = (data?.scores ?? [])
    .filter((s) => s.card_id === humanCard?.id)
    .reduce((a, s) => a + s.score, 0);
  const cruxyTotal = (data?.scores ?? [])
    .filter((s) => s.card_id === cruxyCard?.id)
    .reduce((a, s) => a + s.score, 0);

  const speakers = useMemo(() => {
    const ids = [...new Set((data?.feedback ?? []).map((f) => f.person_id))];
    return ids;
  }, [data]);

  const active = who ?? speakers[0] ?? null;
  const personFeedback = (data?.feedback ?? []).filter(
    (f) => f.person_id === active,
  );
  const worked = personFeedback.find((f) => f.kind === "worked");
  const fix = personFeedback.find((f) => f.kind === "fix");
  const redo = data?.redos.find((r) => r.feedback_item_id === fix?.id);
  const talk = data?.talk.find((t) => t.person_id === active);
  const skills = data?.skills.find((s) => s.person_id === active);
  const bank = data?.bank[0];

  const scoreRows = APPE_SCORE_ITEMS.map((item) => {
    const h = data?.scores.find(
      (s) => s.card_id === humanCard?.id && s.item === item.key,
    );
    const c = data?.scores.find(
      (s) => s.card_id === cruxyCard?.id && s.item === item.key,
    );
    if (!h && !c) return null;
    const evidence = lineById[h?.evidence_line_ids[0] ?? c?.evidence_line_ids[0] ?? ""];
    return {
      key: item.key,
      name: item.label.replace("Presentation ", "") + (item.key.startsWith("presentation_") ? `, ${item.label.split(" ").slice(1).join(" ") || item.label}` : ""),
      label:
        item.key === "presentation_a"
          ? "A. Clear and systematic"
          : item.key === "presentation_b"
            ? "B. Central moral dimensions"
            : item.key === "presentation_c"
              ? "C. Opposing viewpoints"
              : item.label,
      h: h?.score ?? null,
      c: c?.score ?? null,
      ts: evidence ? fmtMs(evidence.start_ms) : "Not set",
      why: h?.comment ?? c?.comment ?? "",
    };
  }).filter(Boolean) as {
    key: string;
    label: string;
    h: number | null;
    c: number | null;
    ts: string;
    why: string;
  }[];

  async function doRedo(id: string) {
    setRedoRecording(true);
    await fetch(`/api/practice/redos/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setRedoRecording(false);
    await refresh();
  }

  async function addBank() {
    if (!bank && !fix) return;
    const res = await fetch("/api/practice/bank", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lesson: bank?.lesson ?? "Answer first, then name the theory.",
        why: bank?.why ?? fix?.reasoning,
        improved: bank?.improved ?? fix?.better_version,
        exampleLineId: fix?.quote_line_id,
        drillId: "thesis_30",
        seenCount: bank?.seen_count ?? 1,
      }),
    });
    const d = await res.json();
    setBankMsg(res.ok ? "Added to the bank with its drill." : d.error ?? "Failed");
  }

  async function markDoThis() {
    if (!bank?.id) {
      setDoThisMsg("Add the bank entry first, then tap I do this.");
      return;
    }
    const res = await fetch("/api/practice/bank/do-this", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bankEntryId: bank.id,
        caseId: data?.round.case_id ?? null,
      }),
    });
    const d = await res.json();
    setDoThisMsg(
      res.ok
        ? "Added to your roadmap. Open Roadmap to practise the drill."
        : d.error ?? "Could not save",
    );
  }

  async function queueIdeas() {
    setIdeasMsg(null);
    const res = await fetch(`/api/practice/rounds/${params.id}/ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ideas: ideas.map((i) => ({ text: i.text, lineId: i.lineId })),
      }),
    });
    const d = await res.json();
    setIdeasMsg(
      res.ok
        ? `${d.queued ?? 0} ideas sent to Evidence Library.`
        : d.error ?? "Could not queue ideas",
    );
  }

  async function submitPeer(payload: {
    teamId: string;
    scores: { item: string; score: number; comment?: string }[];
  }) {
    await fetch("/api/practice/judging/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId: params.id,
        teamId: payload.teamId,
        scores: payload.scores,
        peer: true,
      }),
    });
    await refresh();
  }

  if (loadError) {
    return (
      <main className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold">Round report</h1>
        <p className="text-sm text-cardinal">{loadError}</p>
        <button
          type="button"
          className="text-sm text-cardinal underline"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </main>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted">Loading report…</p>;
  }

  if (!data.report) {
    return (
      <main className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold">Round report</h1>
        <p className="text-muted">
          No report yet.{" "}
          <Link href={`/practice/rounds/${params.id}`} className="text-cardinal underline">
            End the round
          </Link>{" "}
          first.
        </p>
      </main>
    );
  }

  const teamName =
    data.teams.find((t) => t.id === data.round.sides.presenting)?.name ??
    "Team 3";
  const talkLine = talk
    ? `Talk time ${fmtMs(talk.talk_ms)}, ${Math.round((talk.words / Math.max(talk.talk_ms / 60000, 0.1)))} words a minute, ${talk.filler_count} filler words, first answer at ${fmtMs(talk.time_to_first_answer_ms ?? 0)}`
    : "Everyone can read everyone's feedback.";

  const skillEntries = [
    ["answer_first", "Answer first"],
    ["explain_frameworks", "Explain frameworks"],
    ["engage_objections", "Engage objections"],
    ["stay_under_time", "Stay under time"],
  ] as const;

  return (
    <main className="flex flex-col gap-[22px]">
      <RoundReflectionPrompt roundId={params.id} />
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex max-w-[760px] flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Round report,{" "}
            {data.round.ended_at
              ? new Date(data.round.ended_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "Nov 24"}
            , Case {data.round.case_number ?? "Not set"}, {teamName} vs Cruxy as the
            other team
          </span>
          <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] sm:text-[46px]">
            {data.report.headline}
          </h1>
        </div>
        <div className="flex gap-2.5">
          {humanCard ? (
            <div className="rounded-2xl border-t-[5px] border-[#4F46E5] bg-white px-[18px] py-3.5">
              <div className="font-display text-[42px] font-extrabold leading-none">
                {humanTotal}
              </div>
              <div className="text-[13px] text-muted">
                of 50, {humanJudgeName}
              </div>
            </div>
          ) : null}
          {cruxyCard ? (
            <div className="rounded-2xl border-t-[5px] border-gold bg-white px-[18px] py-3.5">
              <div className="font-display text-[42px] font-extrabold leading-none">
                {cruxyTotal}
              </div>
              <div className="text-[13px] text-muted">of 50, Cruxy</div>
            </div>
          ) : null}
        </div>
      </div>

      <CalibratedJudgeSummary calibrated={data.calibrated} />

      <section className="flex flex-col gap-1.5 rounded-[20px] bg-white p-[22px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1.5">
          <h2 className="font-display m-0 text-[22px] font-extrabold">
            Scorecard{" "}
            <span className="text-[13px] font-medium text-muted">
              Commentary is scored when {teamName} comments in the second half
            </span>
          </h2>
          <span className="flex gap-4 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#4F46E5]" />
              {humanJudgeName}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] bg-gold" />
              Cruxy
            </span>
          </span>
        </div>
        {scoreRows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-1 items-center gap-[18px] border-t border-[#ECEEF1] py-2.5 md:grid-cols-[210px_minmax(180px,1fr)_minmax(220px,1.2fr)]"
          >
            <span className="text-sm font-semibold">{row.label}</span>
            <span className="relative h-6">
              <span className="absolute inset-x-0 top-[11px] h-0.5 bg-line" />
              {row.h != null ? (
                <span
                  className="absolute top-1 h-4 w-4 rounded-full bg-[#4F46E5]"
                  style={{ left: scorePos(row.h) }}
                />
              ) : null}
              {row.c != null ? (
                <span
                  className="absolute top-1 h-4 w-4 rounded bg-gold opacity-95"
                  style={{ left: scorePos(row.c) }}
                />
              ) : null}
              <span className="absolute right-0 -top-1 font-mono text-[11px] font-semibold text-[#9AA0AA]">
                10
              </span>
            </span>
            <span className="text-[13px] leading-snug text-[#3B404A]">
              <span className="mr-1.5 inline-block rounded-md bg-ink px-1.5 py-0.5 font-mono text-[12px] font-semibold text-white">
                {row.ts}
              </span>
              {row.why}
            </span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-[22px]">
        <section className="flex min-w-0 flex-[999] flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 className="font-display m-0 text-[26px] font-extrabold">
              Each person
            </h2>
            <div role="tablist" aria-label="Speaker" className="flex flex-wrap gap-1.5">
              {speakers.map((id) => {
                const name = peopleById[id]?.name ?? id.slice(0, 6);
                const on = id === active;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setWho(id)}
                    className={
                      on
                        ? "h-10 rounded-full border border-ink bg-ink px-4 text-sm font-semibold text-white"
                        : "h-10 rounded-full border border-line bg-white px-4 text-sm font-semibold"
                    }
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
          <span className="-mt-1.5 text-[13px] text-muted">
            Everyone can read everyone&apos;s feedback. {talkLine}
          </span>

          <div className="flex flex-col gap-3.5 rounded-[20px] bg-white p-[22px]">
            {worked ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-[#E8F5F1] p-4">
                <span className="text-[13px] font-bold text-[#0B5E53]">
                  WHAT WORKED,{" "}
                  <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[12px] font-semibold text-white">
                    {worked.quote_line_id
                      ? fmtMs(lineById[worked.quote_line_id]?.start_ms ?? 0)
                      : "Not set"}
                  </span>
                </span>
                <p className="m-0 font-serif text-[19px] italic leading-relaxed text-[#1C1F26]">
                  &ldquo;{lineById[worked.quote_line_id ?? ""]?.text ?? worked.reasoning}&rdquo;
                </p>
                <span className="text-sm leading-snug">{worked.reasoning}</span>
              </div>
            ) : null}

            {fix ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-[#FDECEC] p-4">
                <span className="text-[13px] font-bold text-cardinal">
                  THE ONE THING TO FIX,{" "}
                  <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[12px] font-semibold text-white">
                    {fix.quote_line_id
                      ? fmtMs(lineById[fix.quote_line_id]?.start_ms ?? 0)
                      : "Not set"}
                  </span>
                  , cost points on{" "}
                  {APPE_SCORE_ITEMS.find((i) => i.key === fix.scoring_item)
                    ?.label ?? "Response to judges"}
                </span>
                <p className="m-0 font-serif text-[19px] italic leading-relaxed text-[#1C1F26]">
                  &ldquo;{lineById[fix.quote_line_id ?? ""]?.text ?? ""}&rdquo;
                </p>
                <span className="text-sm leading-snug">{fix.reasoning}</span>
              </div>
            ) : null}

            {fix?.better_version ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-[#F7F8FA] p-4">
                <span className="text-[13px] font-bold text-[#3B404A]">
                  THE BETTER VERSION, IN YOUR WORDS
                </span>
                <p className="m-0 font-serif text-[19px] italic leading-relaxed text-[#1C1F26]">
                  &ldquo;{fix.better_version}&rdquo;
                </p>
              </div>
            ) : null}

            {redo?.open ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink p-4 text-white">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-bold text-gold">
                    REDO NOW, 90 SECONDS
                  </span>
                  <span className="text-[15px] leading-snug">
                    Cruxy asks the same question again. Answer first, then name
                    the theory.
                  </span>
                  <span className="text-[13px] text-[#9AA0AA]">
                    Scored {redo.score_before ?? 5} then, aim for 7, comes back
                    in your drills on Thu and Sun
                  </span>
                </div>
                <button
                  type="button"
                  disabled={redoRecording}
                  onClick={() => void doRedo(redo.id)}
                  className="h-12 rounded-xl bg-gold px-5 text-[15px] font-bold text-ink"
                >
                  {redoRecording ? "Scoring…" : "Record the redo"}
                </button>
              </div>
            ) : null}

            {skills ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold">Your skills, last 5 rounds</span>
                <div className="grid grid-cols-[140px_1fr_40px] items-center gap-x-3 gap-y-2 text-[13px] sm:grid-cols-[200px_1fr_40px]">
                  {skillEntries.map(([key, label]) => {
                    const v = skills.skills[key] ?? 5;
                    const pct = Math.min(100, (v / 10) * 100);
                    const color =
                      v < 5 ? "#C62828" : v >= 8 ? "#0F7B6C" : "#111318";
                    return (
                      <div key={key} className="contents">
                        <span>{label}</span>
                        <span className="h-2 rounded-full bg-[#ECEEF1]">
                          <span
                            className="block h-2 rounded-full"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </span>
                        <span className="font-bold">{v.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="flex w-full flex-col gap-3 rounded-[20px] bg-white p-[22px] sm:w-[340px]">
          <h2 className="font-display m-0 text-[22px] font-extrabold">
            Transcript
          </h2>
          <div className="flex flex-col gap-3 text-sm leading-snug">
            {data.lines.map((l) => {
              const highlightWorked = l.id === worked?.quote_line_id;
              const highlightFix = l.id === fix?.quote_line_id;
              return (
                <p
                  key={l.id}
                  className={
                    highlightWorked
                      ? "m-0 rounded-[10px] bg-[#E8F5F1] p-2"
                      : highlightFix
                        ? "m-0 rounded-[10px] bg-[#FDECEC] p-2"
                        : "m-0"
                  }
                >
                  <span className="mr-1 inline-block rounded-md bg-[#ECEEF1] px-1.5 py-0.5 font-mono text-[12px] font-semibold text-[#3B404A]">
                    {fmtMs(l.start_ms)}
                  </span>{" "}
                  <strong>{l.speaker_label ?? "Speaker"}</strong> {l.text}
                </p>
              );
            })}
          </div>
        </aside>
      </div>

      {(bank || fix) && (
        <section className="flex flex-col gap-3.5 rounded-[20px] border-2 border-ink bg-white p-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display m-0 text-[22px] font-extrabold">
              Send to Things to take care of?
            </h2>
            <span className="text-[13px] text-muted">
              Seen in {bank?.seen_count ?? 1} rounds across 2 teams
            </span>
          </div>
          <p className="font-display m-0 text-2xl font-semibold">
            {bank?.lesson ?? "Answer first, then name the theory."}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-2xl bg-[#FDECEC] p-4">
              <span className="text-xs font-bold text-cardinal">
                HOW IT WENT, {peopleById[active ?? ""]?.name ?? "Speaker"}, Case{" "}
                {data.round.case_number},{" "}
                {fix?.quote_line_id
                  ? fmtMs(lineById[fix.quote_line_id]?.start_ms ?? 0)
                  : "Not set"}
              </span>
              <p className="m-0 font-serif text-base italic">
                &ldquo;{lineById[fix?.quote_line_id ?? ""]?.text ?? ""}&rdquo;
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl bg-[#F7F8FA] p-4">
              <span className="text-xs font-bold text-[#3B404A]">
                WHY IT COST POINTS
              </span>
              <span className="text-sm leading-snug">
                {bank?.why ?? fix?.reasoning}
              </span>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl bg-[#E8F5F1] p-4">
              <span className="text-xs font-bold text-[#0B5E53]">
                HOW IT SHOULD SOUND
              </span>
              <p className="m-0 font-serif text-base italic">
                &ldquo;{bank?.improved ?? fix?.better_version}&rdquo;
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => void addBank()}
              className="h-11 rounded-xl bg-ink px-[18px] text-sm font-semibold text-white"
            >
              Add to the bank with its drill
            </button>
            <button
              type="button"
              className="h-11 rounded-xl border border-line bg-white px-[18px] text-sm font-semibold"
            >
              Only for this person
            </button>
            <button
              type="button"
              onClick={() => void markDoThis()}
              className="h-11 rounded-xl border border-ink bg-white px-[18px] text-sm font-semibold"
            >
              I do this
            </button>
          </div>
          {bankMsg ? <p className="text-sm text-muted">{bankMsg}</p> : null}
          {doThisMsg ? <p className="text-sm text-muted">{doThisMsg}</p> : null}
        </section>
      )}

      <WhoIsThisPanel
        roundId={params.id}
        people={data.people.map((p) => ({ id: p.id, name: p.name }))}
        isAdmin={isAdmin}
      />

      <SpeakerConfirmPanel
        roundId={params.id}
        people={data.people.map((p) => ({ id: p.id, name: p.name }))}
        isAdmin={isAdmin}
      />

      {ideas.length > 0 ? (
        <section className="rounded-[20px] bg-white p-[22px]">
          <h2 className="font-display m-0 text-[22px] font-extrabold">
            New ideas for Evidence Library
          </h2>
          <p className="mt-1 text-sm text-muted">
            Raised in this round. Already queued, or send again with one tap.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {ideas.map((i) => (
              <li key={i.lineId}>{i.text}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void queueIdeas()}
            className="mt-4 h-11 rounded-xl bg-ink px-[18px] text-sm font-semibold text-white"
          >
            Send to Evidence Library queue
          </button>
          {ideasMsg ? <p className="mt-2 text-sm text-muted">{ideasMsg}</p> : null}
        </section>
      ) : null}

      {data.report.socratic_followups.length ? (
        <section className="rounded-[20px] bg-white p-[22px]">
          <h2 className="font-display m-0 text-[22px] font-extrabold">
            Socratic follow ups
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {data.report.socratic_followups.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-[20px] bg-white p-[22px]">
        <h2 className="font-display mb-3 text-[22px] font-extrabold">
          Peer judge this recording
        </h2>
        <AppeScoringCard
          teams={
            data.round.sides.presenting
              ? [
                  {
                    id: data.round.sides.presenting,
                    name: teamName,
                  },
                ]
              : []
          }
          hasCommentingTeam={Boolean(data.round.sides.commenting)}
          hasJudgesQa
          onSubmit={submitPeer}
          predictFirst
        />
      </section>
    </main>
  );
}
