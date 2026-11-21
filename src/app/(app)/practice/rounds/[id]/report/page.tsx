"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppeScoringCard } from "@/components/practice/appe-scoring-card";

export default function RoundReportPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{
    report: { headline: string; socratic_followups: string[] } | null;
    feedback: {
      id: string;
      person_id: string;
      kind: string;
      quote_line_id: string | null;
      reasoning: string;
      better_version: string | null;
      scoring_item: string | null;
    }[];
    redos: {
      id: string;
      feedback_item_id: string;
      score_before: number | null;
      score_after: number | null;
      open: boolean;
    }[];
    cards: { id: string; team_id: string; cruxy: boolean }[];
    scores: {
      card_id: string;
      item: string;
      score: number;
      evidence_line_ids: string[];
    }[];
    lines: { id: string; text: string; start_ms: number }[];
    round: {
      sides: { commenting: string | null };
      team_ids: string[];
      mode: string;
    };
  } | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  async function refresh() {
    const [rep, sess] = await Promise.all([
      fetch(`/api/practice/rounds/${params.id}/report`).then((r) => r.json()),
      fetch("/api/practice/sessions").then((r) => r.json()),
    ]);
    setData(rep);
    setTeams(sess.teams ?? []);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

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

  async function doRedo(id: string) {
    await fetch(`/api/practice/redos/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    await refresh();
  }

  if (!data) {
    return <p className="text-sm text-muted">Loading report…</p>;
  }

  const lineById = Object.fromEntries(data.lines.map((l) => [l.id, l]));

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Round report</h1>
        <p className="mt-2 text-lg">{data.report?.headline ?? "No report yet — end the round first."}</p>
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
        <h2 className="font-display text-xl font-semibold">Scorecard</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.scores.map((s) => {
            const card = data.cards.find((c) => c.id === s.card_id);
            return (
              <li key={`${s.card_id}-${s.item}`} className="border-b border-ink/5 pb-2">
                <span className="font-medium">{s.item}</span>{" "}
                <span className="font-mono">{s.score}</span>
                {card?.cruxy ? " · Cruxy" : ""}
                {s.evidence_line_ids?.[0] ? (
                  <p className="text-xs text-muted">
                    Evidence: “{lineById[s.evidence_line_ids[0]]?.text ?? s.evidence_line_ids[0]}”
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Personal feedback</h2>
        {data.feedback.map((f) => {
          const quote = f.quote_line_id ? lineById[f.quote_line_id] : null;
          const redo = data.redos.find((r) => r.feedback_item_id === f.id);
          return (
            <div
              key={f.id}
              className="rounded-2xl border border-ink/10 bg-white/70 p-4"
            >
              <p className="text-xs uppercase tracking-wide text-muted">
                {f.kind}
                {f.scoring_item ? ` · ${f.scoring_item}` : ""}
              </p>
              {quote ? (
                <blockquote className="mt-2 border-l-2 border-gold pl-3 text-sm italic">
                  “{quote.text}”{" "}
                  <span className="not-italic text-xs text-muted">
                    @{(quote.start_ms / 1000).toFixed(1)}s
                  </span>
                </blockquote>
              ) : (
                <p className="mt-2 text-xs text-cardinal">
                  (hidden — no transcript citation)
                </p>
              )}
              <p className="mt-2 text-sm">{f.reasoning}</p>
              {f.better_version ? (
                <p className="mt-2 text-sm">
                  <span className="font-medium">Better version: </span>
                  {f.better_version}
                </p>
              ) : null}
              {redo ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">
                    Redo {redo.open ? "open" : "done"} · before{" "}
                    {redo.score_before ?? "—"} → after {redo.score_after ?? "—"}
                  </span>
                  {redo.open ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void doRedo(redo.id)}
                    >
                      Redo now (scored)
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      {data.report?.socratic_followups?.length ? (
        <section>
          <h2 className="font-display text-lg font-semibold">Socratic follow-ups</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {data.report.socratic_followups.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-lg font-semibold">Peer judge this recording</h2>
        <AppeScoringCard
          teams={data.round.team_ids.map(
            (id) => teams.find((t) => t.id === id) ?? { id, name: id.slice(0, 6) },
          )}
          hasCommentingTeam={Boolean(data.round.sides.commenting)}
          hasJudgesQa={data.round.mode === "full_round"}
          predictFirst
          onSubmit={async (p) => {
            await submitPeer(p);
          }}
        />
      </section>

      <Link href={`/practice/rounds/${params.id}`} className="text-sm underline">
        Back to round
      </Link>
    </main>
  );
}
