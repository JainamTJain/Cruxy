"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CASE_ROLE_LABELS,
  CASE_ROLE_SLOTS,
  type CaseRoleSlot,
} from "@/lib/team/types";
import type { RoleChip, RolesBoardView } from "@/lib/team/roles-board";

type TeamOpt = { id: string; name: string; colour: string };

type MenuState = {
  personId: string;
  caseId: string;
  anchor: DOMRect;
} | null;

type PreviewState = {
  title: string;
  lines: string[];
  apply: () => Promise<void>;
} | null;

type UndoSnap = {
  label: string;
  assignments: { caseId: string; role: CaseRoleSlot; personId: string }[];
  caseIds: string[];
};

const CHIP: Record<
  Exclude<RoleChip, "none">,
  { bg: string; label: string; short: string }
> = {
  lead_1: { bg: "#E6F4F1", label: "Lead 1", short: "L1" },
  lead_2: { bg: "#E8EEF9", label: "Lead 2", short: "L2" },
  counter_arguer: { bg: "#FFF7DB", label: "Counter-arguer", short: "C" },
  supporter: { bg: "#FDECEC", label: "Supporter", short: "S" },
};

function snapshotAssignments(
  board: RolesBoardView,
  caseIds?: string[],
): UndoSnap["assignments"] {
  const out: UndoSnap["assignments"] = [];
  const allow = caseIds ? new Set(caseIds) : null;
  for (const p of board.people) {
    for (const c of board.cases) {
      if (allow && !allow.has(c.id)) continue;
      if (!c.active) continue;
      const role = board.cells[p.id]?.[c.id] ?? "none";
      if (role === "none") continue;
      out.push({
        caseId: c.id,
        personId: p.id,
        role: role as CaseRoleSlot,
      });
    }
  }
  return out;
}

export default function RolesBoardPage() {
  const [board, setBoard] = useState<RolesBoardView | null>(null);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [teamId, setTeamId] = useState("");
  const [meId, setMeId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [undo, setUndo] = useState<UndoSnap | null>(null);
  const [template, setTemplate] = useState<
    "same_pairs" | "round_robin" | "preference" | "copy_case"
  >("round_robin");
  const [samePairs, setSamePairs] = useState<
    Partial<Record<CaseRoleSlot, string>>
  >({});
  const [copyFrom, setCopyFrom] = useState("");
  const [prefDraft, setPrefDraft] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    const onChange = () => void load(teamId || undefined);
    window.addEventListener("crux:data-changed", onChange);
    return () => window.removeEventListener("crux:data-changed", onChange);
  }, [load, teamId]);

  useEffect(() => {
    if (!board || !meId) return;
    const mine = board.preferences
      .filter((p) => p.person_id === meId)
      .sort((a, b) => a.rank - b.rank)
      .map((p) => p.case_id);
    if (mine.length) setPrefDraft(mine);
    else setPrefDraft(board.cases.filter((c) => c.active).map((c) => c.id));
  }, [board, meId]);

  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [menu]);

  const gapsByCase = useMemo(() => {
    const m = new Map<string, CaseRoleSlot[]>();
    for (const g of board?.gaps ?? []) {
      m.set(g.caseId, g.missing);
    }
    return m;
  }, [board]);

  async function post(body: Record<string, unknown>) {
    if (!board) return null;
    const selfActions = new Set(["save_preferences", "set_any_case"]);
    const action = String(body.action ?? "");
    if (!board.canEdit && !selfActions.has(action)) return null;
    if (board.lock && !selfActions.has(action)) {
      setStatus(`Roles are locked for ${board.lock.label}.`);
      return null;
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
        return null;
      }
      const data = (await res.json()) as {
        board: RolesBoardView;
        proposed?: { caseId: string; role: CaseRoleSlot; personId: string }[];
      };
      if (data.board && !body.preview) setBoard(data.board);
      setStatus(null);
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function setCell(
    personId: string,
    caseId: string,
    role: RoleChip,
  ) {
    setMenu(null);
    await post({ action: "set_cell", personId, caseId, role });
  }

  function openMenu(
    personId: string,
    caseId: string,
    el: HTMLButtonElement,
  ) {
    if (!board?.canEdit || board.lock || busy) return;
    const c = board.cases.find((x) => x.id === caseId);
    if (!c?.active) return;
    setMenu({ personId, caseId, anchor: el.getBoundingClientRect() });
  }

  function linesForProposed(
    proposed: { caseId: string; role: CaseRoleSlot; personId: string }[],
  ) {
    if (!board) return [];
    return proposed.map((a) => {
      const person = board.people.find((p) => p.id === a.personId)?.name ?? "?";
      const c = board.cases.find((x) => x.id === a.caseId);
      return `${person} → ${CASE_ROLE_LABELS[a.role]} on Case ${c?.number ?? "?"}`;
    });
  }

  async function previewShuffleRest() {
    if (!board) return;
    const data = await post({ action: "shuffle_rest", preview: true });
    const proposed = data?.proposed ?? [];
    if (!proposed.length) {
      setStatus("Nothing empty to fill. Every active case already has roles.");
      return;
    }
    const before = snapshotAssignments(board);
    setPreview({
      title: "Shuffle the rest",
      lines: linesForProposed(proposed),
      apply: async () => {
        setUndo({
          label: "Shuffle the rest",
          assignments: before,
          caseIds: board.cases.filter((c) => c.active).map((c) => c.id),
        });
        await post({ action: "shuffle_rest", preview: false });
        setPreview(null);
        setStatus("Filled empty roles. Undo is available.");
      },
    });
  }

  async function previewShuffleCase(caseId: string) {
    if (!board) return;
    const c = board.cases.find((x) => x.id === caseId);
    if (!c?.active) return;
    const data = await post({
      action: "shuffle_case",
      caseId,
      preview: true,
    });
    const proposed = data?.proposed ?? [];
    if (!proposed.length) {
      setStatus(`Case ${c.number} already has every role filled.`);
      return;
    }
    const before = snapshotAssignments(board, [caseId]);
    setPreview({
      title: `Shuffle Case ${c.number}`,
      lines: linesForProposed(proposed),
      apply: async () => {
        setUndo({
          label: `Shuffle Case ${c.number}`,
          assignments: before,
          caseIds: [caseId],
        });
        await post({
          action: "shuffle_case",
          caseId,
          preview: false,
        });
        setPreview(null);
        setStatus(`Case ${c.number} updated. Undo is available.`);
      },
    });
  }

  function previewClearRow(personId: string) {
    if (!board) return;
    const person = board.people.find((p) => p.id === personId);
    if (!person) return;
    const held = snapshotAssignments(board).filter(
      (a) => a.personId === personId,
    );
    if (!held.length) {
      setStatus(`${person.name} has no roles to clear.`);
      return;
    }
    setPreview({
      title: `Clear ${person.name}'s row`,
      lines: held.map((a) => {
        const c = board.cases.find((x) => x.id === a.caseId);
        return `Remove ${CASE_ROLE_LABELS[a.role]} on Case ${c?.number ?? "?"}`;
      }),
      apply: async () => {
        setUndo({
          label: `Clear ${person.name}`,
          assignments: snapshotAssignments(board),
          caseIds: board.cases.filter((c) => c.active).map((c) => c.id),
        });
        await post({ action: "clear_row", personId });
        setPreview(null);
        setStatus(`${person.name}'s roles cleared. Undo is available.`);
      },
    });
  }

  async function runUndo() {
    if (!board || !undo) return;
    setBusy(true);
    try {
      for (const caseId of undo.caseIds) {
        const res = await fetch("/api/team/roles-board", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "clear_column",
            teamId: board.teamId,
            caseId,
          }),
        });
        if (!res.ok) {
          setStatus("Could not undo.");
          return;
        }
      }
      const res = await fetch("/api/team/roles-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply_plan",
          teamId: board.teamId,
          assignments: undo.assignments,
        }),
      });
      if (!res.ok) {
        setStatus("Could not undo.");
        return;
      }
      const data = (await res.json()) as { board: RolesBoardView };
      setBoard(data.board);
      setStatus(`Undid: ${undo.label}.`);
      setUndo(null);
    } finally {
      setBusy(false);
    }
  }

  if (!board) {
    return (
      <div className="animate-fade-up p-4 text-sm text-muted">
        Loading roles board…
      </div>
    );
  }

  const menuLeft = menu
    ? Math.min(
        Math.max(8, menu.anchor.left),
        typeof window !== "undefined" ? window.innerWidth - 200 : menu.anchor.left,
      )
    : 0;
  const menuTop = menu ? menu.anchor.bottom + 4 : 0;

  return (
    <div className="animate-fade-up flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {board.teamName}
          </span>
          <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] max-md:text-[32px]">
            Roles board
          </h1>
          <p className="m-0 max-w-2xl text-sm text-muted">
            Tap a box to pick a role. XXX means we are not competing with that
            case. Or tell Cruxy, for example: Nick on 1, 7 and 11, shuffle the
            rest.
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

      {status ? <p className="m-0 text-sm text-muted">{status}</p> : null}

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

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {(Object.keys(CHIP) as (keyof typeof CHIP)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex h-5 min-w-[28px] items-center justify-center rounded-md border border-ink/10 px-1 text-[10px] font-bold text-ink"
              style={{ background: CHIP[k].bg }}
            >
              {CHIP[k].short}
            </span>
            {CHIP[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-[28px] items-center justify-center rounded-md bg-[#ECEEF1] px-1 text-[10px] font-bold text-[#8C929D]">
            XXX
          </span>
          Not at this regional
        </span>
      </div>

      {/* Bulk actions */}
      {board.canEdit && !board.lock ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void previewShuffleRest()}
          >
            Shuffle the rest
          </button>
          {undo ? (
            <button
              type="button"
              disabled={busy}
              className="h-10 rounded-xl border border-mist bg-white px-4 text-sm font-semibold disabled:opacity-50"
              onClick={() => void runUndo()}
            >
              Undo {undo.label}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="h-10 rounded-xl border border-ink bg-white px-4 text-sm font-semibold text-ink disabled:opacity-50"
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

      {/* Grid */}
      <section className="overflow-hidden rounded-[20px] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#F7F8FA] text-left text-[12px]">
                <th className="sticky left-0 z-[3] bg-[#F7F8FA] px-3 py-2.5 font-semibold shadow-[2px_0_0_#ECEEF1]">
                  Person
                </th>
                {board.cases.map((c) => {
                  const missing = gapsByCase.get(c.id) ?? [];
                  return (
                    <th
                      key={c.id}
                      className="sticky top-0 z-[2] min-w-[64px] bg-[#F7F8FA] px-1 py-2 text-center font-semibold"
                      title={c.title}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={c.active ? "text-ink" : "text-muted"}>
                          Case {c.number}
                        </span>
                        {!c.active ? (
                          <span className="max-w-[72px] text-[9px] font-medium leading-tight text-muted">
                            Not at this regional
                          </span>
                        ) : missing.length ? (
                          <span className="max-w-[88px] text-[9px] font-semibold leading-tight text-[#C2410C]">
                            Needs{" "}
                            {missing
                              .map((m) => CASE_ROLE_LABELS[m])
                              .join(", ")}
                          </span>
                        ) : null}
                        {board.canEdit && c.active && !board.lock ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="text-[10px] font-medium text-muted underline"
                            onClick={() => void previewShuffleCase(c.id)}
                          >
                            Shuffle
                          </button>
                        ) : null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {board.people.map((p) => (
                <tr key={p.id} className="border-t border-[#ECEEF1]">
                  <td className="sticky left-0 z-[2] bg-white px-3 py-2 font-semibold shadow-[2px_0_0_#ECEEF1]">
                    <div className="flex min-w-[96px] items-center justify-between gap-2">
                      <span>{p.name}</span>
                      {board.canEdit && !board.lock ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="shrink-0 text-[10px] font-medium text-muted underline"
                          onClick={() => previewClearRow(p.id)}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </td>
                  {board.cases.map((c) => {
                    if (!c.active) {
                      return (
                        <td key={c.id} className="px-1 py-1.5">
                          <div
                            className="flex h-10 w-full cursor-not-allowed items-center justify-center rounded-lg bg-[#ECEEF1] text-[11px] font-bold text-[#8C929D]"
                            aria-label={`Case ${c.number}: not at this regional`}
                          >
                            XXX
                          </div>
                        </td>
                      );
                    }
                    const role = board.cells[p.id]?.[c.id] ?? "none";
                    const style =
                      role === "none"
                        ? { bg: "#F7F8FA", short: "", label: "None" }
                        : CHIP[role];
                    return (
                      <td key={c.id} className="px-1 py-1.5">
                        <button
                          type="button"
                          disabled={!board.canEdit || !!board.lock || busy}
                          onClick={(e) =>
                            openMenu(p.id, c.id, e.currentTarget)
                          }
                          className="flex h-10 w-full items-center justify-center rounded-lg border border-ink/5 text-[11px] font-semibold disabled:cursor-default"
                          style={{ background: style.bg }}
                          aria-haspopup="menu"
                          aria-expanded={
                            menu?.personId === p.id && menu.caseId === c.id
                          }
                          aria-label={`${p.name}, Case ${c.number}: ${style.label}. Open role menu.`}
                        >
                          {role === "none" ? "" : style.short}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cell role menu */}
      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 flex w-[180px] flex-col gap-0.5 rounded-xl border border-mist bg-white p-1.5 shadow-lg"
          style={{ left: menuLeft, top: menuTop }}
        >
          {CASE_ROLE_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              role="menuitem"
              className="rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#F7F8FA]"
              style={{ background: CHIP[slot].bg }}
              onClick={() => void setCell(menu.personId, menu.caseId, slot)}
            >
              {CHIP[slot].short} {CASE_ROLE_LABELS[slot]}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-muted hover:bg-[#F7F8FA]"
            onClick={() => void setCell(menu.personId, menu.caseId, "none")}
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Preview modal */}
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roles-preview-title"
        >
          <div className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-xl">
            <h2
              id="roles-preview-title"
              className="font-display m-0 text-lg font-extrabold"
            >
              {preview.title}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Preview. Nothing is saved until you confirm.
            </p>
            <ul className="mt-3 max-h-56 list-none space-y-1 overflow-y-auto p-0 text-sm">
              {preview.lines.map((line) => (
                <li key={line} className="rounded-lg bg-[#F7F8FA] px-3 py-2">
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void preview.apply()}
              >
                Confirm
              </button>
              <button
                type="button"
                className="h-10 rounded-xl border border-mist px-4 text-sm font-semibold"
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Preferences (compact) */}
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <h2 className="font-display m-0 text-base font-extrabold">
          My case preferences
        </h2>
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
                      {c ? `Case ${c.number}. ${c.title}` : caseId}
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
            You will be placed where roles are still open.
          </p>
        )}
      </section>

      {/* Templates folded */}
      {board.canEdit && !board.lock ? (
        <details className="rounded-[20px] bg-white p-4">
          <summary className="cursor-pointer font-display text-base font-bold">
            More ways to fill
          </summary>
          <p className="mt-1 text-sm text-muted">
            Templates rewrite roles on active cases. Prefer Shuffle the rest
            when some cells are already set.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
            <label className="mt-3 block text-xs font-semibold text-muted">
              Copy from
              <select
                className="mt-1 block h-10 min-w-[220px] rounded-xl border border-mist bg-white px-3 text-sm text-ink"
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
              >
                {board.cases
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      Case {c.number}. {c.title}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}

          <button
            type="button"
            disabled={busy}
            className="mt-3 h-11 w-fit rounded-xl bg-cardinal px-5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void post({
                action: "template",
                kind: template,
                samePairs,
                sourceCaseId: copyFrom,
                caseIds: board.cases.filter((c) => c.active).map((c) => c.id),
              })
            }
          >
            Apply template
          </button>
        </details>
      ) : null}

      {/* Workload tucked */}
      {(board.workload?.length ?? 0) > 0 ? (
        <details className="rounded-[20px] bg-white p-4">
          <summary className="cursor-pointer font-display text-base font-bold">
            Workload balance
          </summary>
          <ul className="mt-3 m-0 list-none divide-y divide-[#ECEEF1] p-0">
            {board.workload.map((w) => (
              <li
                key={w.personId}
                className={`flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${
                  w.heavy ? "rounded-xl bg-[#FFF7DB] px-2" : ""
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
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
