"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AssignButton } from "@/components/assign-button";
import { Button } from "@/components/ui/button";
import {
  CASE_ROLE_LABELS,
  CASE_ROLE_SLOTS,
  type CaseRole,
  type CaseRoleSlot,
} from "@/lib/team/types";

type Person = { id: string; name: string; team_id: string | null };
type CaseRow = { id: string; number: number; title: string; active: boolean };
type BoardCase = {
  case: CaseRow;
  current: { id: string; version: number } | null;
  confirmations: { person_id: string }[];
  people: Person[];
};

export default function TeamBoardPage() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string; colour: string }[]>(
    [],
  );
  const [roles, setRoles] = useState<CaseRole[]>([]);
  const [cases, setCases] = useState<BoardCase[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [edit, setEdit] = useState<{
    caseId: string;
    role: CaseRoleSlot;
    step: 1 | 2;
    personId?: string;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (tid?: string) => {
    const q = tid ? `?teamId=${tid}` : "";
    const res = await fetch(`/api/team/board${q}`);
    const data = await res.json();
    setTeamId(data.teamId);
    setTeams(data.teams ?? []);
    setRoles(data.board?.roles ?? []);
    setCases(data.board?.cases ?? []);
    setPeople(data.board?.people ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmRole() {
    if (!edit?.personId || !teamId) return;
    const res = await fetch("/api/team/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId,
        caseId: edit.caseId,
        role: edit.role,
        personId: edit.personId,
      }),
    });
    if (res.ok) {
      setMsg("Role updated — board, roadmap, and chat notified.");
      setEdit(null);
      await load(teamId);
    } else {
      setMsg("Could not update role.");
    }
  }

  function rolePerson(caseId: string, role: CaseRoleSlot) {
    const r = roles.find((x) => x.case_id === caseId && x.role === role);
    return people.find((p) => p.id === r?.person_id);
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Team board</h1>
          <p className="mt-1 text-sm text-muted">
            12 cases by role — gaps (no lead) show clearly. Two taps to change.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void load(t.id)}
              className="rounded-xl px-3 py-2 text-xs font-medium text-white"
              style={{
                background: t.id === teamId ? t.colour : `${t.colour}99`,
              }}
            >
              {t.name}
            </button>
          ))}
          <Link
            href="/team/chat"
            className="rounded-xl border border-ink/15 bg-white/70 px-3 py-2 text-xs"
          >
            Team chat
          </Link>
        </div>
      </div>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}

      {teamId ? (
        <AssignButton
          teamId={teamId}
          targetKind="case"
          people={people.map((p) => ({ id: p.id, name: p.name }))}
          defaultTask="Prep this case"
        />
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/60">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Case</th>
              {CASE_ROLE_SLOTS.map((r) => (
                <th key={r} className="px-3 py-2">
                  {CASE_ROLE_LABELS[r]}
                </th>
              ))}
              <th className="px-3 py-2">Map</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(({ case: c, current, confirmations }) => {
              const noLead =
                !rolePerson(c.id, "lead_1") && !rolePerson(c.id, "lead_2");
              return (
                <tr
                  key={c.id}
                  className={
                    noLead
                      ? "border-b border-ink/5 bg-cardinal/5"
                      : "border-b border-ink/5"
                  }
                >
                  <td className="px-3 py-3 font-medium">
                    <Link
                      href={`/team/cases/${c.id}?teamId=${teamId}`}
                      className="hover:underline"
                    >
                      <span className="font-mono text-xs text-muted">
                        {String(c.number).padStart(2, "0")}
                      </span>{" "}
                      {c.title}
                    </Link>
                    {noLead ? (
                      <span className="ml-2 text-[10px] font-semibold uppercase text-cardinal">
                        no lead
                      </span>
                    ) : null}
                  </td>
                  {CASE_ROLE_SLOTS.map((slot) => {
                    const person = rolePerson(c.id, slot);
                    return (
                      <td key={slot} className="px-3 py-3">
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-left text-xs hover:bg-mist/80"
                          onClick={() =>
                            setEdit({ caseId: c.id, role: slot, step: 1 })
                          }
                        >
                          {person?.name ?? (
                            <span className="text-muted">—</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-xs text-muted">
                    {current ? (
                      <>
                        v{current.version}
                        <br />
                        {confirmations.length}/{people.length} confirmed
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl">
            <p className="font-display text-lg font-semibold">
              Set {CASE_ROLE_LABELS[edit.role]} · tap {edit.step} of 2
            </p>
            {edit.step === 1 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="rounded-xl border border-ink/15 px-3 py-2 text-sm hover:bg-white"
                    onClick={() =>
                      setEdit({ ...edit, personId: p.id, step: 2 })
                    }
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm">
                  Confirm{" "}
                  <strong>
                    {people.find((p) => p.id === edit.personId)?.name}
                  </strong>{" "}
                  as {CASE_ROLE_LABELS[edit.role]}?
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEdit({ ...edit, step: 1 })}>
                    Back
                  </Button>
                  <Button onClick={() => void confirmRole()}>Confirm</Button>
                </div>
              </div>
            )}
            <button
              type="button"
              className="mt-3 text-xs text-muted underline"
              onClick={() => setEdit(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
