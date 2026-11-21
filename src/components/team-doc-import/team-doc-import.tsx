"use client";

import { useCallback, useEffect, useState } from "react";

type CaseOpt = { id: string; number: number; title: string; active: boolean };
type TeamOpt = { id: string; name: string };

type Props = {
  /** Pre-selected team (caller's team). */
  teamId?: string | null;
  /** Pre-selected case (when opened from case brain). */
  caseId?: string | null;
  /** Compact trigger label. */
  label?: string;
  className?: string;
  onImported?: (result: {
    proposalsCreated: number;
    inspiredOffered: number;
    message: string;
  }) => void;
};

/**
 * Small "Import a team doc" action: Drive link or paste.
 * Ideas land in that team's Truth Sources queue (origin Team doc).
 */
export function TeamDocImport({
  teamId: initialTeamId,
  caseId: initialCaseId,
  label = "Import a team doc",
  className,
  onImported,
}: Props) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [cases, setCases] = useState<CaseOpt[]>([]);
  const [teamId, setTeamId] = useState(initialTeamId ?? "");
  const [caseId, setCaseId] = useState(initialCaseId ?? "");
  const [driveUrl, setDriveUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/case-brain/cases");
    if (!res.ok) return;
    const body = (await res.json()) as {
      cases?: CaseOpt[];
      teams?: TeamOpt[];
      myTeamId?: string | null;
    };
    setCases((body.cases ?? []).filter((c) => c.active));
    setTeams(body.teams ?? []);
    if (!teamId && (initialTeamId || body.myTeamId)) {
      setTeamId(initialTeamId || body.myTeamId || "");
    }
    if (!caseId && initialCaseId) setCaseId(initialCaseId);
    if (!caseId && !initialCaseId && body.cases?.length) {
      const first = body.cases.find((c) => c.active);
      if (first) setCaseId(first.id);
    }
  }, [caseId, initialCaseId, initialTeamId, teamId]);

  useEffect(() => {
    if (open) void loadMeta();
  }, [open, loadMeta]);

  async function submit() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/team-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: teamId || undefined,
          caseId,
          driveUrl: driveUrl.trim() || null,
          pastedText: pastedText.trim() || null,
          title: title.trim() || null,
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        proposalsCreated?: number;
        inspiredOffered?: number;
      };
      if (!res.ok || !body.ok) {
        setStatus(body.error ?? "Import failed.");
        return;
      }
      const message = body.message ?? "Import complete.";
      setStatus(message);
      onImported?.({
        proposalsCreated: body.proposalsCreated ?? 0,
        inspiredOffered: body.inspiredOffered ?? 0,
        message,
      });
      setPastedText("");
      setDriveUrl("");
    } catch {
      setStatus("Import failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--crux-line)] bg-white px-3 py-2 text-sm font-medium text-[var(--crux-ink)] hover:border-[var(--crux-cardinal)]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
      </button>

      {open ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-[var(--crux-line)] bg-white p-4 shadow-sm">
          <p className="text-sm text-[var(--crux-muted)]">
            Paste a Google Doc or Drive link the service account can read, or
            paste the doc text. Cruxy splits it into ideas for your Truth
            Sources queue. Re-importing only adds what changed.
          </p>

          {teams.length > 1 ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Team</span>
              <select
                className="min-h-11 w-full rounded-xl border border-[var(--crux-line)] px-3"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Case</span>
            <select
              className="min-h-11 w-full rounded-xl border border-[var(--crux-line)] px-3"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              required
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  Case {c.number}: {c.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Drive or Docs link</span>
            <input
              type="url"
              className="min-h-11 w-full rounded-xl border border-[var(--crux-line)] px-3"
              placeholder="https://docs.google.com/document/d/…"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Or paste the doc</span>
            <textarea
              className="min-h-32 w-full rounded-xl border border-[var(--crux-line)] px-3 py-2 font-[family-name:var(--font-plex-mono)] text-sm"
              placeholder="Paste notes, claims, supports…"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
          </label>

          {pastedText.trim() && !driveUrl.trim() ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Title (optional)</span>
              <input
                className="min-h-11 w-full rounded-xl border border-[var(--crux-line)] px-3"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Team 3 Case 1 working notes"
              />
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !caseId || (!driveUrl.trim() && !pastedText.trim())}
              className="min-h-11 rounded-xl bg-[var(--crux-ink)] px-4 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void submit()}
            >
              {busy ? "Importing…" : "Import"}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-[var(--crux-line)] px-4 text-sm"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          {status ? (
            <p className="text-sm text-[var(--crux-ink)]" role="status">
              {status}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default TeamDocImport;
