"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageIntro } from "@/components/page-intro";
import { MinutesSessionPicker } from "@/components/prepare";
import {
  CASE_ROLE_LABELS,
  type CaseRoleSlot,
} from "@/lib/team/types";
import {
  SOLO_PART_LABELS,
  type SoloPartId,
  type SoloPartRow,
} from "@/lib/team/solo-prep";

type Recording = {
  id: string;
  person_id: string;
  case_id: string;
  part: SoloPartId;
  title: string;
  duration_ms: number | null;
  created_at: string;
};

type Handoff = {
  id: string;
  body: string;
  person_name?: string;
  created_at: string;
  case_id: string;
};

export default function PreparePage() {
  const [parts, setParts] = useState<SoloPartRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [caseFilter, setCaseFilter] = useState<string>("");
  const [changed, setChanged] = useState<string | null>(null);
  const [handoffBody, setHandoffBody] = useState("");
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordPart, setRecordPart] = useState<SoloPartId>("presentation");
  const [recordTitle, setRecordTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (caseId?: string) => {
    const q = caseId ? `?caseId=${caseId}` : "";
    const res = await fetch(`/api/prepare/parts${q}`);
    if (!res.ok) {
      setStatus("Could not load your part list.");
      return;
    }
    const data = (await res.json()) as {
      parts?: SoloPartRow[];
      me?: { id: string };
      changed?: { line: string } | null;
    };
    setParts(data.parts ?? []);
    setMeId(data.me?.id ?? null);
    if (data.changed?.line) setChanged(data.changed.line);
    const recRes = await fetch(
      `/api/prepare/recordings?mine=1${caseId ? `&caseId=${caseId}` : ""}`,
    );
    if (recRes.ok) {
      const recBody = (await recRes.json()) as { recordings?: Recording[] };
      setRecordings(recBody.recordings ?? []);
    }
    if (caseId) {
      const hRes = await fetch(`/api/prepare/handoff?caseId=${caseId}`);
      if (hRes.ok) {
        const hBody = (await hRes.json()) as { handoffs?: Handoff[] };
        setHandoffs(hBody.handoffs ?? []);
      }
    } else {
      setHandoffs([]);
    }
  }, []);

  useEffect(() => {
    const q =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("caseId")
        : null;
    if (q) setCaseFilter(q);
    void load(q ?? undefined);
  }, [load]);

  const cases = useMemo(() => {
    const map = new Map<string, { id: string; number: number; title: string }>();
    for (const p of parts) {
      map.set(p.caseId, {
        id: p.caseId,
        number: p.caseNumber,
        title: p.caseTitle,
      });
    }
    return [...map.values()].sort((a, b) => a.number - b.number);
  }, [parts]);

  const visible = caseFilter
    ? parts.filter((p) => p.caseId === caseFilter)
    : parts;

  const doneCount = visible.filter((p) => p.done).length;
  const leftMinutes = visible
    .filter((p) => !p.done)
    .reduce((s, p) => s + p.minutes, 0);

  async function toggleDone(row: SoloPartRow) {
    setBusy(true);
    try {
      const res = await fetch("/api/prepare/parts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseId: row.caseId,
          part: row.part,
          done: !row.done,
        }),
      });
      if (!res.ok) {
        setStatus("Could not update that part.");
        return;
      }
      const data = (await res.json()) as { parts?: SoloPartRow[] };
      setParts(data.parts ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function saveHandoff() {
    if (!caseFilter || !handoffBody.trim()) {
      setStatus("Pick a case and write a short handoff note.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/prepare/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: caseFilter, body: handoffBody }),
      });
      if (!res.ok) {
        setStatus("Could not save handoff.");
        return;
      }
      setHandoffBody("");
      setStatus("Handoff saved. Teammates on this case get a notice.");
      await load(caseFilter);
    } finally {
      setBusy(false);
    }
  }

  async function createRecording() {
    if (!caseFilter) {
      setStatus("Pick a case before you record a part for review.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/prepare/recordings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseId: caseFilter,
          part: recordPart,
          title:
            recordTitle.trim() ||
            `${SOLO_PART_LABELS[recordPart]}, Case ${
              cases.find((c) => c.id === caseFilter)?.number ?? "?"
            }`,
          durationMs: null,
        }),
      });
      if (!res.ok) {
        setStatus("Could not start a review recording.");
        return;
      }
      const data = (await res.json()) as { recording?: Recording };
      if (data.recording) {
        window.location.href = `/prepare/review/${data.recording.id}`;
      }
    } finally {
      setBusy(false);
    }
  }

  async function selectCase(id: string) {
    setCaseFilter(id);
    setChanged(null);
    await load(id || undefined);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("caseId", id);
      else url.searchParams.delete("caseId");
      window.history.replaceState({}, "", url.toString());
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 animate-fade-up pb-10">
      <PageIntro eyebrow="Solo prep" title="My part">
        What you personally deliver on each case: presentation, commentary,
        response, and judges&apos; answers. Mark done or left. Work in short
        blocks when you have time alone.
      </PageIntro>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/prepare/mock${caseFilter ? `?caseId=${caseFilter}` : ""}`}
          className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white"
        >
          Solo mock round
        </Link>
        <Link
          href="/team"
          className="inline-flex min-h-11 items-center rounded-xl border border-mist bg-white px-3 text-sm font-semibold text-ink"
        >
          Team board
        </Link>
      </div>

      {status ? <p className="m-0 text-sm text-muted">{status}</p> : null}

      <MinutesSessionPicker />

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display m-0 text-lg font-extrabold">
              Deliverables
            </h2>
            <p className="m-0 mt-1 text-sm text-muted">
              {doneCount} done, {visible.length - doneCount} left
              {leftMinutes > 0 ? ` (~${leftMinutes} min)` : ""}. Built from your
              roles board seats.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Case
            <select
              className="min-h-11 rounded-xl border border-mist bg-white px-3 text-sm font-semibold text-ink"
              value={caseFilter}
              onChange={(e) => void selectCase(e.target.value)}
            >
              <option value="">All my cases</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  Case {c.number}: {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {changed && caseFilter ? (
          <p className="m-0 rounded-2xl bg-[#FFF7DB] px-3 py-2 text-sm text-ink">
            {changed}
          </p>
        ) : null}

        {!visible.length ? (
          <p className="m-0 text-sm text-muted">
            No roles on the board yet. Ask a lead to seat you on a case, then
            refresh.
          </p>
        ) : (
          <ul className="m-0 list-none divide-y divide-[#ECEEF1] p-0">
            {visible.map((row) => (
              <li
                key={`${row.caseId}-${row.part}`}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="m-0 text-sm font-semibold text-ink">
                    Case {row.caseNumber}: {row.label}
                  </p>
                  <p className="m-0 text-xs text-muted">
                    {CASE_ROLE_LABELS[row.role as CaseRoleSlot]}, ~{row.minutes}{" "}
                    min, {row.caseTitle}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleDone(row)}
                    className={`h-9 rounded-xl px-3 text-sm font-semibold ${
                      row.done
                        ? "bg-[#E8F5E9] text-[#1B5E20]"
                        : "border border-mist bg-white text-ink"
                    }`}
                  >
                    {row.done ? "Done" : "Left"}
                  </button>
                  <Link
                    href={`/prepare/mock?caseId=${row.caseId}`}
                    className="inline-flex min-h-11 items-center rounded-xl border border-mist px-3 text-sm font-semibold"
                  >
                    Mock
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Async review
        </h2>
        <p className="m-0 text-sm text-muted">
          Record your part. Teammates and Dr. B leave comments tied to a moment
          whenever they like. You get a notice.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-muted">
            Part
            <select
              className="min-h-11 rounded-xl border border-mist bg-white px-3 text-sm font-semibold text-ink"
              value={recordPart}
              onChange={(e) => setRecordPart(e.target.value as SoloPartId)}
            >
              {(Object.keys(SOLO_PART_LABELS) as SoloPartId[]).map((p) => (
                <option key={p} value={p}>
                  {SOLO_PART_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-[2] flex-col gap-1 text-xs font-semibold text-muted">
            Title (optional)
            <input
              className="min-h-11 rounded-xl border border-mist bg-white px-3 text-sm text-ink"
              value={recordTitle}
              onChange={(e) => setRecordTitle(e.target.value)}
              placeholder="e.g. Case 9 presentation, take 2"
            />
          </label>
          <button
            type="button"
            disabled={busy || !caseFilter}
            onClick={() => void createRecording()}
            className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Open recorder
          </button>
        </div>
        {!caseFilter ? (
          <p className="m-0 text-xs text-muted">
            Choose a case above to attach the recording.
          </p>
        ) : null}
        {recordings.length > 0 ? (
          <ul className="m-0 list-none divide-y divide-[#ECEEF1] p-0">
            {recordings.slice(0, 8).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {r.title}
                  <span className="mt-0.5 block text-xs text-muted">
                    {new Date(r.created_at).toLocaleString()}
                    {r.person_id === meId ? " (yours)" : ""}
                  </span>
                </span>
                <Link
                  href={`/prepare/review/${r.id}`}
                  className="font-semibold text-cardinal underline-offset-2 hover:underline"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Handoff note
        </h2>
        <p className="m-0 text-sm text-muted">
          Stopping work on a case? Leave a short note for the next person who
          opens it.
        </p>
        {!caseFilter ? (
          <p className="m-0 text-xs text-muted">Pick one case above first.</p>
        ) : (
          <>
            <textarea
              className="min-h-[88px] rounded-2xl border border-mist bg-white p-3 text-sm text-ink"
              value={handoffBody}
              onChange={(e) => setHandoffBody(e.target.value)}
              placeholder="What changed, what is still open, what to try next."
              maxLength={1000}
            />
            <button
              type="button"
              disabled={busy || !handoffBody.trim()}
              onClick={() => void saveHandoff()}
              className="min-h-11 w-fit rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save handoff
            </button>
            {handoffs.length > 0 ? (
              <ul className="m-0 list-none divide-y divide-[#ECEEF1] p-0">
                {handoffs.slice(0, 5).map((h) => (
                  <li key={h.id} className="py-2 text-sm">
                    <span className="font-semibold">
                      {h.person_name ?? "Teammate"}
                    </span>
                    <span className="text-xs text-muted">
                      {" "}
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                    <p className="m-0 mt-1 text-muted">{h.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
