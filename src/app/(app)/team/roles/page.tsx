"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CASE_ROLE_LABELS,
  CASE_ROLE_SLOTS,
  type CaseRoleSlot,
} from "@/lib/team/types";
import type { RoleChip, RolesBoardView } from "@/lib/team/roles-board";

type TeamOpt = { id: string; name: string; colour: string };

const CHIP: Record<
  RoleChip,
  { bg: string; label: string; short: string }
> = {
  none: { bg: "#F7F8FA", label: "None", short: "-" },
  lead_1: { bg: "#E6F4F1", label: "Lead 1", short: "L1" },
  lead_2: { bg: "#E8EEF9", label: "Lead 2", short: "L2" },
  counter_arguer: { bg: "#FFF7DB", label: "Counter", short: "C" },
  supporter: { bg: "#FDECEC", label: "Support", short: "S" },
};

export default function RolesBoardPage() {
  const [board, setBoard] = useState<RolesBoardView | null>(null);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [teamId, setTeamId] = useState("");
  const [meId, setMeId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<
    "same_pairs" | "round_robin" | "preference" | "copy_case"
  >("round_robin");
  const [samePairs, setSamePairs] = useState<
    Partial<Record<CaseRoleSlot, string>>
  >({});
  const [copyFrom, setCopyFrom] = useState("");
  const [prefDraft, setPrefDraft] = useState<string[]>([]);
  const [dragPerson, setDragPerson] = useState<string | null>(null);

  const load = useCallback(async (tid?: string) => {
    const q = tid ? `?teamId=${encodeURIComponent(tid)}` : "";
    const res = await fetch(`/api/team/roles-board${q}`);
    if (!res.ok) {
      setStatus("Could not load the roles board.");
      return;
    }
    const data = (await res.json()) as {
      board: RolesBoardView;
      teams: TeamOpt[];
      me: { id: string; name: string };
    };
    setBoard(data.board);
    setTeams(data.teams ?? []);
    setTeamId(data.board.teamId);
    setMeId(data.me.id);
    setCopyFrom((prev) => prev || data.board.cases[0]?.id || "");
    setStatus(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Reload when Cruxy applies a change from the chat.
  useEffect(() => {
    const onChange = () => void load(board?.teamId);
    window.addEventListener("crux:data-changed", onChange);
    return () => window.removeEventListener("crux:data-changed", onChange);
  }, [load, board?.teamId]);

  useEffect(() => {
    if (!board || !meId) return;
    const mine = board.preferences
      .filter((p) => p.person_id === meId)
      .sort((a, b) => a.rank - b.rank)
      .map((p) => p.case_id);
    if (mine.length) setPrefDraft(mine);
    else setPrefDraft(board.cases.filter((c) => c.active).map((c) => c.id));
  }, [board, meId]);

  const loadByPerson = useMemo(() => {
    const m = new Map<string, { leadCount: number; roleCount: number }>();
    for (const row of board?.load ?? []) {
      m.set(row.personId, row);
    }
    return m;
  }, [board]);

  async function post(body: Record<string, unknown>) {
    if (!board) return;
    const selfActions = new Set(["save_preferences", "set_any_case"]);
    const action = String(body.action ?? "");
    if (!board.canEdit && !selfActions.has(action)) return;
    if (board.lock && !selfActions.has(action)) {
      setStatus(`Roles are locked for ${board.lock.label}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/team/roles-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, teamId: board.teamId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(err.error ?? "Could not save.");
        return;
      }
      const data = (await res.json()) as { board: RolesBoardView };
      setBoard(data.board);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  function cycleCell(personId: string, caseId: string) {
    void post({ action: "set_cell", personId, caseId, cycle: true });
  }

  function onDropCell(caseId: string) {
    if (!dragPerson || !board) return;
    const existing = board.cells[dragPerson]?.[caseId] ?? "none";
    const assignRole: RoleChip =
      existing !== "none" ? existing : "lead_1";
    void post({
      action: "set_cell",
      personId: dragPerson,
      caseId,
      role: assignRole,
    });
    setDragPerson(null);
  }

  if (!board) {
    return (
      <div className="animate-fade-up p-4 text-sm text-muted">
        Loading roles board…
      </div>
    );
  }

  return (
    <div className="animate-fade-up flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {board.teamName}
          </span>
          <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] max-md:text-[32px]">
            Roles board
          </h1>
          <p className="m-0 max-w-xl text-sm text-muted">
            People by case. Mark Any case is fine or rank cases, then use Random
            fair split. Lock for Regionals 2026 when leads are set.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {teams.length > 0 ? (
            <label className="text-xs font-semibold text-muted">
              Team
              <select
                className="mt-1 block h-10 min-w-[140px] rounded-xl border border-mist bg-white px-3 text-sm text-ink"
                value={teamId}
                onChange={(e) => {
                  setTeamId(e.target.value);
                  void load(e.target.value);
                }}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Link
            href="/team"
            className="inline-flex h-10 items-center rounded-xl border border-mist bg-white px-3 text-sm font-semibold text-ink"
          >
            Team board
          </Link>
        </div>
      </div>

      {status ? <p className="text-sm text-muted">{status}</p> : null}

      {/* Workload balance */}
      {(board.workload?.length ?? 0) > 0 ? (
        <details className="rounded-[20px] bg-white p-4">
          <summary className="cursor-pointer font-display text-base font-bold">
            Workload balance
          </summary>
          <p className="mt-1 text-sm text-muted">
            Roles and open tasks per person. When one person carries far more,
            we suggest a fair swap. No ranking against other teams.
          </p>
          <ul className="mt-3 m-0 list-none divide-y divide-[#ECEEF1] p-0">
            {board.workload.map((w) => (
              <li
                key={w.personId}
                className={`flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${
                  w.heavy ? "bg-[#FFF7DB] px-2 rounded-xl" : ""
                }`}
              >
                <div>
                  <span className="font-semibold">{w.name}</span>
                  <span className="mt-0.5 block text-[12px] text-muted">
                    {w.leadCount} lead{w.leadCount === 1 ? "" : "s"},{" "}
                    {w.roleCount} role{w.roleCount === 1 ? "" : "s"},{" "}
                    {w.openTaskCount} open task
                    {w.openTaskCount === 1 ? "" : "s"}
                  </span>
                </div>
                {w.heavy && w.suggestSwapWith ? (
                  <p className="m-0 text-[12px] font-semibold text-[#C2410C]">
                    Carrying a lot. A fair swap: ask {w.suggestSwapWith.name}{" "}
                    to take one role.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {board.lock ? (
        <section className="rounded-[20px] bg-[#E6F4F1] px-4 py-3">
          <p className="m-0 text-sm font-semibold text-ink">
            Locked for {board.lock.label}
          </p>
          <p className="m-0 mt-1 text-sm text-muted">
            Season leads are saved as a snapshot and stay put. Live edits are
            off.
          </p>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {(Object.keys(CHIP) as RoleChip[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3.5 w-3.5 rounded-sm border border-ink/10"
              style={{ background: CHIP[k].bg }}
            />
            {CHIP[k].label}
          </span>
        ))}
        {board.lock ? (
          <span className="font-semibold text-ink">Locked</span>
        ) : !board.canEdit ? (
          <span className="font-semibold text-ink">View only</span>
        ) : (
          <span>Tap to cycle. Drag a name onto a case column to assign.</span>
        )}
      </div>

      {/* My preferences */}
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <h2 className="font-display m-0 text-lg font-extrabold">
          My case preferences
        </h2>
        <p className="m-0 text-sm text-muted">
          Mark Any case is fine, or rank the cases you want to lead (top is
          first choice). Random fair split honors rankings first, then fills
          leads for the Any case people.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className={`h-9 rounded-xl px-3 text-xs font-semibold ${
              board.anyCaseOk?.[meId]
                ? "bg-ink text-white"
                : "border border-mist bg-[#F7F8FA] text-ink"
            }`}
            onClick={() =>
              void post({
                action: "set_any_case",
                personId: meId,
                anyCaseOk: true,
              })
            }
          >
            Any case is fine
          </button>
          <button
            type="button"
            disabled={busy}
            className={`h-9 rounded-xl px-3 text-xs font-semibold ${
              !board.anyCaseOk?.[meId]
                ? "bg-ink text-white"
                : "border border-mist bg-[#F7F8FA] text-ink"
            }`}
            onClick={() =>
              void post({
                action: "set_any_case",
                personId: meId,
                anyCaseOk: false,
              })
            }
          >
            I will rank cases
          </button>
        </div>
        {!board.anyCaseOk?.[meId] ? (
          <>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm">
              {prefDraft.map((caseId, idx) => {
                const c = board.cases.find((x) => x.id === caseId);
                return (
                  <li key={caseId} className="flex items-center gap-2">
                    <span className="flex-1">
                      {c ? `${c.number}. ${c.title}` : caseId}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted"
                      disabled={idx === 0}
                      onClick={() =>
                        setPrefDraft((d) => {
                          const next = [...d];
                          const t = next[idx - 1]!;
                          next[idx - 1] = next[idx]!;
                          next[idx] = t;
                          return next;
                        })
                      }
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted"
                      disabled={idx === prefDraft.length - 1}
                      onClick={() =>
                        setPrefDraft((d) => {
                          const next = [...d];
                          const t = next[idx + 1]!;
                          next[idx + 1] = next[idx]!;
                          next[idx] = t;
                          return next;
                        })
                      }
                    >
                      Down
                    </button>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              disabled={busy}
              className="h-10 w-fit rounded-xl border border-mist bg-[#F7F8FA] px-4 text-sm font-semibold"
              onClick={() =>
                void post({
                  action: "save_preferences",
                  personId: meId,
                  ranks: prefDraft.map((caseId, i) => ({
                    caseId,
                    rank: i + 1,
                  })),
                })
              }
            >
              Save my ranking
            </button>
          </>
        ) : (
          <p className="m-0 text-sm text-muted">
            You will be placed where leads are still open after rankings are
            honored.
          </p>
        )}
        {board.canEdit && !board.lock ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              className="h-11 rounded-xl bg-cardinal px-5 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void post({ action: "random_fair_split" })}
            >
              Random fair split
            </button>
            <button
              type="button"
              disabled={busy}
              className="h-11 rounded-xl border border-ink bg-white px-5 text-sm font-semibold text-ink disabled:opacity-50"
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  !window.confirm(
                    "Lock leads for Regionals 2026? The snapshot stays put and edits turn off.",
                  )
                ) {
                  return;
                }
                void post({ action: "lock_regionals_2026" });
              }}
            >
              Lock for Regionals 2026
            </button>
          </div>
        ) : null}
      </section>

      {/* Gaps */}
      {board.gaps.length > 0 ? (
        <section className="rounded-[20px] bg-white p-4">
          <h2 className="font-display m-0 text-lg font-extrabold">Gaps</h2>
          <ul className="mt-2 flex flex-col gap-2 p-0">
            {board.gaps.map((g) => {
              const c = board.cases.find((x) => x.id === g.caseId);
              const missing = g.missing
                .map((m) => CASE_ROLE_LABELS[m])
                .join(", ");
              const sugPerson = g.suggestion
                ? board.people.find((p) => p.id === g.suggestion!.personId)
                : null;
              return (
                <li
                  key={g.caseId}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span>
                    Case {g.caseNumber}
                    {c ? `: ${c.title}` : ""} needs {missing}
                  </span>
                  {board.canEdit && g.suggestion && sugPerson ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="h-9 rounded-xl bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
                      onClick={() =>
                        void post({
                          action: "fix_gap",
                          caseId: g.caseId,
                          personId: g.suggestion!.personId,
                          role: g.suggestion!.role,
                        })
                      }
                    >
                      Set {sugPerson.name} as{" "}
                      {CASE_ROLE_LABELS[g.suggestion.role]}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="m-0 text-sm text-muted">
          Every case has a lead and a counter-arguer.
        </p>
      )}

      {/* Grid */}
      <section className="overflow-x-auto rounded-[20px] bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#F7F8FA] text-left text-[12px]">
              <th className="sticky left-0 z-[2] bg-[#F7F8FA] px-3 py-2.5 font-semibold">
                Person
              </th>
              {board.cases.map((c) => (
                <th
                  key={c.id}
                  className="min-w-[72px] px-1 py-2.5 text-center font-semibold"
                  title={`${c.number}. ${c.title}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className={c.active ? "" : "text-muted"}>
                      {c.number}
                    </span>
                    {board.canEdit ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-[10px] font-medium text-muted underline"
                        onClick={() =>
                          void post({ action: "clear_column", caseId: c.id })
                        }
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2.5 font-semibold">Lead load</th>
            </tr>
          </thead>
          <tbody>
            {board.people.map((p) => {
              const load = loadByPerson.get(p.id);
              return (
                <tr key={p.id} className="border-t border-[#ECEEF1]">
                  <td
                    className="sticky left-0 z-[2] bg-white px-3 py-2 font-semibold"
                    draggable={board.canEdit}
                    onDragStart={() => setDragPerson(p.id)}
                    onDragEnd={() => setDragPerson(null)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{p.name}</span>
                      {board.canEdit ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-[10px] font-medium text-muted underline"
                          onClick={() =>
                            void post({ action: "clear_row", personId: p.id })
                          }
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </td>
                  {board.cases.map((c) => {
                    const role = board.cells[p.id]?.[c.id] ?? "none";
                    const style = CHIP[role];
                    return (
                      <td
                        key={c.id}
                        className="px-1 py-1.5"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropCell(c.id)}
                      >
                        <button
                          type="button"
                          disabled={!board.canEdit || !!board.lock || busy}
                          onClick={() => cycleCell(p.id, c.id)}
                          className="flex h-10 w-full items-center justify-center rounded-lg border border-ink/5 text-[11px] font-semibold disabled:cursor-default"
                          style={{ background: style.bg }}
                          title={`${p.name}, Case ${c.number}: ${style.label}`}
                          aria-label={`${p.name}, Case ${c.number}: ${style.label}. Tap to change.`}
                        >
                          <span className="max-md:inline md:hidden">
                            {style.short}
                          </span>
                          <span className="hidden md:inline">
                            {role === "none" ? "" : style.short}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-muted">
                    {load?.leadCount ?? 0} lead
                    {(load?.leadCount ?? 0) === 1 ? "" : "s"}
                    <span className="mt-0.5 block text-[11px]">
                      {load?.roleCount ?? 0} role
                      {(load?.roleCount ?? 0) === 1 ? "" : "s"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Templates */}
      {board.canEdit && !board.lock ? (
        <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
          <h2 className="font-display m-0 text-lg font-extrabold">Templates</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["round_robin", "Round robin"],
                ["same_pairs", "Same pairs every case"],
                ["preference", "By preference"],
                ["copy_case", "Copy from a case"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`h-9 rounded-xl px-3 text-xs font-semibold ${
                  template === k
                    ? "bg-ink text-white"
                    : "border border-mist bg-[#F7F8FA] text-ink"
                }`}
                onClick={() => setTemplate(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {template === "same_pairs" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {CASE_ROLE_SLOTS.map((slot) => (
                <label key={slot} className="text-xs font-semibold text-muted">
                  {CASE_ROLE_LABELS[slot]}
                  <select
                    className="mt-1 block h-10 w-full rounded-xl border border-mist bg-white px-3 text-sm text-ink"
                    value={samePairs[slot] ?? ""}
                    onChange={(e) =>
                      setSamePairs((prev) => ({
                        ...prev,
                        [slot]: e.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">Not set</option>
                    {board.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}

          {template === "copy_case" ? (
            <label className="text-xs font-semibold text-muted">
              Copy from
              <select
                className="mt-1 block h-10 min-w-[220px] rounded-xl border border-mist bg-white px-3 text-sm text-ink"
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
              >
                {board.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number}. {c.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {template === "preference" ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-sm text-muted">
                Rank the cases you want to lead (top is first choice). Then
                apply the template for a fair split.
              </p>
              <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm">
                {prefDraft.map((caseId, idx) => {
                  const c = board.cases.find((x) => x.id === caseId);
                  return (
                    <li key={caseId} className="flex items-center gap-2">
                      <span className="flex-1">
                        {c ? `${c.number}. ${c.title}` : caseId}
                      </span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-muted"
                        disabled={idx === 0}
                        onClick={() =>
                          setPrefDraft((d) => {
                            const next = [...d];
                            const t = next[idx - 1]!;
                            next[idx - 1] = next[idx]!;
                            next[idx] = t;
                            return next;
                          })
                        }
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-muted"
                        disabled={idx === prefDraft.length - 1}
                        onClick={() =>
                          setPrefDraft((d) => {
                            const next = [...d];
                            const t = next[idx + 1]!;
                            next[idx + 1] = next[idx]!;
                            next[idx] = t;
                            return next;
                          })
                        }
                      >
                        Down
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                disabled={busy}
                className="h-10 w-fit rounded-xl border border-mist bg-[#F7F8FA] px-4 text-sm font-semibold"
                onClick={() =>
                  void post({
                    action: "save_preferences",
                    personId: meId,
                    ranks: prefDraft.map((caseId, i) => ({
                      caseId,
                      rank: i + 1,
                    })),
                  })
                }
              >
                Save my ranking
              </button>
            </div>
          ) : null}

          <button
            type="button"
            disabled={busy}
            className="h-11 w-fit rounded-xl bg-cardinal px-5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void post({
                action: "template",
                kind: template,
                samePairs,
                sourceCaseId: copyFrom,
              })
            }
          >
            Apply template
          </button>
        </section>
      ) : null}
    </div>
  );
}
