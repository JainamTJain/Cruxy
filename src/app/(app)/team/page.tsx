"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CASE_ROLE_LABELS,
  CASE_ROLE_SLOTS,
  type CaseRole,
  type CaseRoleSlot,
  type ChatMessage,
  type AlignmentQuestionSet,
} from "@/lib/team/types";

type Person = { id: string; name: string; team_id: string | null };
type CaseRow = { id: string; number: number; title: string; active: boolean };
type BoardCase = {
  case: CaseRow;
  current: { id: string; version: number } | null;
  confirmations: { person_id: string }[];
  people: Person[];
};
type Team = { id: string; name: string; colour: string };

type BoardPayload = {
  teamId: string;
  teams: Team[];
  board: {
    roles: CaseRole[];
    people: Person[];
    cases: BoardCase[];
  };
  chat: {
    id: string;
    channel: string;
    messages: (ChatMessage & { person_name?: string | null })[];
  } | null;
  me: { id: string; name: string; teamId: string | null; role: string };
};

export default function TeamBoardPage() {
  const [data, setData] = useState<BoardPayload | null>(null);
  const [alignment, setAlignment] = useState<AlignmentQuestionSet[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    caseId: string;
    role: CaseRoleSlot;
    step: 1 | 2;
    personId?: string;
  } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignStep, setAssignStep] = useState<1 | 2>(1);
  const [assignPeople, setAssignPeople] = useState<string[]>([]);
  const [assignTask, setAssignTask] = useState("Prep this case");
  const [assignDue, setAssignDue] = useState("");
  const [assignCaseId, setAssignCaseId] = useState<string>("");
  const [msgText, setMsgText] = useState("");
  const [msgCaseId, setMsgCaseId] = useState<string>("");
  const [msgMentions, setMsgMentions] = useState<string[]>([]);
  const [msgPassage, setMsgPassage] = useState("");
  const [msgTimestamp, setMsgTimestamp] = useState("");
  const [driftFlags, setDriftFlags] = useState<
    {
      id: string;
      case_id: string;
      detail: string;
      transcript_ref: string | null;
      version_id: string | null;
      resolved_at: string | null;
    }[]
  >([]);
  const [cruxyAsk, setCruxyAsk] = useState<string | null>(null);
  const [cruxyReply, setCruxyReply] = useState<string | null>(null);
  const [alignAnswers, setAlignAnswers] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async (tid?: string) => {
    const q = tid ? `?teamId=${tid}` : "";
    const res = await fetch(`/api/team/board${q}`);
    if (!res.ok) {
      setStatus("Could not load the team board.");
      return;
    }
    const payload = (await res.json()) as BoardPayload;
    setData(payload);
    setTeamId(payload.teamId);
    if (!assignCaseId && payload.board?.cases?.[0]) {
      setAssignCaseId(payload.board.cases[0].case.id);
    }
    const alignRes = await fetch("/api/team/alignment");
    if (alignRes.ok) {
      const alignBody = (await alignRes.json()) as {
        pending?: AlignmentQuestionSet[];
      };
      const pending = alignBody.pending ?? [];
      setAlignment(pending);
      if (pending[0]) {
        setAlignAnswers(pending[0].questions.map(() => ""));
      }
    }
    const driftRes = await fetch(
      `/api/team/drift?teamId=${payload.teamId}`,
    );
    if (driftRes.ok) {
      const driftBody = (await driftRes.json()) as {
        flags?: typeof driftFlags;
      };
      setDriftFlags(
        (driftBody.flags ?? []).filter((f) => !f.resolved_at).slice(0, 8),
      );
    }
  }, [assignCaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const team = useMemo(
    () => data?.teams.find((t) => t.id === teamId) ?? null,
    [data, teamId],
  );
  const people = data?.board?.people ?? [];
  const roles = data?.board?.roles ?? [];
  const cases = data?.board?.cases ?? [];
  const teamSize = Math.max(people.length, 1);

  function rolePerson(caseId: string, role: CaseRoleSlot) {
    const r = roles.find((x) => x.case_id === caseId && x.role === role);
    return people.find((p) => p.id === r?.person_id) ?? null;
  }

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
      setStatus("Role updated. Logged and posted in team chat.");
      setEdit(null);
      await load(teamId);
    } else {
      setStatus("Could not update role.");
    }
  }

  async function saveAssign() {
    if (!teamId || !assignPeople.length) return;
    const res = await fetch("/api/team/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId,
        caseId: assignCaseId || null,
        personIds: assignPeople,
        task: assignTask || "Assigned work",
        targetKind: "case",
        targetId: assignCaseId || null,
        due: assignDue || null,
      }),
    });
    if (res.ok) {
      setStatus("Assigned. It shows on their roadmap.");
      setAssignOpen(false);
      setAssignStep(1);
      setAssignPeople([]);
    } else {
      setStatus("Could not assign.");
    }
  }

  async function sendMessage() {
    if (!data?.chat?.id || !msgText.trim()) return;
    const res = await fetch("/api/team/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatId: data.chat.id,
        message: msgText,
        mentionIds: msgMentions,
        caseId: msgCaseId || null,
        passageRef: msgPassage.trim() || null,
        timestampRef: msgTimestamp.trim() || null,
      }),
    });
    if (res.ok) {
      setMsgText("");
      setMsgMentions([]);
      setMsgPassage("");
      setMsgTimestamp("");
      await load(teamId ?? undefined);
    }
  }

  async function askCruxy(prompt: string) {
    setCruxyAsk(prompt);
    setCruxyReply("Asking Cruxy…");
    const res = await fetch("/api/cruxy/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: prompt,
        caseId: assignCaseId || msgCaseId || null,
        page: "/team",
      }),
    });
    if (!res.ok) {
      setCruxyReply("Could not reach Cruxy.");
      return;
    }
    const body = (await res.json()) as {
      text?: string;
      questionFirst?: string | null;
    };
    setCruxyReply(
      [body.questionFirst, body.text].filter(Boolean).join("\n\n") ||
        "No answer yet.",
    );
  }

  async function markIdea(id: string) {
    await fetch("/api/team/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markIdeaId: id }),
    });
    await load(teamId ?? undefined);
  }

  async function confirmVersion(versionId: string, version: number) {
    await fetch("/api/team/claim-maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", versionId }),
    });
    setStatus(`I've got v${version}`);
    await load(teamId ?? undefined);
  }

  async function submitAlignment(set: AlignmentQuestionSet) {
    const res = await fetch("/api/team/alignment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionSetId: set.id,
        answers: alignAnswers,
      }),
    });
    const body = (await res.json()) as { drift?: { detail?: string } | null };
    setStatus(
      body.drift
        ? "Your answers drifted from the current version. Leads were told privately."
        : "Alignment answers saved.",
    );
    await load(teamId ?? undefined);
  }

  if (!data) {
    return (
      <main className="animate-fade-up">
        <p className="text-sm text-muted">Loading team board…</p>
      </main>
    );
  }

  const chatName = team?.name ?? "Team";
  const pendingAlign = alignment[0] ?? null;

  return (
    <main className="animate-fade-up flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="lab text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
            {chatName}
          </span>
          <h1 className="font-display m-0 text-[48px] font-extrabold leading-none tracking-[-0.02em] text-ink max-md:text-[36px]">
            Who&apos;s on what
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/team/roles"
            className="inline-flex h-10 items-center rounded-xl border border-mist bg-white px-3 text-sm font-semibold text-ink"
          >
            Roles board
          </Link>
          <Link
            href="/prepare"
            className="inline-flex h-10 items-center rounded-xl border border-mist bg-white px-3 text-sm font-semibold text-ink"
          >
            My part
          </Link>
          <Link
            href="/team/calendar"
            className="inline-flex h-10 items-center px-2 text-sm text-muted underline-offset-2 hover:underline"
          >
            More team tools
          </Link>
          {data.teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void load(t.id)}
              className="rounded-[10px] px-3 py-2 text-[13px] font-semibold text-white"
              style={{
                background: t.id === teamId ? t.colour : `${t.colour}99`,
              }}
              aria-pressed={t.id === teamId}
            >
              {t.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setAssignOpen(true);
              setAssignStep(1);
            }}
            className="h-[46px] rounded-xl bg-ink px-[18px] text-[15px] font-semibold text-white"
          >
            Assign
          </button>
        </div>
      </div>

      {status ? <p className="text-sm text-muted">{status}</p> : null}

      {driftFlags.length ? (
        <section
          aria-labelledby="drift"
          className="rounded-[20px] bg-white p-5"
        >
          <h2
            id="drift"
            className="font-display m-0 text-[22px] font-extrabold"
          >
            Drift flags
          </h2>
          <p className="mt-1 text-sm text-muted">
            Lines that drifted from the current version. Open the claim map for
            the wording to use now.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {driftFlags.map((f) => {
              const c = cases.find((x) => x.case.id === f.case_id)?.case;
              return (
                <li key={f.id} className="rounded-xl bg-[#F7F8FA] px-3 py-2">
                  <p>{f.detail}</p>
                  {f.transcript_ref ? (
                    <p className="text-xs text-muted">{f.transcript_ref}</p>
                  ) : null}
                  {c ? (
                    <Link
                      href={`/team/cases/${c.id}?teamId=${teamId}`}
                      className="text-xs font-semibold text-cardinal underline"
                    >
                      Current Case {c.number} wording
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="cruxy-help"
        className="rounded-[20px] bg-white p-5"
      >
        <h2
          id="cruxy-help"
          className="font-display m-0 text-[22px] font-extrabold"
        >
          Ask Cruxy
        </h2>
        <p className="mt-1 text-sm text-muted">
          Explain a passage, quiz you, find a source, draft a one-pager row,
          summarize what changed, or suggest what to do next.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            "Explain our Claim 2 in plain words",
            "Quiz me on the current position",
            "Find a source for the partnership point",
            "Draft a one-pager row for review",
            "Summarize what changed since my last visit",
            "What should I do next?",
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-xl border border-mist px-3 py-2 text-left text-[13px] font-semibold hover:bg-[#F7F8FA]"
              onClick={() => void askCruxy(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
        {cruxyAsk ? (
          <div className="mt-3 rounded-xl bg-[#F7F8FA] p-3 text-sm">
            <p className="text-xs font-bold text-muted">You asked</p>
            <p>{cruxyAsk}</p>
            <p className="mt-2 whitespace-pre-wrap">{cruxyReply}</p>
          </div>
        ) : null}
      </section>

      {pendingAlign ? (
        <section
          aria-labelledby="align"
          className="rounded-[20px] bg-white p-5"
        >
          <h2 id="align" className="font-display m-0 text-[22px] font-extrabold">
            Alignment check
          </h2>
          <p className="mt-1 text-sm text-muted">
            Cruxy asks after a version change. Answers that drift are flagged to
            you and the leads first.
          </p>
          <div className="mt-3 space-y-3">
            {pendingAlign.questions.map((q, i) => (
              <label key={q} className="block text-sm font-medium">
                {q}
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-mist px-3 text-sm"
                  value={alignAnswers[i] ?? ""}
                  onChange={(e) => {
                    const next = [...alignAnswers];
                    next[i] = e.target.value;
                    setAlignAnswers(next);
                  }}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 h-10 rounded-[10px] bg-ink px-4 text-[13px] font-semibold text-white"
            onClick={() => void submitAlignment(pendingAlign)}
          >
            Send answers
          </button>
        </section>
      ) : null}

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-labelledby="board"
          className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[20px] bg-white"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption
                id="board"
                className="px-5 pb-2.5 pt-[18px] text-left font-display text-[22px] font-extrabold"
              >
                Roles and versions, 12 cases{" "}
                <Link
                  href="/team/roles"
                  className="ml-2 text-sm font-semibold text-cardinal underline"
                >
                  Open full board
                </Link>
              </caption>
              <thead>
                <tr className="bg-[#F7F8FA] text-left text-[13px]">
                  <th className="px-5 py-2.5 font-semibold">Case</th>
                  <th className="px-2.5 py-2.5 font-semibold">Lead 1</th>
                  <th className="px-2.5 py-2.5 font-semibold">Lead 2</th>
                  <th className="px-2.5 py-2.5 font-semibold">Counter</th>
                  <th className="px-2.5 py-2.5 font-semibold">Supporter</th>
                  <th className="px-2.5 py-2.5 font-semibold">On the same page</th>
                </tr>
              </thead>
              <tbody>
                {!cases.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-sm text-muted"
                    >
                      No active cases on this board yet. When cases are opened
                      for the season, roles and versions will show here.
                    </td>
                  </tr>
                ) : null}
                {cases.map(({ case: c, current, confirmations }) => {
                  const confCount = confirmations.length;
                  const allIn = confCount >= teamSize && teamSize > 0;
                  return (
                    <tr key={c.id} className="border-t border-[#ECEEF1]">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/team/cases/${c.id}?teamId=${teamId}`}
                          className="hover:underline"
                        >
                          <span className="font-display mr-2 text-[20px] font-extrabold text-cardinal">
                            {c.number}
                          </span>
                          {c.title}
                        </Link>
                      </td>
                      {CASE_ROLE_SLOTS.map((slot) => {
                        const person = rolePerson(c.id, slot);
                        const gap = slot === "lead_1" && !person;
                        return (
                          <td key={slot} className="px-2.5 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEdit({ caseId: c.id, role: slot, step: 1 })
                              }
                              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold"
                              style={
                                gap
                                  ? {
                                      background: "#FDECEC",
                                      color: "#C62828",
                                    }
                                  : { background: "#F3F4F6", color: "#111318" }
                              }
                              aria-label={`Set ${CASE_ROLE_LABELS[slot]} for Case ${c.number}`}
                            >
                              {person?.name ?? (gap ? "No lead" : "Not set")}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2.5 py-2">
                        {current ? (
                          <>
                            <span className="font-mono text-[13px] font-semibold">
                              v{current.version}
                            </span>{" "}
                            <span
                              className="text-[13px] font-semibold"
                              style={{
                                color: allIn ? "#0B5E53" : "#C62828",
                              }}
                            >
                              {allIn
                                ? `${teamSize} of ${teamSize} ✅`
                                : `${confCount} of ${teamSize} confirmed`}
                            </span>
                          </>
                        ) : (
                          <span className="text-[13px] text-muted">
                            No version yet
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside
          aria-labelledby="chat"
          className="flex flex-[1_1_340px] flex-col gap-3.5 rounded-[20px] bg-white p-5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2
              id="chat"
              className="font-display m-0 text-[22px] font-extrabold"
            >
              {chatName} chat
            </h2>
            <span className="text-[12px] text-muted">readable by all teams</span>
          </div>

          <div className="flex max-h-[560px] flex-col gap-3.5 overflow-y-auto">
            {(data.chat?.messages ?? []).map((m) => (
              <ChatBubble
                key={m.id}
                message={m}
                teamSize={teamSize}
                onConfirm={(versionId, version) =>
                  void confirmVersion(versionId, version)
                }
                onMarkIdea={() => void markIdea(m.id)}
              />
            ))}
            {!data.chat?.messages?.length ? (
              <p className="text-sm text-muted">
                No messages yet. Say hello, link a case, or share a note the
                team can build on.
              </p>
            ) : null}
          </div>

          <label htmlFor="team-msg" className="text-[13px] font-semibold">
            Message
          </label>
          <input
            id="team-msg"
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sendMessage();
            }}
            placeholder={`Write to ${chatName}. Use @Name to mention.`}
            className="h-11 rounded-xl border border-mist px-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = msgMentions.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setMsgMentions((prev) =>
                      on ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                    );
                    if (!on && !msgText.includes(`@${p.name}`)) {
                      setMsgText((t) => `${t}${t ? " " : ""}@${p.name} `);
                    }
                  }}
                  className={
                    on
                      ? "rounded-lg bg-ink px-2 py-1 text-[11px] text-white"
                      : "rounded-lg border border-mist px-2 py-1 text-[11px]"
                  }
                >
                  @{p.name}
                </button>
              );
            })}
          </div>
          <label className="text-[12px] font-semibold text-muted">
            Link a case
            <select
              className="mt-1 h-10 w-full rounded-xl border border-mist px-2 text-sm"
              value={msgCaseId}
              onChange={(e) => setMsgCaseId(e.target.value)}
            >
              <option value="">No case link</option>
              {cases.map(({ case: c }) => (
                <option key={c.id} value={c.id}>
                  Case {c.number}: {c.title}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] font-semibold text-muted">
              Passage
              <input
                className="mt-1 h-9 w-full rounded-xl border border-mist px-2 text-sm"
                value={msgPassage}
                onChange={(e) => setMsgPassage(e.target.value)}
                placeholder="optional"
              />
            </label>
            <label className="text-[12px] font-semibold text-muted">
              Timestamp
              <input
                className="mt-1 h-9 w-full rounded-xl border border-mist px-2 text-sm"
                value={msgTimestamp}
                onChange={(e) => setMsgTimestamp(e.target.value)}
                placeholder="e.g. 12:40"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!msgText.trim()}
            className="h-10 rounded-[10px] bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </aside>
      </div>

      {edit ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl">
            <p className="font-display text-lg font-semibold">
              Set {CASE_ROLE_LABELS[edit.role]}, tap {edit.step} of 2
            </p>
            {edit.step === 1 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="rounded-xl border border-mist px-3 py-2 text-sm hover:bg-white"
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
                  <button
                    type="button"
                    className="rounded-xl px-3 py-2 text-sm"
                    onClick={() => setEdit({ ...edit, step: 1 })}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white"
                    onClick={() => void confirmRole()}
                  >
                    Confirm
                  </button>
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

      {assignOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl">
            <p className="font-display text-lg font-semibold">
              Assign, tap {assignStep} of 2
            </p>
            {assignStep === 1 ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted">Pick people</p>
                <div className="flex flex-wrap gap-2">
                  {people.map((p) => {
                    const on = assignPeople.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setAssignPeople((prev) =>
                            on
                              ? prev.filter((x) => x !== p.id)
                              : [...prev, p.id],
                          )
                        }
                        className={
                          on
                            ? "rounded-lg bg-ink px-2 py-1 text-xs text-white"
                            : "rounded-lg border border-mist px-2 py-1 text-xs"
                        }
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                <label className="block text-xs">
                  Case
                  <select
                    className="mt-1 w-full rounded-lg border border-mist px-2 py-2"
                    value={assignCaseId}
                    onChange={(e) => setAssignCaseId(e.target.value)}
                  >
                    {cases.map(({ case: c }) => (
                      <option key={c.id} value={c.id}>
                        {c.number}. {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!assignPeople.length}
                  className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  onClick={() => setAssignStep(2)}
                >
                  Next
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <label className="block text-xs">
                  Task / role
                  <input
                    className="mt-1 w-full rounded-lg border border-mist px-2 py-2"
                    value={assignTask}
                    onChange={(e) => setAssignTask(e.target.value)}
                  />
                </label>
                <label className="block text-xs">
                  Due (optional)
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-mist px-2 py-2"
                    value={assignDue}
                    onChange={(e) => setAssignDue(e.target.value)}
                  />
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    className="rounded-xl px-3 py-2 text-sm"
                    onClick={() => setAssignStep(1)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white"
                    onClick={() => void saveAssign()}
                  >
                    Confirm assign
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              className="mt-3 text-xs text-muted underline"
              onClick={() => setAssignOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ChatBubble(props: {
  message: ChatMessage & { person_name?: string | null };
  teamSize: number;
  onConfirm: (versionId: string, version: number) => void;
  onMarkIdea: () => void;
}) {
  const m = props.message;
  const refs = (m.link_refs ?? {}) as Record<string, unknown>;
  const kind = typeof refs.kind === "string" ? refs.kind : null;

  if (kind === "claim_diff" || (m.from_cruxy && /is now v\d+/i.test(m.body))) {
    const oldText =
      typeof refs.old_text === "string" ? refs.old_text : null;
    const newText =
      typeof refs.new_text === "string" ? refs.new_text : null;
    const version =
      typeof refs.version === "number"
        ? refs.version
        : Number(String(m.body).match(/v(\d+)/i)?.[1] ?? 0);
    const versionId =
      typeof refs.version_id === "string" ? refs.version_id : null;
    const confirmed =
      typeof refs.confirmed_count === "number" ? refs.confirmed_count : null;
    const caseLabel = m.case_id
      ? `Case update`
      : "Case update";
    return (
      <div className="flex flex-col gap-1 rounded-[14px] bg-[#FFF7DB] p-3 text-sm leading-[1.45]">
        <span className="text-[12px] font-bold text-[#8A6500]">
          Cruxy: {caseLabel}
          {version ? ` is now v${version}` : ""}
        </span>
        {oldText && newText ? (
          <span>
            Changed:{" "}
            <span className="text-muted line-through">&quot;{oldText}&quot;</span>{" "}
            → &quot;{newText}&quot;.
          </span>
        ) : (
          <span className="whitespace-pre-wrap">{m.body}</span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          {versionId && version ? (
            <button
              type="button"
              className="h-[34px] rounded-[10px] bg-ink px-3 text-[13px] font-semibold text-white"
              onClick={() => props.onConfirm(versionId, version)}
            >
              I&apos;ve got v{version}
            </button>
          ) : null}
          {confirmed != null ? (
            <span className="self-center text-[13px] text-muted">
              {confirmed} of {props.teamSize} confirmed
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  if (kind === "role_change" || (m.from_cruxy && /Lead 1|ROLE/i.test(m.body))) {
    return (
      <div className="flex flex-col gap-1 rounded-[14px] bg-[#F7F8FA] p-3 text-sm leading-[1.45]">
        <span className="text-[12px] font-bold text-muted">Role change</span>
        <span>{m.body.replace(/^ROLE CHANGE\s*/i, "")}</span>
      </div>
    );
  }

  const linkBits: string[] = [];
  if (m.case_id) linkBits.push("linked case");
  if (typeof refs.passage === "string" && refs.passage) {
    linkBits.push(`passage: ${refs.passage}`);
  }
  if (typeof refs.timestamp === "string" && refs.timestamp) {
    linkBits.push(`at ${refs.timestamp}`);
  }
  if (typeof refs.truth_source_id === "string") {
    linkBits.push("Evidence Library linked");
  }

  return (
    <div className="flex flex-col gap-1 text-sm leading-[1.45]">
      <strong className="text-[13px]">
        {m.from_cruxy ? "Cruxy" : m.person_name ?? "Member"}
      </strong>
      <span className="whitespace-pre-wrap">{m.body}</span>
      {m.mention_ids?.length ? (
        <span className="text-[12px] text-muted">
          Mentions: {m.mention_ids.length}
        </span>
      ) : null}
      {linkBits.length ? (
        <span className="text-[12px] text-muted">{linkBits.join(", ")}</span>
      ) : null}
      {m.is_idea ? (
        <span className="text-[12px] font-bold text-cardinal">
          Marked as idea
          {typeof refs.case_number === "number"
            ? ` → Case ${refs.case_number} queue`
            : " → Evidence Library queue"}
        </span>
      ) : !m.from_cruxy ? (
        <button
          type="button"
          className="w-fit text-[12px] font-bold text-cardinal underline"
          onClick={props.onMarkIdea}
        >
          Mark as idea → Evidence Library queue
        </button>
      ) : null}
    </div>
  );
}
