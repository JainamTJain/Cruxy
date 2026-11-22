"use client";

import { useCallback, useEffect, useState } from "react";
import { PageIntro } from "@/components/page-intro";
import { AppeTimer } from "@/components/regional/appe-timer";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { PreRoundCalmCta } from "@/components/product";
import { cn } from "@/lib/utils";

type Hub = {
  competition: {
    id: string;
    name: string;
    date: string;
    place: string | null;
  } | null;
  logistics: {
    id: string;
    schedule_text: string | null;
    departure_time: string | null;
    meeting_point: string | null;
    dress_guidance: string | null;
    venue_notes: string | null;
    room_notes: string | null;
    packing_list: string | null;
    carpool_list: string | null;
    schedule_display: string;
    departure_display: string;
    meeting_display: string;
    dress_display: string;
    venue_display: string;
    room_display: string;
    packing_display: string;
    carpool_display: string;
  } | null;
  rounds: Array<{
    id: string;
    round_number: number;
    case_id: string | null;
    case_label: string | null;
    side: "presenting" | "commenting" | null;
    speakers: Array<{ role: string; person_id: string | null; name: string }>;
    key_points: string[];
    room: string | null;
    starts_at: string | null;
  }>;
  logs: Array<{
    id: string;
    opponent: string;
    case_number: number | null;
    moderator_question: string | null;
    judges_questions: string | null;
    judge_comments: string | null;
    score_us: number | null;
    score_them: number | null;
    result: string | null;
    round_number: number | null;
    side: string | null;
    debrief_worked: string | null;
    debrief_change: string | null;
    created_at: string;
  }>;
  cases: Array<{ id: string; number: number; title: string }>;
  people: Array<{ id: string; name: string; team_id: string | null }>;
  canEdit: boolean;
  emptyLabel: string;
  viewer: { personId: string; teamId: string | null; role: string };
};

/** Solo-first: phone tools first, day logistics last. */
type Tab = "round" | "timer" | "log" | "debrief" | "logistics";

const TABS: { id: Tab; label: string }[] = [
  { id: "round", label: "Round day" },
  { id: "timer", label: "APPE timer" },
  { id: "log", label: "Real-round log" },
  { id: "debrief", label: "Debrief" },
  { id: "logistics", label: "Day info" },
];

export function RegionalClient() {
  const [data, setData] = useState<Hub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("round");
  const [activeRound, setActiveRound] = useState(1);

  const load = useCallback(async () => {
    const res = await fetch("/api/regional");
    const json = (await res.json()) as Hub & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load Competition Day.");
      return;
    }
    setData(json);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/regional", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not save.");
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    if (error) return <p className="text-sm text-cardinal">{error}</p>;
    return <LoadingGenie label="Loading Competition Day..." />;
  }

  if (!data.competition || !data.logistics) {
    return (
      <main className="space-y-4">
        <PageIntro title="Competition Day">
          No competition is set up yet. Dr. B will add this.
        </PageIntro>
      </main>
    );
  }

  const teamPeople = data.people.filter(
    (p) => p.team_id && p.team_id === data.viewer.teamId,
  );
  const round =
    data.rounds.find((r) => r.round_number === activeRound) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 animate-fade-up">
      <PageIntro
        eyebrow={`${data.competition.place ?? "UCSB"}, ${data.competition.date}`}
        title="Competition Day"
        titleClassName="font-display text-[40px] font-extrabold tracking-[-0.02em] text-ink sm:text-[48px]"
      >
        Your round card and APPE timer for the phone. Then log each round and a
        short debrief. Day info is read-only unless you are Dr. B or Jainam.
      </PageIntro>

      {error ? (
        <p className="rounded-xl border border-cardinal/30 bg-cardinal/5 px-3 py-2 text-sm text-cardinal">
          {error}
        </p>
      ) : null}

      <nav
        aria-label="Competition Day sections"
        className="flex flex-wrap gap-1 border-b border-mist"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "border-b-[3px] px-3.5 py-2.5 text-sm font-semibold",
              tab === id
                ? "border-cardinal text-ink"
                : "border-transparent text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "round" ? (
        <RoundDayPanel
          data={data}
          round={round}
          activeRound={activeRound}
          setActiveRound={setActiveRound}
          teamPeople={teamPeople}
          busy={busy}
          onSave={(payload) =>
            void post({
              action: "save_round",
              competitionId: data.competition!.id,
              teamId: data.viewer.teamId,
              ...payload,
            })
          }
        />
      ) : null}

      {tab === "timer" ? <AppeTimer /> : null}

      {tab === "log" ? (
        <LogPanel
          data={data}
          busy={busy}
          onLog={(payload) =>
            void post({
              action: "log_round",
              competitionId: data.competition!.id,
              teamId: data.viewer.teamId,
              ...payload,
            })
          }
        />
      ) : null}

      {tab === "debrief" ? (
        <DebriefPanel
          data={data}
          busy={busy}
          onDebrief={(logId, debriefWorked, debriefChange) =>
            void post({
              action: "save_debrief",
              logId,
              debriefWorked,
              debriefChange,
            })
          }
        />
      ) : null}

      {tab === "logistics" ? (
        <LogisticsPanel
          data={data}
          busy={busy}
          onSave={(patch) =>
            void post({
              action: "save_logistics",
              competitionId: data.competition!.id,
              ...patch,
            })
          }
        />
      ) : null}
    </main>
  );
}

function LogisticsPanel({
  data,
  busy,
  onSave,
}: {
  data: Hub;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const L = data.logistics!;
  const [draft, setDraft] = useState({
    schedule_text: L.schedule_text ?? "",
    departure_time: L.departure_time ?? "",
    meeting_point: L.meeting_point ?? "",
    dress_guidance: L.dress_guidance ?? "",
    venue_notes: L.venue_notes ?? "",
    room_notes: L.room_notes ?? "",
    packing_list: L.packing_list ?? "",
    carpool_list: L.carpool_list ?? "",
  });

  useEffect(() => {
    setDraft({
      schedule_text: L.schedule_text ?? "",
      departure_time: L.departure_time ?? "",
      meeting_point: L.meeting_point ?? "",
      dress_guidance: L.dress_guidance ?? "",
      venue_notes: L.venue_notes ?? "",
      room_notes: L.room_notes ?? "",
      packing_list: L.packing_list ?? "",
      carpool_list: L.carpool_list ?? "",
    });
  }, [L]);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">Day info</h2>
        <p className="mt-1 text-sm text-muted">
          One plain page. Dr. B fills it; everyone else just reads.
        </p>
        {data.canEdit ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["departure_time", "Departure time"],
                ["meeting_point", "Meeting point"],
                ["dress_guidance", "Dress"],
                ["venue_notes", "Venue"],
                ["room_notes", "Rooms"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">{label}</span>
                <input
                  className="h-10 rounded-[10px] border border-mist px-3"
                  value={draft[key]}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                  placeholder={data.emptyLabel}
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-semibold">Schedule</span>
              <textarea
                rows={4}
                className="rounded-[10px] border border-mist px-3 py-2"
                value={draft.schedule_text}
                disabled={busy}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, schedule_text: e.target.value }))
                }
                placeholder={data.emptyLabel}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-semibold">Packing list</span>
              <textarea
                rows={4}
                className="rounded-[10px] border border-mist px-3 py-2"
                value={draft.packing_list}
                disabled={busy}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, packing_list: e.target.value }))
                }
                placeholder={data.emptyLabel}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
              onClick={() =>
                onSave({
                  schedule_text: draft.schedule_text || null,
                  departure_time: draft.departure_time || null,
                  meeting_point: draft.meeting_point || null,
                  dress_guidance: draft.dress_guidance || null,
                  venue_notes: draft.venue_notes || null,
                  room_notes: draft.room_notes || null,
                  packing_list: draft.packing_list || null,
                  carpool_list: draft.carpool_list || null,
                })
              }
            >
              Save day info
            </button>
          </div>
        ) : (
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["Departure", L.departure_display],
                ["Meeting point", L.meeting_display],
                ["Dress", L.dress_display],
                ["Venue", L.venue_display],
                ["Rooms", L.room_display],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
                  {label}
                </dt>
                <dd className="m-0 mt-1 text-sm leading-snug">{value}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <dt className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
                Schedule
              </dt>
              <dd className="m-0 mt-1 whitespace-pre-wrap text-sm leading-snug">
                {L.schedule_display}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
                Packing list
              </dt>
              <dd className="m-0 mt-1 whitespace-pre-wrap text-sm leading-snug">
                {L.packing_display}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}

function RoundDayPanel({
  data,
  round,
  activeRound,
  setActiveRound,
  teamPeople,
  busy,
  onSave,
}: {
  data: Hub;
  round: Hub["rounds"][number] | null;
  activeRound: number;
  setActiveRound: (n: number) => void;
  teamPeople: Hub["people"];
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [caseId, setCaseId] = useState(round?.case_id ?? "");
  const [side, setSide] = useState<"presenting" | "commenting" | "">(
    round?.side ?? "",
  );
  const [stance, setStance] = useState("");
  const [p1, setP1] = useState(round?.key_points[0] ?? "");
  const [p2, setP2] = useState(round?.key_points[1] ?? "");
  const [p3, setP3] = useState(round?.key_points[2] ?? "");
  const [room, setRoom] = useState(round?.room ?? "");
  const [speakers, setSpeakers] = useState(
    round?.speakers?.length
      ? round.speakers
      : [
          { role: "Lead 1", person_id: null, name: "" },
          { role: "Lead 2", person_id: null, name: "" },
          { role: "Counter-arguer", person_id: null, name: "" },
          { role: "Supporter", person_id: null, name: "" },
        ],
  );

  useEffect(() => {
    setCaseId(round?.case_id ?? "");
    setSide(round?.side ?? "");
    setP1(round?.key_points[0] ?? "");
    setP2(round?.key_points[1] ?? "");
    setP3(round?.key_points[2] ?? "");
    setRoom(round?.room ?? "");
    setSpeakers(
      round?.speakers?.length
        ? round.speakers
        : [
            { role: "Lead 1", person_id: null, name: "" },
            { role: "Lead 2", person_id: null, name: "" },
            { role: "Counter-arguer", person_id: null, name: "" },
            { role: "Supporter", person_id: null, name: "" },
          ],
    );
  }, [round, activeRound]);

  useEffect(() => {
    if (!caseId || !data.viewer.teamId) {
      setStance("");
      return;
    }
    void fetch(
      `/api/case-brain/brief?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(data.viewer.teamId)}`,
    )
      .then((r) => r.json())
      .then((j: { brief?: { thesis?: string | null } }) => {
        setStance(j.brief?.thesis?.trim() || "");
      })
      .catch(() => setStance(""));
  }, [caseId, data.viewer.teamId]);

  const caseRow = data.cases.find((c) => c.id === caseId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setActiveRound(n)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold",
              activeRound === n
                ? "bg-cardinal text-white"
                : "bg-white text-ink",
            )}
          >
            Round {n}
          </button>
        ))}
      </div>

      <PreRoundCalmCta
        caseId={caseId || null}
        nextHref="/regional"
        compact
        className="w-full sm:w-auto"
      />

      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-[28px] font-extrabold leading-tight sm:text-[36px]">
          Round {activeRound}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Drawn case, side, who speaks, stance and three key points. Big type
          for the room.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Case</span>
            <select
              className="h-11 rounded-[10px] border border-mist bg-[#F7F8FA] px-3 font-semibold"
              value={caseId}
              disabled={busy}
              onChange={(e) => setCaseId(e.target.value)}
            >
              <option value="">Not drawn yet</option>
              {data.cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.number).padStart(2, "0")}. {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Side</span>
            <select
              className="h-11 rounded-[10px] border border-mist bg-[#F7F8FA] px-3 font-semibold"
              value={side}
              disabled={busy}
              onChange={(e) =>
                setSide(e.target.value as "presenting" | "commenting" | "")
              }
            >
              <option value="">Choose...</option>
              <option value="presenting">Presenting</option>
              <option value="commenting">Commenting</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Room</span>
            <input
              className="h-11 rounded-[10px] border border-mist px-3 text-base font-semibold"
              value={room}
              disabled={busy}
              onChange={(e) => setRoom(e.target.value)}
              placeholder={data.emptyLabel}
            />
          </label>
        </div>

        <div className="mt-5 rounded-[16px] bg-[#F7F8FA] p-4">
          <p className="m-0 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
            Our one-line stance
          </p>
          <p className="font-display m-0 mt-2 text-[22px] font-extrabold leading-snug sm:text-[28px]">
            {stance || "Set the agreed stance on the Team Brief for this case."}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <p className="m-0 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
            Three key points
          </p>
          {[p1, p2, p3].map((v, i) => (
            <input
              key={i}
              className="h-12 w-full rounded-[12px] border border-mist px-3 text-lg font-semibold"
              value={v}
              disabled={busy}
              onChange={(e) => {
                if (i === 0) setP1(e.target.value);
                else if (i === 1) setP2(e.target.value);
                else setP3(e.target.value);
              }}
              placeholder={`Point ${i + 1}`}
            />
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <p className="m-0 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
            Who speaks
          </p>
          {speakers.map((s, i) => (
            <label
              key={s.role}
              className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="w-32 font-semibold">{s.role}</span>
              <select
                className="h-10 flex-1 rounded-[10px] border border-mist bg-white px-3"
                value={s.person_id ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const name =
                    teamPeople.find((p) => p.id === id)?.name ?? "";
                  setSpeakers((arr) =>
                    arr.map((row, j) =>
                      j === i ? { ...row, person_id: id, name } : row,
                    ),
                  );
                }}
              >
                <option value="">Choose...</option>
                {teamPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <button
          type="button"
          disabled={busy || !data.viewer.teamId}
          className="mt-5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() =>
            onSave({
              roundNumber: activeRound,
              caseId: caseId || null,
              caseLabel: caseRow
                ? `${String(caseRow.number).padStart(2, "0")}. ${caseRow.title}`
                : null,
              side: side || null,
              speakers,
              keyPoints: [p1, p2, p3].map((s) => s.trim()).filter(Boolean),
              room: room || null,
            })
          }
        >
          Save round card
        </button>
      </section>
    </div>
  );
}

function LogPanel({
  data,
  busy,
  onLog,
}: {
  data: Hub;
  busy: boolean;
  onLog: (payload: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    opponent: "",
    caseId: "",
    roundNumber: "1",
    side: "" as "" | "presenting" | "commenting",
    moderatorQuestion: "",
    judgesQuestions: "",
    judgeComments: "",
    scoreUs: "",
    scoreThem: "",
    result: "pending",
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">
          Log this round
        </h2>
        <p className="mt-1 text-sm text-muted">
          Opponent, case, moderator question, judge comments and scores. The
          moderator question goes into the question bank.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Opponent school</span>
            <input
              className="h-10 rounded-[10px] border border-mist px-3"
              value={form.opponent}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, opponent: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Round number</span>
            <input
              className="h-10 rounded-[10px] border border-mist px-3"
              value={form.roundNumber}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, roundNumber: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Side</span>
            <select
              className="h-10 rounded-[10px] border border-mist px-3"
              value={form.side}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  side: e.target.value as typeof form.side,
                }))
              }
            >
              <option value="">Choose...</option>
              <option value="presenting">Presenting</option>
              <option value="commenting">Commenting</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Case</span>
            <select
              className="h-10 rounded-[10px] border border-mist px-3"
              value={form.caseId}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, caseId: e.target.value }))
              }
            >
              <option value="">Unknown</option>
              {data.cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.number).padStart(2, "0")}. {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Moderator question asked</span>
            <textarea
              rows={2}
              className="rounded-[10px] border border-mist px-3 py-2"
              value={form.moderatorQuestion}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, moderatorQuestion: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Judges&apos; questions (optional)</span>
            <textarea
              rows={2}
              className="rounded-[10px] border border-mist px-3 py-2"
              value={form.judgesQuestions}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, judgesQuestions: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Judge comments (as reported)</span>
            <textarea
              rows={2}
              className="rounded-[10px] border border-mist px-3 py-2"
              value={form.judgeComments}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, judgeComments: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Our score</span>
            <input
              className="h-10 rounded-[10px] border border-mist px-3"
              value={form.scoreUs}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, scoreUs: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Their score</span>
            <input
              className="h-10 rounded-[10px] border border-mist px-3"
              value={form.scoreThem}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, scoreThem: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Result</span>
            <select
              className="h-10 rounded-[10px] border border-mist px-3"
              value={form.result}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, result: e.target.value }))
              }
            >
              <option value="pending">Pending</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="tie">Tie</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={busy || !form.opponent.trim()}
          className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => {
            const cas = data.cases.find((c) => c.id === form.caseId);
            onLog({
              opponent: form.opponent,
              caseId: form.caseId || null,
              caseNumber: cas?.number ?? null,
              roundNumber: Number(form.roundNumber) || null,
              side: form.side || null,
              moderatorQuestion: form.moderatorQuestion || null,
              judgesQuestions: form.judgesQuestions || null,
              judgeComments: form.judgeComments || null,
              scoreUs: form.scoreUs ? Number(form.scoreUs) : null,
              scoreThem: form.scoreThem ? Number(form.scoreThem) : null,
              result: form.result,
            });
            setForm((f) => ({
              ...f,
              opponent: "",
              moderatorQuestion: "",
              judgesQuestions: "",
              judgeComments: "",
              scoreUs: "",
              scoreThem: "",
            }));
          }}
        >
          Save round log
        </button>
      </section>

      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">
          Team round logs
        </h2>
        <p className="mt-1 text-sm text-muted">
          Visible to the team. H will read these for the retrospective.
        </p>
        <ul className="mt-3 m-0 list-none space-y-3 p-0">
          {data.logs.length === 0 ? (
            <li className="text-sm text-muted">No rounds logged yet.</li>
          ) : (
            data.logs.map((log) => (
              <li
                key={log.id}
                className="rounded-[14px] bg-[#F7F8FA] px-3.5 py-3"
              >
                <p className="m-0 text-sm font-semibold">
                  {log.round_number ? `Round ${log.round_number}, ` : ""}
                  vs {log.opponent}
                  {log.case_number != null
                    ? `, Case ${log.case_number}`
                    : ""}
                  {log.side ? `, ${log.side}` : ""}
                </p>
                {log.moderator_question ? (
                  <p className="m-0 mt-1 text-sm">
                    Moderator: {log.moderator_question}
                  </p>
                ) : null}
                {log.judge_comments ? (
                  <p className="m-0 mt-1 text-sm text-[#3B404A]">
                    Judges: {log.judge_comments}
                  </p>
                ) : null}
                <p className="m-0 mt-1 text-[13px] text-muted">
                  Score {log.score_us ?? "—"} to {log.score_them ?? "—"}
                  {log.result ? `, ${log.result}` : ""}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function DebriefPanel({
  data,
  busy,
  onDebrief,
}: {
  data: Hub;
  busy: boolean;
  onDebrief: (logId: string, worked: string, change: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">
          Short debrief
        </h2>
        <p className="mt-1 text-sm text-muted">
          Two lines between rounds: one thing that worked, one thing to change.
        </p>
        <ul className="mt-3 m-0 list-none space-y-3 p-0">
          {data.logs.length === 0 ? (
            <li className="text-sm text-muted">
              Log a round first, then come back here.
            </li>
          ) : (
            data.logs.map((log) => (
              <li
                key={log.id}
                className="rounded-[14px] bg-[#F7F8FA] px-3.5 py-3"
              >
                <p className="m-0 text-sm font-semibold">
                  {log.round_number ? `Round ${log.round_number}, ` : ""}
                  vs {log.opponent}
                </p>
                <p className="m-0 mt-2 text-sm">
                  <strong>Worked:</strong>{" "}
                  {log.debrief_worked || "Not filled yet."}
                </p>
                <p className="m-0 mt-1 text-sm">
                  <strong>Change:</strong>{" "}
                  {log.debrief_change || "Not filled yet."}
                </p>
                <DebriefInline
                  busy={busy}
                  onSave={(worked, change) =>
                    onDebrief(log.id, worked, change)
                  }
                />
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function DebriefInline({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (worked: string, change: string) => void;
}) {
  const [worked, setWorked] = useState("");
  const [change, setChange] = useState("");
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-mist pt-2">
      <p className="m-0 text-[12px] font-semibold text-muted">
        Two-minute debrief
      </p>
      <input
        className="h-9 rounded-[10px] border border-mist px-3 text-sm"
        placeholder="One thing that worked"
        value={worked}
        disabled={busy}
        onChange={(e) => setWorked(e.target.value)}
      />
      <input
        className="h-9 rounded-[10px] border border-mist px-3 text-sm"
        placeholder="One thing to change"
        value={change}
        disabled={busy}
        onChange={(e) => setChange(e.target.value)}
      />
      <button
        type="button"
        disabled={busy || (!worked.trim() && !change.trim())}
        className="w-fit rounded-xl border border-mist bg-white px-3 py-2 text-xs font-semibold disabled:opacity-60"
        onClick={() => onSave(worked, change)}
      >
        Save debrief
      </button>
    </div>
  );
}
