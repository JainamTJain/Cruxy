"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OnePager } from "@/lib/revision/types";
import type { CaseRow, Team } from "@/lib/types";

type Meta = { cases: CaseRow[]; teams: Team[] };

export default function OnePagersPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [teamId, setTeamId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [page, setPage] = useState<OnePager | null>(null);
  const [diff, setDiff] = useState<
    { path: string; before: string; after: string }[]
  >([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/revision/one-pagers");
      const data = (await res.json()) as Meta;
      setMeta(data);
      if (data.teams[0]) setTeamId(data.teams[0].id);
      if (data.cases[0]) setCaseId(data.cases[0].id);
    })();
  }, []);

  async function load() {
    if (!teamId || !caseId) return;
    const res = await fetch(
      `/api/revision/one-pagers?teamId=${teamId}&caseId=${caseId}`,
    );
    const data = (await res.json()) as {
      onePager: OnePager | null;
      diff: typeof diff;
    };
    setPage(data.onePager);
    setDiff(data.diff);
  }

  useEffect(() => {
    if (teamId && caseId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, caseId]);

  async function draft() {
    setStatus("Drafting…");
    const res = await fetch("/api/revision/one-pagers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "draft", teamId, caseId }),
    });
    const data = (await res.json()) as { onePager: OnePager };
    setPage(data.onePager);
    setStatus(`Drafted v${data.onePager.version}`);
    await load();
  }

  async function signOff() {
    if (!page) return;
    await fetch("/api/revision/one-pagers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "signoff", onePagerId: page.id }),
    });
    setStatus("Signed off");
    await load();
  }

  async function exportDrive() {
    if (!page) return;
    const res = await fetch("/api/revision/one-pagers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "export", onePagerId: page.id }),
    });
    const data = (await res.json()) as { drive_doc_id: string; stub: boolean };
    setStatus(
      data.stub
        ? `Drive export stub: ${data.drive_doc_id} (needs DRIVE_ROOT_FOLDER_ID)`
        : `Exported ${data.drive_doc_id}`,
    );
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">One pagers</h1>
        <p className="mt-1 text-sm text-muted">
          Visual printable page from your claim map. Cruxy drafts; the team edits and
          signs off.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {meta?.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {meta?.cases.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.number).padStart(2, "0")} {c.title}
            </option>
          ))}
        </select>
        <Button type="button" onClick={() => void draft()}>
          Draft / re-draft
        </Button>
        <Button type="button" variant="secondary" onClick={() => void signOff()}>
          Sign off
        </Button>
        <Button type="button" variant="ghost" onClick={() => void exportDrive()}>
          Export to Drive
        </Button>
      </div>
      {status ? <p className="text-xs text-muted">{status}</p> : null}

      {page ? (
        <div className="space-y-6 print:bg-white">
          <div className="rounded-2xl border border-ink/10 bg-white/80 p-5">
            <p className="text-xs text-muted">
              v{page.version} · {page.origin_tag} ·{" "}
              {page.body.empty_rows.length
                ? `${page.body.empty_rows.length} empty rows`
                : "complete"}{" "}
              · signed by {page.signed_off_by.length}
            </p>
            <div className="mt-4 space-y-4">
              {page.body.claims.map((c, i) => (
                <div key={i}>
                  <h2 className="font-display text-lg font-semibold">
                    Claim {i + 1}
                  </h2>
                  <p className="text-sm">{c.text || <em className="text-muted">empty</em>}</p>
                  <p className="mt-1 text-xs text-muted">Because… {c.logic_line || "—"}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {c.supports.map((s, j) => (
                      <li key={j}>{s || <em className="text-muted">empty support</em>}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {page.body.counterclaim ? (
                <div>
                  <h2 className="font-display text-lg font-semibold">Counterclaim</h2>
                  <p className="text-sm">{page.body.counterclaim.text}</p>
                  <p className="mt-2 text-xs">
                    Concede: {page.body.counterclaim.concede}
                  </p>
                  <p className="text-xs">
                    Distinguish: {page.body.counterclaim.distinguish}
                  </p>
                  <p className="text-xs">Rebut: {page.body.counterclaim.rebut}</p>
                </div>
              ) : null}
            </div>
          </div>

          <section>
            <h2 className="font-display text-xl font-semibold">Visuals</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {page.body.visuals.map((v) => (
                <div
                  key={v.kind}
                  className="rounded-2xl border border-ink/10 bg-mist/40 p-4"
                >
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {v.kind.replace(/_/g, " ")}
                  </p>
                  <h3 className="font-display font-semibold">{v.title}</h3>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-ink/80">
                    {JSON.stringify(v.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </section>

          {diff.length ? (
            <section>
              <h2 className="font-display text-xl font-semibold">Diff since last</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {diff.map((d) => (
                  <li key={d.path} className="rounded-xl bg-white/70 px-3 py-2">
                    <span className="font-mono text-xs text-muted">{d.path}</span>
                    <div>
                      <span className="line-through text-muted">{d.before || "∅"}</span>
                      {" → "}
                      <span className="text-cardinal">{d.after || "∅"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">No one pager yet — draft one.</p>
      )}
    </main>
  );
}
