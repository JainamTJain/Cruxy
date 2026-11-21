"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OriginTag } from "@/components/case-brain/origin-tag";
import { RobustnessBar } from "@/components/case-brain/robustness-bar";
import type {
  CaseBrainSnapshot,
  CaseRoleKind,
  DecisionVerdict,
} from "@/lib/case-brain/types";
import type { CaseRow, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

type PersonLite = { id: string; name: string; team_id: string | null };

type Payload = {
  case: CaseRow | null;
  teams: Team[];
  people: PersonLite[];
  brain: CaseBrainSnapshot;
  canEdit: boolean;
  viewer: { personId: string; teamId: string; name: string };
};

const ROLE_LABELS: Record<CaseRoleKind, string> = {
  lead_1: "Lead 1",
  lead_2: "Lead 2",
  counter_arguer: "Counter-arguer",
  supporter: "Supporter",
};

function originLabel(
  proposal: CaseBrainSnapshot["proposals"][number],
  teams: Team[],
) {
  if (proposal.origin === "inspired_by_team") {
    const t = teams.find((x) => x.id === proposal.inspired_from_team_id);
    return t ? `Inspired by ${t.name}` : "Inspired by Team";
  }
  if (proposal.origin === "research") return "Cruxy research";
  if (proposal.origin === "transcript") return "Practice transcript";
  if (proposal.origin === "reading") return "Reading room";
  return "Team member";
}

export function CaseBrainClient({
  caseId,
  initialTeamId,
}: {
  caseId: string;
  initialTeamId?: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [teamId, setTeamId] = useState(initialTeamId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [claimDrafts, setClaimDrafts] = useState<Record<string, string>>({});
  const [newProposal, setNewProposal] = useState("");
  const [principle, setPrinciple] = useState("");
  const [tab, setTab] = useState<
    "map" | "truth" | "queue" | "oppose" | "checks" | "history"
  >("map");

  const load = useCallback(async (tid?: string) => {
    setError(null);
    const q = tid ? `?teamId=${encodeURIComponent(tid)}` : "";
    const res = await fetch(`/api/case-brain/${caseId}${q}`);
    const json = (await res.json()) as Payload & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load case brain");
      return;
    }
    setData(json);
    setTeamId(json.brain.team_id);
    setPrinciple(json.brain.principles[0]?.principle ?? "");
    const drafts: Record<string, string> = {};
    for (const node of json.brain.claims) {
      drafts[node.claim.id] = node.claim.text;
    }
    setClaimDrafts(drafts);
  }, [caseId]);

  useEffect(() => {
    void load(initialTeamId);
  }, [load, initialTeamId]);

  const teamPeople = useMemo(() => {
    if (!data) return [];
    return data.people.filter((p) => p.team_id === data.brain.team_id);
  }, [data]);

  async function api(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; error?: string }> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Request failed");
        return { ok: false, error: json.error };
      }
      await load(teamId);
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }

  async function saveClaim(claimId: string) {
    const reason = reasonDrafts[`claim:${claimId}`]?.trim() ?? "";
    await api("/api/case-brain/claims", {
      method: "PATCH",
      body: JSON.stringify({
        claimId,
        text: claimDrafts[claimId],
        reason,
      }),
    });
  }

  async function decide(
    proposalId: string,
    verdict: DecisionVerdict,
  ) {
    const reason = reasonDrafts[`prop:${proposalId}`]?.trim() ?? "";
    await api("/api/case-brain/decisions", {
      method: "POST",
      body: JSON.stringify({
        proposalId,
        verdict,
        reason,
        editedText: editDrafts[proposalId] ?? null,
      }),
    });
  }

  if (!data) {
    return (
      <p className="text-sm text-muted">
        {error ?? "Loading case brain…"}
      </p>
    );
  }

  const { brain, case: caseRow, teams, canEdit } = data;
  const pending = brain.proposals.filter((p) => p.status === "pending");

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-muted">
            Case brain
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            <span className="font-mono text-base text-muted">
              {String(caseRow?.number ?? "").padStart(2, "0")}
            </span>{" "}
            {caseRow?.title ?? "Case"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {canEdit
              ? "Editing your team's map. Accept / reject / edit needs a reason."
              : "Read-only view of another team's brain."}
          </p>
        </div>
        <label className="text-xs text-muted">
          Team
          <select
            className="ml-2 rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink"
            value={teamId}
            onChange={(e) => {
              const next = e.target.value;
              setTeamId(next);
              void load(next);
            }}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.id === data.viewer.teamId ? " (yours)" : ""}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? (
        <p className="rounded-xl border border-cardinal/30 bg-cardinal/5 px-3 py-2 text-sm text-cardinal">
          {error}
        </p>
      ) : null}

      <RobustnessBar scores={brain.robustness} />

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <h2 className="font-display text-lg font-semibold">Case roles</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(ROLE_LABELS) as CaseRoleKind[]).map((role) => {
            const current = brain.case_roles.find((r) => r.role === role);
            return (
              <label key={role} className="text-xs text-muted">
                {ROLE_LABELS[role]}
                <select
                  disabled={!canEdit || busy}
                  className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-2 py-2 text-sm text-ink disabled:opacity-60"
                  value={current?.person_id ?? ""}
                  onChange={(e) => {
                    const personId = e.target.value;
                    if (!personId) return;
                    void api("/api/case-brain/roles", {
                      method: "POST",
                      body: JSON.stringify({
                        caseId,
                        personId,
                        role,
                      }),
                    });
                  }}
                >
                  <option value="">Unassigned</option>
                  {teamPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </section>

      <nav className="flex flex-wrap gap-2">
        {(
          [
            ["map", "Claim map"],
            ["truth", "Truth Sources"],
            ["queue", `Queue (${pending.length})`],
            ["oppose", "Opposing"],
            ["checks", "Checks"],
            ["history", "History"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              tab === id ? "bg-ink text-white" : "bg-white/70 text-ink/80",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "map" ? (
        <section className="space-y-4">
          {brain.claims.map((node, idx) => (
            <article
              key={node.claim.id}
              className="rounded-2xl border border-ink/10 bg-white/70 p-4"
            >
              <h3 className="font-display text-xl font-semibold">
                Claim {idx + 1}
              </h3>
              <textarea
                disabled={!canEdit || busy}
                className="mt-2 w-full rounded-xl border border-ink/15 bg-paper/50 p-3 text-sm"
                rows={2}
                value={claimDrafts[node.claim.id] ?? node.claim.text}
                onChange={(e) =>
                  setClaimDrafts((d) => ({
                    ...d,
                    [node.claim.id]: e.target.value,
                  }))
                }
              />
              <p className="mt-2 text-xs text-muted">
                Logic: {node.claim.logic_line}
              </p>
              {canEdit ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <input
                    className="min-w-[200px] flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm"
                    placeholder="Why this change? (required)"
                    value={reasonDrafts[`claim:${node.claim.id}`] ?? ""}
                    onChange={(e) =>
                      setReasonDrafts((d) => ({
                        ...d,
                        [`claim:${node.claim.id}`]: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveClaim(node.claim.id)}
                    className="rounded-xl bg-cardinal px-3 py-2 text-sm font-medium text-white"
                  >
                    Save claim
                  </button>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {node.supports.map((s, j) => (
                  <div
                    key={s.support.id}
                    className="rounded-xl border border-ink/5 bg-paper/40 p-3"
                  >
                    <p className="text-xs font-medium text-muted">
                      Support {j + 1}
                    </p>
                    <p className="text-sm">{s.support.text}</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {s.backings.map((b) => (
                        <li key={b.id}>
                          <span className="font-mono uppercase">{b.kind}</span>
                          : {b.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {node.counterclaims.map((cc) => (
                  <div
                    key={cc.id}
                    className="rounded-xl border border-ink/5 bg-mist/40 p-3 text-sm"
                  >
                    <p className="font-medium">Counterclaim</p>
                    <p>{cc.text}</p>
                    <p className="mt-1 text-xs text-muted">Concede: {cc.concede}</p>
                    <p className="text-xs text-muted">
                      Distinguish: {cc.distinguish}
                    </p>
                    <p className="text-xs text-muted">Rebut: {cc.rebut}</p>
                  </div>
                ))}
              </div>

              {brain.change_the_facts.filter((c) => c.claim_id === node.claim.id)
                .length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Change the facts
                  </p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {brain.change_the_facts
                      .filter((c) => c.claim_id === node.claim.id)
                      .map((c) => (
                        <li key={c.id} className="rounded-xl bg-gold/10 px-3 py-2">
                          <p>{c.fact}</p>
                          <p className="text-xs text-muted">{c.why_flips}</p>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {tab === "truth" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">
            Accepted facts, quotes, examples and frameworks. Cruxy proposes;
            people decide.
          </p>
          {brain.truth_items.length === 0 ? (
            <p className="text-sm text-muted">No Truth Sources yet.</p>
          ) : (
            brain.truth_items.map((t) => (
              <article
                key={t.id}
                className="rounded-2xl border border-ink/10 bg-white/70 p-4"
              >
                <OriginTag label={t.kind} />
                <p className="mt-2 text-sm">{t.text}</p>
                <p className="mt-1 font-mono text-[10px] text-muted">
                  {t.citation_ids.length
                    ? `${t.citation_ids.length} citation(s)`
                    : "needs check"}
                </p>
              </article>
            ))
          )}
        </section>
      ) : null}

      {tab === "queue" ? (
        <section className="space-y-4">
          {canEdit ? (
            <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
              <h3 className="font-display text-lg font-semibold">
                Propose a Truth Source
              </h3>
              <textarea
                className="mt-2 w-full rounded-xl border border-ink/15 p-3 text-sm"
                rows={3}
                value={newProposal}
                onChange={(e) => setNewProposal(e.target.value)}
                placeholder="Idea for the team to accept, reject or edit…"
              />
              <button
                type="button"
                disabled={busy || !newProposal.trim()}
                className="mt-2 rounded-xl bg-ink px-3 py-2 text-sm text-white disabled:opacity-50"
                onClick={() =>
                  void api("/api/case-brain/proposals", {
                    method: "POST",
                    body: JSON.stringify({
                      caseId,
                      text: newProposal,
                      kind: "fact",
                      origin: "member",
                    }),
                  }).then((r) => {
                    if (r.ok) setNewProposal("");
                  })
                }
              >
                Add to queue
              </button>
            </div>
          ) : null}

          {pending.length === 0 ? (
            <p className="text-sm text-muted">Queue is clear.</p>
          ) : (
            pending.map((p) => {
              const peers = brain.peer_decisions_by_idea[p.idea_key] ?? [];
              return (
                <article
                  key={p.id}
                  className="rounded-2xl border border-ink/10 bg-white/70 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <OriginTag label={originLabel(p, teams)} />
                    {p.cruxy_note ? (
                      <span className="rounded-md bg-gold/20 px-2 py-0.5 text-[11px] text-ink">
                        Analyst: {p.cruxy_note}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted">
                        Passed acceptable / relevant / sufficient
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm">{p.text}</p>

                  {p.origin === "inspired_by_team" && !p.socratic_answered ? (
                    <div className="mt-3 rounded-xl border border-gold/40 bg-gold/10 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide">
                        Cruxy asks first
                      </p>
                      <p className="mt-1 text-sm">{p.socratic_question}</p>
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="mt-2 rounded-xl bg-ink px-3 py-2 text-xs text-white"
                          onClick={() =>
                            void api("/api/case-brain/proposals", {
                              method: "PATCH",
                              body: JSON.stringify({
                                proposalId: p.id,
                                action: "socratic_answered",
                              }),
                            })
                          }
                        >
                          I&apos;ve thought it through
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {peers.length > 0 ? (
                    <div className="mt-3 rounded-xl bg-mist/50 p-3 text-xs">
                      <p className="font-medium">Other teams on this idea</p>
                      <ul className="mt-1 space-y-1">
                        {peers.map((d) => (
                          <li key={d.id}>
                            {d.team_name}: {d.verdict} — {d.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {canEdit ? (
                    <div className="mt-3 space-y-2">
                      <input
                        className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm"
                        placeholder="Reason (required)"
                        value={reasonDrafts[`prop:${p.id}`] ?? ""}
                        onChange={(e) =>
                          setReasonDrafts((d) => ({
                            ...d,
                            [`prop:${p.id}`]: e.target.value,
                          }))
                        }
                      />
                      <input
                        className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm"
                        placeholder="Edited text (for edit)"
                        value={editDrafts[p.id] ?? ""}
                        onChange={(e) =>
                          setEditDrafts((d) => ({
                            ...d,
                            [p.id]: e.target.value,
                          }))
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-xl bg-team3 px-3 py-2 text-sm text-white"
                          style={{ background: "var(--crux-team-3)" }}
                          onClick={() => void decide(p.id, "accept")}
                          title="Accept"
                        >
                          ✓ Accept
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-xl bg-cardinal px-3 py-2 text-sm text-white"
                          onClick={() => void decide(p.id, "reject")}
                          title="Reject"
                        >
                          ✕ Reject
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm"
                          onClick={() => void decide(p.id, "edit")}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      ) : null}

      {tab === "oppose" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">
            Likely positions other universities will bring — commenter prep.
          </p>
          {brain.opposing_positions.map((o) => (
            <article
              key={o.id}
              className="rounded-2xl border border-ink/10 bg-white/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-semibold">{o.title}</h3>
                <OriginTag label={o.origin} />
              </div>
              <p className="mt-2 text-sm">
                <span className="text-muted">Strongest: </span>
                {o.strongest_support}
              </p>
              <p className="mt-1 text-sm">
                <span className="text-muted">Weak point: </span>
                {o.weak_point}
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                {o.commentary_angles.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "checks" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
            <h3 className="font-display text-lg font-semibold">
              Cross-case principle
            </h3>
            <p className="mt-1 text-sm text-muted">
              Used for consistency checks across your cases.
            </p>
            <textarea
              disabled={!canEdit || busy}
              className="mt-2 w-full rounded-xl border border-ink/15 p-3 text-sm"
              rows={2}
              value={principle}
              onChange={(e) => setPrinciple(e.target.value)}
              placeholder="e.g. Prefer the least restrictive tool that prevents serious harm"
            />
            {canEdit ? (
              <button
                type="button"
                disabled={busy || !principle.trim()}
                className="mt-2 rounded-xl bg-ink px-3 py-2 text-sm text-white disabled:opacity-50"
                onClick={() =>
                  void api("/api/case-brain/principles", {
                    method: "POST",
                    body: JSON.stringify({ caseId, principle }),
                  })
                }
              >
                Save principle
              </button>
            ) : null}
          </div>

          {brain.consistency_flags.length === 0 ? (
            <p className="text-sm text-muted">
              No cross-case clashes flagged for this case yet.
            </p>
          ) : (
            brain.consistency_flags.map((f) => (
              <article
                key={f.id}
                className="rounded-2xl border border-cardinal/20 bg-cardinal/5 p-4 text-sm"
              >
                <p className="font-medium">Consistency flag</p>
                <p className="mt-1">{f.note}</p>
                <p className="mt-2 text-xs text-muted">A: {f.principle_a}</p>
                <p className="text-xs text-muted">B: {f.principle_b}</p>
              </article>
            ))
          )}
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="space-y-2">
          {brain.history.length === 0 ? (
            <p className="text-sm text-muted">No history yet.</p>
          ) : (
            brain.history.slice(0, 40).map((h) => (
              <article
                key={h.id}
                className="rounded-xl border border-ink/5 bg-white/60 px-3 py-2 text-xs"
              >
                <p className="font-mono text-muted">
                  {new Date(h.at).toLocaleString()} · {h.action}
                </p>
                {h.reason ? <p className="mt-1">Reason: {h.reason}</p> : null}
                {h.after ? (
                  <p className="mt-1 text-muted">
                    {JSON.stringify(h.after).slice(0, 160)}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}
