"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AssignButton } from "@/components/assign-button";
import { Button } from "@/components/ui/button";
import type {
  ClaimChangeProposal,
  ClaimMapBody,
  ClaimMapConfirmation,
  ClaimMapVersion,
} from "@/lib/team/types";

export default function CaseClaimMapPage() {
  return (
    <Suspense fallback={<main className="p-4 text-sm text-muted">Loading…</main>}>
      <CaseClaimMapInner />
    </Suspense>
  );
}

function CaseClaimMapInner() {
  const params = useParams<{ caseId: string }>();
  const search = useSearchParams();
  const caseId = params.caseId;
  const [teamId, setTeamId] = useState(search.get("teamId") ?? "");
  const [current, setCurrent] = useState<ClaimMapVersion | null>(null);
  const [confirmations, setConfirmations] = useState<ClaimMapConfirmation[]>(
    [],
  );
  const [proposals, setProposals] = useState<ClaimChangeProposal[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [summary, setSummary] = useState("");
  const [claimEdits, setClaimEdits] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [readAloud, setReadAloud] = useState<{
    script: string;
    version: number | null;
    source: string;
    caseNumber: number | null;
  } | null>(null);

  const load = useCallback(async () => {
    let tid = teamId;
    if (!tid) {
      const board = await fetch("/api/team/board").then((r) => r.json());
      tid = board.teamId;
      setTeamId(tid);
      setPeople(
        (board.board?.people ?? []).map((p: { id: string; name: string }) => ({
          id: p.id,
          name: p.name,
        })),
      );
    }
    const res = await fetch(
      `/api/team/claim-maps?teamId=${tid}&caseId=${caseId}`,
    );
    const data = await res.json();
    setCurrent(data.current);
    setConfirmations(data.confirmations ?? []);
    setProposals(data.proposals ?? []);
    if (data.current?.body?.claims) {
      const map: Record<string, string> = {};
      for (const c of data.current.body.claims as { key: string; text: string }[]) {
        map[c.key] = c.text;
      }
      setClaimEdits(map);
    }
    const aloud = await fetch(
      `/api/team/read-aloud?teamId=${tid}&caseId=${caseId}`,
    );
    if (aloud.ok) {
      const body = await aloud.json();
      setReadAloud(body);
    }
  }, [caseId, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSupportEdit() {
    if (!current || !teamId || !summary.trim()) {
      setMsg("Add a one-line reason for the change.");
      return;
    }
    const body: ClaimMapBody = JSON.parse(JSON.stringify(current.body));
    // Non-claim edit: bump logic line so a new version publishes
    if (body.claims[0]) {
      body.claims[0].logic_line = `${body.claims[0].logic_line} (revised)`;
    }
    const res = await fetch("/api/team/claim-maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        teamId,
        caseId,
        mapBody: body,
        changeSummary: summary,
      }),
    });
    setMsg(res.ok ? `Published v${(current.version ?? 0) + 1}` : "Failed");
    setSummary("");
    await load();
  }

  async function proposeClaim(key: string) {
    if (!teamId || !reason.trim() || !claimEdits[key]) return;
    const res = await fetch("/api/team/claim-maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "propose_claim",
        teamId,
        caseId,
        claimKey: key,
        newText: claimEdits[key],
        reason,
      }),
    });
    setMsg(
      res.ok
        ? "Claim change proposed — needs lead + one more teammate."
        : "Could not propose",
    );
    setReason("");
    await load();
  }

  async function accept(proposalId: string) {
    await fetch("/api/team/claim-maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "accept_claim", proposalId }),
    });
    await load();
  }

  async function confirm() {
    if (!current) return;
    await fetch("/api/team/claim-maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", versionId: current.id }),
    });
    setMsg(`I've got v${current.version}`);
    await load();
  }

  return (
    <main className="animate-fade-up mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/team" className="text-xs text-muted underline">
          ← Team board
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">
          Claim map {current ? `v${current.version}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">
          One current position. Claim text needs two-person approval; supports
          create a version with a one-line reason.
        </p>
      </div>

      {teamId ? (
        <div className="flex flex-wrap gap-3">
          <AssignButton
            teamId={teamId}
            caseId={caseId}
            targetKind="case"
            people={people}
            defaultTask="Prep this case"
          />
          <AssignButton
            teamId={teamId}
            caseId={caseId}
            targetKind="one_pager"
            people={people}
            defaultTask="Refresh one-pager from claim map"
          />
          <AssignButton
            teamId={teamId}
            caseId={caseId}
            targetKind="deck"
            people={people}
            defaultTask="Review flashcards for this case"
          />
          <AssignButton
            teamId={teamId}
            caseId={caseId}
            targetKind="reading"
            people={people}
            defaultTask="Read the linked sources"
          />
          <AssignButton
            teamId={teamId}
            caseId={caseId}
            targetKind="practice"
            people={people}
            defaultTask="Book a practice slot"
          />
        </div>
      ) : null}

      {readAloud ? (
        <section className="space-y-2 rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-lg font-semibold">
            State of the case, out loud
          </h2>
          <p className="text-sm text-muted">
            About two minutes. The supporter reads this so the room starts from
            the same version
            {readAloud.version ? ` (v${readAloud.version})` : ""}.
          </p>
          {readAloud.source === "empty" ? (
            <p className="text-sm text-muted">{readAloud.script}</p>
          ) : (
            <pre className="whitespace-pre-wrap rounded-xl bg-[#F7F8FA] p-3 text-sm leading-relaxed">
              {readAloud.script}
            </pre>
          )}
        </section>
      ) : null}

      {current ? (
        <section className="space-y-4 rounded-2xl border border-ink/10 bg-white/70 p-4">
          <p className="text-xs text-muted">{current.change_summary}</p>
          {current.body.claims.map((c) => (
            <div key={c.key} className="space-y-2 border-t border-ink/5 pt-3">
              <label className="block text-sm font-medium">
                {c.key.toUpperCase()}
                <textarea
                  className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2 text-sm"
                  value={claimEdits[c.key] ?? c.text}
                  onChange={(e) =>
                    setClaimEdits((prev) => ({
                      ...prev,
                      [c.key]: e.target.value,
                    }))
                  }
                />
              </label>
              <ul className="list-disc pl-5 text-xs text-muted">
                {c.supports.map((s) => (
                  <li key={s.key}>{s.text}</li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void proposeClaim(c.key)}
              >
                Propose claim change
              </Button>
            </div>
          ))}
          <label className="block text-sm">
            Reason (required for claim change)
            <input
              className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </section>
      ) : (
        <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <p className="text-sm text-muted">
            No claim map yet for this case. When your team publishes the first
            version, it will show here with a short reason for each change.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
        <h2 className="font-display text-lg font-semibold">
          Non-claim edit (creates version now)
        </h2>
        <input
          className="mt-2 w-full rounded-xl border border-ink/15 px-3 py-2 text-sm"
          placeholder="What changed and why (one line)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <Button className="mt-3" onClick={() => void saveSupportEdit()}>
          Publish new version
        </Button>
      </section>

      {proposals.length ? (
        <section className="space-y-2 rounded-2xl border border-gold/40 bg-gold/10 p-4">
          <h2 className="font-display text-lg font-semibold">
            Pending claim approvals
          </h2>
          {proposals.map((p) => (
            <div key={p.id} className="text-sm">
              <p>
                <span className="line-through text-muted">{p.old_text}</span>
                <br />
                <span>{p.new_text}</span>
              </p>
              <p className="text-xs text-muted">{p.reason}</p>
              <p className="text-xs text-muted">
                Lead OK: {p.lead_accepter_id ? "yes" : "no"}, Second:{" "}
                {p.second_accepter_id ? "yes" : "no"}
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => void accept(p.id)}
              >
                Accept
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
        <h2 className="font-display text-lg font-semibold">Confirmations</h2>
        <p className="text-sm text-muted">
          {confirmations.length
            ? `${confirmations.length} teammate(s) confirmed this version.`
            : "No one has confirmed this version yet. Tap below once you have read it."}
        </p>
        <Button className="mt-3" variant="gold" onClick={() => void confirm()}>
          I&apos;ve got v{current?.version ?? "?"}
        </Button>
      </section>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
    </main>
  );
}
