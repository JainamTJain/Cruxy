"use client";

import { useMemo, useState } from "react";
import { APPE_SCORE_ITEMS, type AppeItemKey } from "@/lib/practice/types";
import { applicableItems, presentationTotal } from "@/lib/practice/appe-card";

type TeamCol = { id: string; name: string; role: "presenting" | "commenting" };

type Props = {
  judgeName: string;
  caseNumber: number | null;
  roundLabel: string;
  teams: TeamCol[];
  hasCommentingTeam: boolean;
  hasJudgesQa: boolean;
  onMarkMoment?: () => void;
  onSubmit: (payload: {
    teamId: string;
    scores: { item: AppeItemKey; score: number; comment?: string }[];
    spirit?: number;
    overallComment?: string;
  }) => Promise<void>;
};

export function JudgePhoneCard({
  judgeName,
  caseNumber,
  roundLabel,
  teams,
  hasCommentingTeam,
  hasJudgesQa,
  onMarkMoment,
  onSubmit,
}: Props) {
  const { scored } = useMemo(
    () => applicableItems({ hasCommentingTeam, hasJudgesQa }),
    [hasCommentingTeam, hasJudgesQa],
  );
  const [activeTeam, setActiveTeam] = useState(teams[0]?.id ?? "");
  const [values, setValues] = useState<
    Record<string, Partial<Record<AppeItemKey, number>>>
  >(() => Object.fromEntries(teams.map((t) => [t.id, {}])));
  const [comments, setComments] = useState<
    Record<string, Partial<Record<AppeItemKey, string>>>
  >({});
  const [spirit, setSpirit] = useState(4);
  const [overall, setOverall] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const teamValues = values[activeTeam] ?? {};
  const soFar = presentationTotal(teamValues);

  function setScore(item: AppeItemKey, score: number) {
    setValues((v) => ({
      ...v,
      [activeTeam]: { ...v[activeTeam], [item]: score },
    }));
  }

  async function submit() {
    setBusy(true);
    try {
      for (const team of teams) {
        const scores = scored
          .filter((item) => values[team.id]?.[item] != null)
          .map((item) => ({
            item,
            score: values[team.id]![item]!,
            comment: comments[team.id]?.[item],
          }));
        if (scores.length === 0) continue;
        await onSubmit({
          teamId: team.id,
          scores,
          spirit,
          overallComment: overall || undefined,
        });
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <p className="font-display text-2xl font-extrabold">Card in</p>
        <p className="text-sm text-muted">
          The admin sees it on the session screen. Thank you.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-white text-ink">
      <div className="flex flex-col gap-1 bg-cardinal px-[18px] pb-3.5 pt-[18px] text-white">
        <span className="text-[11px] font-bold tracking-[0.1em]">
          JUDGING, {roundLabel}
          {caseNumber != null ? `, CASE ${caseNumber}` : ""}
        </span>
        <span className="font-display text-2xl font-extrabold">{judgeName}</span>
        <span className="text-xs text-[#F3D0D6]">
          APPE scoring sheet, as in the team&apos;s Drive
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Team"
        className="grid grid-cols-2 border-b border-line"
      >
        {teams.map((t) => {
          const selected = t.id === activeTeam;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTeam(t.id)}
              className={
                selected
                  ? "h-12 border-b-[3px] border-ink bg-white text-sm font-bold"
                  : "h-12 bg-white text-sm font-semibold text-muted"
              }
            >
              {t.name}, {t.role === "presenting" ? "presenting" : "commenting"}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pb-2 pt-1">
        {APPE_SCORE_ITEMS.filter((item) => scored.includes(item.key)).map(
          (item) => (
            <div
              key={item.key}
              className="flex flex-col gap-2 border-t border-[#ECEEF1] py-3"
            >
              <strong className="text-sm">{item.label}</strong>
              <span className="text-[13px] leading-snug text-[#3B404A]">
                {item.question}
              </span>
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const on = teamValues[item.key] === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(item.key, n)}
                      className={
                        on
                          ? "h-11 w-8 rounded-lg border border-ink bg-ink text-[13px] font-semibold text-white"
                          : "h-11 w-8 rounded-lg border border-line bg-white text-[13px] font-semibold"
                      }
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {item.key === "presentation_c" ? (
                <>
                  <label
                    htmlFor={`c-${item.key}`}
                    className="text-xs font-semibold"
                  >
                    Comment on C
                  </label>
                  <input
                    id={`c-${item.key}`}
                    placeholder="What would raise this score?"
                    value={comments[activeTeam]?.[item.key] ?? ""}
                    onChange={(e) =>
                      setComments((c) => ({
                        ...c,
                        [activeTeam]: {
                          ...c[activeTeam],
                          [item.key]: e.target.value,
                        },
                      }))
                    }
                    className="h-10 rounded-[10px] border border-line px-2.5 text-sm"
                  />
                </>
              ) : null}
            </div>
          ),
        )}

        <div className="flex flex-col gap-2 border-t border-[#ECEEF1] py-3">
          <strong className="text-sm">Spirit points</strong>
          <span className="text-[13px] text-[#3B404A]">
            Separate feedback sheet, 1 to 5
          </span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSpirit(n)}
                className={
                  spirit === n
                    ? "h-11 w-10 rounded-lg border border-ink bg-ink font-semibold text-white"
                    : "h-11 w-10 rounded-lg border border-line font-semibold"
                }
              >
                {n}
              </button>
            ))}
          </div>
          <label htmlFor="overall" className="text-xs font-semibold">
            Overall comment
          </label>
          <input
            id="overall"
            value={overall}
            onChange={(e) => setOverall(e.target.value)}
            placeholder="What stood out?"
            className="h-10 rounded-[10px] border border-line px-2.5 text-sm"
          />
        </div>

        <span className="pb-2 pt-1.5 text-xs text-muted">
          Scroll for commentary, responses and spirit points
        </span>
      </div>

      <div className="flex items-center gap-2.5 border-t border-line px-[18px] py-3 pb-[18px]">
        <button
          type="button"
          onClick={onMarkMoment}
          className="h-[50px] flex-1 rounded-xl bg-gold text-[15px] font-bold text-ink"
        >
          Mark this moment
        </button>
        <span className="text-right">
          <span className="font-display text-[26px] font-extrabold">{soFar}</span>
          <span className="text-xs text-muted">/30 so far</span>
        </span>
      </div>

      <div className="px-[18px] pb-6">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="h-12 w-full rounded-xl bg-ink text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy ? "Sending…" : "Submit card"}
        </button>
      </div>
    </div>
  );
}
