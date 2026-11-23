"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PriorReflectionBanner } from "@/components/practice/prior-reflection-banner";
import { TextOnlyBanner } from "@/components/practice/text-only-banner";

type Round = {
  id: string;
  mode: string;
  phase: string;
  case_number: number | null;
  judges: { humans: string[]; cruxy: boolean };
  team_ids: string[];
  sides: { presenting: string | null; commenting: string | null };
  moderator: string | null;
  timings: {
    presentation_max: number;
    commentary_max: number;
    qa_max: number;
  };
  order: number;
  started_at: string | null;
};

type Person = {
  id: string;
  name: string;
  team_id: string | null;
  team_name: string | null;
  recording_ok: boolean;
};

type Att = {
  person_id: string;
  status: "present" | "late" | "absent";
  source: string;
};

function formatWhen(date: string) {
  const d = new Date(`${date}T18:00:00`);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sourceLabel(source: string, recordingOk: boolean, status: string) {
  if (status === "absent") return "not seen";
  if (!recordingOk) return "text only, not recorded";
  if (source === "voice") return "voice";
  if (source === "join") return "device";
  if (source === "self") return "tapped in";
  return source;
}

export function SessionClient() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const screen = search.get("screen");
  const [session, setSession] = useState<{
    id: string;
    title: string;
    kind: string;
    status: string;
    date: string;
    place: string | null;
    online: boolean;
    created_by: string | null;
    rounds: Round[];
  } | null>(null);
  const [attendance, setAttendance] = useState<Att[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [joinedJudgeIds, setJoinedJudgeIds] = useState<string[]>([]);
  const [admin, setAdmin] = useState(false);
  const [canInvite, setCanInvite] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [codeHidden, setCodeHidden] = useState(false);
  const [judgeMode, setJudgeMode] = useState<"in_person" | "cruxy" | "both">(
    "both",
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState("Dr. B");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [textOnlyNames, setTextOnlyNames] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hereMsg, setHereMsg] = useState<string | null>(null);
  const [hereBusy, setHereBusy] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const [selfPresent, setSelfPresent] = useState(false);

  async function refresh() {
    try {
      const res = await fetch(`/api/practice/sessions/${params.id}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load this session.");
        return;
      }
      setLoadError(null);
      setSession(data.session);
      setAttendance(data.attendance ?? []);
      setAdmin(Boolean(data.admin));
      setCanInvite(Boolean(data.canInvite));
      setPeople(data.people ?? []);
      setJoinedJudgeIds(data.joinedJudgeIds ?? []);
      setTextOnlyNames(
        Array.isArray(data.textOnlyBanner?.names)
          ? (data.textOnlyBanner.names as string[])
          : [],
      );
      if (data.code) setCode(data.code);
      if (data.creatorName) setCreatorName(data.creatorName);
      if (data.teams) setTeams(data.teams);
      if (typeof window !== "undefined") {
        const origin = window.location.origin;
        // Never put session codes in member share links (admins only).
        setShareLink(
          data.admin && data.code
            ? `${origin}/practice?code=${data.code}`
            : `${origin}/practice/sessions/${params.id}`,
        );
      }
      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json().catch(() => ({}));
      const meId = me?.person?.id ?? me?.session?.personId ?? null;
      if (meId && Array.isArray(data.attendance)) {
        const mine = data.attendance.find(
          (a: Att) => a.person_id === meId && a.status !== "absent",
        );
        setSelfPresent(Boolean(mine));
      }
      const r0 = data.session?.rounds?.[0] as Round | undefined;
      if (r0) {
        if (r0.judges.cruxy && r0.judges.humans.length) setJudgeMode("both");
        else if (r0.judges.cruxy) setJudgeMode("cruxy");
        else setJudgeMode("in_person");
      }
    } catch {
      setLoadError("Network problem loading this session. Refresh to try again.");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (!admin || code) return;
    void fetch(`/api/practice/sessions/${params.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reveal_code" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.code) {
          setCode(d.code);
          if (typeof window !== "undefined") {
            setShareLink(
              `${window.location.origin}/practice?code=${d.code}`,
            );
          }
        }
      });
  }, [admin, code, params.id]);

  const round1 = session?.rounds.find((r) => r.order === 0) ?? session?.rounds[0];
  const displayRounds = useMemo(() => {
    if (!session) return [];
    return [...session.rounds]
      .filter((r) => r.phase !== "done" || r.order < 3)
      .sort((a, b) => a.order - b.order)
      .slice(0, 3);
  }, [session]);

  const personById = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p])),
    [people],
  );

  const presentCount = attendance.filter((a) => a.status !== "absent").length;

  async function setAtt(personId: string, status: Att["status"]) {
    await fetch("/api/practice/attendance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: params.id,
        personId,
        status,
        source: "admin",
      }),
    });
    await refresh();
  }

  async function imHere() {
    if (hereBusy) return;
    setHereBusy(true);
    setHereMsg(null);
    try {
      const res = await fetch("/api/practice/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: params.id,
          status: "present",
          source: "self",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHereMsg(data.error ?? "Could not mark you present. Try again.");
        setHereBusy(false);
        return;
      }
      setSelfPresent(true);
      setHereMsg("You're marked present.");
      await refresh();
    } catch {
      setHereMsg("Network problem. Check your connection and try again.");
    } finally {
      setHereBusy(false);
    }
  }

  async function nextRound() {
    if (nextBusy) return;
    setNextBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/practice/sessions/${params.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "next_round" }),
      });
      const data = await res.json().catch(() => ({}));
      setNextBusy(false);
      if (!res.ok) {
        setMsg(data.error ?? data.whatToDo ?? "Could not advance.");
        return;
      }
      if (data.href) {
        window.location.href = data.href;
        return;
      }
      await refresh();
    } catch {
      setNextBusy(false);
      setMsg("Network problem advancing. Try again.");
    }
  }

  async function applyJudgeMode(mode: typeof judgeMode) {
    setJudgeMode(mode);
    if (!round1) return;
    await fetch(`/api/practice/sessions/${params.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "set_judges",
        roundId: round1.id,
        mode,
        humanIds: round1.judges.humans,
      }),
    });
    await refresh();
  }

  function roundBlurb(r: Round) {
    if (r.mode === "moderator_drill") {
      return {
        title: "Moderator drills: everyone, on own devices",
        sub: "Random bank questions on each person's cases",
      };
    }
    const presentingLabel = r.sides.presenting
      ? `${uniqueTeamName(r.sides.presenting, people)} presents`
      : "presents";
    const commentingLabel = r.sides.commenting
      ? `${uniqueTeamName(r.sides.commenting, people)} comments`
      : "Cruxy plays the commenting team";
    const mod =
      r.moderator === "cruxy"
        ? "Cruxy"
        : personById[r.moderator ?? ""]?.name ?? "Moderator";
    const judgeBits = [
      r.judges.humans.length
        ? `${r.judges.humans.length} in person`
        : null,
      r.judges.cruxy ? "Cruxy" : null,
    ]
      .filter(Boolean)
      .join(" + ");
    return {
      title: `Case ${r.case_number}: ${presentingLabel}, ${commentingLabel}`,
      sub: `Moderator: ${mod}, judges: ${judgeBits || "none"}, ${r.timings.presentation_max} / ${r.timings.commentary_max} / ${r.timings.qa_max} min`,
    };
  }

  if (loadError) {
    return (
      <div className="space-y-3 rounded-2xl border border-cardinal/30 bg-white p-5">
        <p className="m-0 text-sm text-cardinal" role="alert">
          {loadError}
        </p>
        <button
          type="button"
          className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!session) {
    return <p className="text-sm text-muted">Loading session…</p>;
  }

  const codeDisplay = code
    ? `${code.slice(0, 3)} ${code.slice(3)}`.trim()
    : "No code yet";

  const qrUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/judging?guest=1&session=${session.id}`
      : "/judging?guest=1";

  const humanJudges = (round1?.judges.humans ?? [])
    .map((id) => personById[id])
    .filter(Boolean) as Person[];

  return (
    <div className="-mx-4 flex min-h-[calc(100dvh-2rem)] flex-col gap-5 sm:-mx-10 sm:flex-row">
      {admin ? (
        <aside className="hidden w-[220px] shrink-0 flex-col gap-7 rounded-[20px] bg-ink px-4 py-7 text-white sm:flex">
          <span className="font-display px-3 text-[32px] font-extrabold tracking-[-0.04em]">
            crux
          </span>
          <span className="ml-3 self-start rounded-md bg-gold px-2 py-1 text-[12px] font-bold tracking-[0.1em] text-ink">
            ADMIN
          </span>
          <nav aria-label="Admin" className="flex flex-col gap-0.5">
            <span className="rounded-[10px] bg-cardinal px-3 py-2.5 text-[15px] font-medium">
              Sessions
            </span>
            <Link
              href="/admin"
              className="rounded-[10px] px-3 py-2.5 text-[15px] font-medium text-[#C9CCD3]"
            >
              People and teams
            </Link>
            <Link
              href="/admin"
              className="rounded-[10px] px-3 py-2.5 text-[15px] font-medium text-[#C9CCD3]"
            >
              Program analytics
            </Link>
            <Link
              href="/revision/questions"
              className="rounded-[10px] px-3 py-2.5 text-[15px] font-medium text-[#C9CCD3]"
            >
              Question bank
            </Link>
            <Link
              href="/home"
              className="rounded-[10px] px-3 py-2.5 text-[15px] font-medium text-[#C9CCD3]"
            >
              Back to member view
            </Link>
          </nav>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-5 px-1 sm:px-0">
        <TextOnlyBanner names={textOnlyNames} />
        <PriorReflectionBanner compact />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              {session.title}
              {screen ? `, you: ${screen}` : ""}
            </span>
            <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] sm:text-[48px]">
              {formatWhen(session.date)}
            </h1>
            <span className="text-[15px] text-[#3B404A]">
              {session.place ?? "Online"}
              {session.online ? ", plus online" : ""}, created by {creatorName}
            </span>
          </div>
          {admin ? (
            <div className="flex items-center gap-[18px] rounded-[18px] bg-ink px-5 py-3.5 text-white">
              <div>
                <div className="text-xs font-bold tracking-[0.1em] text-gold">
                  SESSION CODE, ADMINS ONLY
                </div>
                <div className="font-mono text-[34px] font-semibold tracking-[0.12em]">
                  {codeHidden ? "hidden" : codeDisplay}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCodeHidden((h) => !h)}
                className="min-h-11 rounded-[10px] border border-[#3B404A] px-3 text-[13px] font-semibold text-white"
              >
                {codeHidden ? "Show" : "Hide"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999] flex-col gap-4">
            <section className="flex flex-col gap-2.5 rounded-[20px] bg-white p-5">
              <h2 className="font-display m-0 text-[22px] font-extrabold">
                The day&apos;s split
              </h2>
              {displayRounds.map((r, i) => {
                const blurb = roundBlurb(r);
                const now = r.phase !== "setup" && r.phase !== "done";
                const when =
                  r.phase === "done"
                    ? "done"
                    : now
                      ? "NOW"
                      : r.phase === "setup"
                        ? "ready"
                        : "";
                return (
                  <Link
                    key={r.id}
                    href={`/practice/rounds/${r.id}`}
                    className={
                      now
                        ? "grid grid-cols-[70px_1fr_auto] items-center gap-3 rounded-[14px] bg-[#FDECEC] p-3"
                        : "grid grid-cols-[70px_1fr_auto] items-center gap-3 rounded-[14px] bg-[#F7F8FA] p-3"
                    }
                  >
                    <span
                      className={
                        now
                          ? "font-display text-[28px] font-extrabold text-cardinal"
                          : "font-display text-[28px] font-extrabold text-muted"
                      }
                    >
                      R{i + 1}
                    </span>
                    <span className="text-sm leading-snug">
                      <strong>{blurb.title}</strong>
                      <br />
                      {blurb.sub}
                    </span>
                    <span
                      className={
                        now
                          ? "text-xs font-bold text-cardinal"
                          : "text-xs font-bold text-muted"
                      }
                    >
                      {when}
                    </span>
                  </Link>
                );
              })}
            </section>

            {admin && round1 ? (
              <section className="flex flex-col gap-3.5 rounded-[20px] bg-white p-5">
                <h2 className="font-display m-0 text-[22px] font-extrabold">
                  Who is judging Round 1?
                </h2>
                <div className="flex flex-wrap gap-2.5">
                  {(
                    [
                      ["in_person", "In person", "Human judges only"],
                      ["cruxy", "Cruxy judge", "No human judge today"],
                      ["both", "Both", "Humans score, Cruxy scores too"],
                    ] as const
                  ).map(([mode, label, sub]) => {
                    const on = judgeMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => void applyJudgeMode(mode)}
                        className={
                          on
                            ? "flex min-h-[84px] flex-1 flex-col items-start justify-center gap-1 rounded-2xl border-2 border-ink bg-ink px-4 py-3.5 text-left text-base font-semibold text-white"
                            : "flex min-h-[84px] flex-1 flex-col items-start justify-center gap-1 rounded-2xl border-2 border-line bg-white px-4 py-3.5 text-left text-base font-semibold"
                        }
                      >
                        {label}
                        <span
                          className={
                            on
                              ? "text-[13px] font-medium text-[#C9CCD3]"
                              : "text-[13px] font-medium text-muted"
                          }
                        >
                          {sub}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {judgeMode !== "cruxy" ? (
                  <div className="flex flex-col gap-2.5">
                    <span className="text-sm font-bold">In-person judges</span>
                    {humanJudges.map((j) => {
                      const joined = joinedJudgeIds.includes(j.id);
                      return (
                        <div
                          key={j.id}
                          className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[14px] border border-line p-3.5"
                        >
                          <span className="text-sm leading-snug">
                            <strong>
                              {j.name}
                              {j.team_name ? ` (${j.team_name})` : ""}
                            </strong>{" "}
                            (already in Crux)
                            <br />
                            <span className="text-muted">
                              Opens the Judging portal and types the session
                              code you read out
                            </span>
                          </span>
                          <span
                            className={
                              joined
                                ? "text-[13px] font-bold text-[#0F7B6C]"
                                : "text-[13px] font-bold text-muted"
                            }
                          >
                            {joined ? "✅ Joined" : "Waiting"}
                          </span>
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-[1fr_120px] items-center gap-4 rounded-[14px] border border-line p-3.5">
                      <span className="text-sm leading-snug">
                        <strong>Someone new</strong>
                        <br />
                        <span className="text-muted">
                          Show them this code. They type their name and judging
                          background, then land on Round 1&apos;s scoring card.
                          No account.
                        </span>
                      </span>
                      <a
                        href={qrUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-[120px] w-[120px] items-center justify-center rounded-xl border-2 border-dashed border-[#9AA0AA] text-center text-xs text-muted"
                      >
                        Open guest
                        <br />
                        judging link
                      </a>
                    </div>
                    <button
                      type="button"
                      className="min-h-11 self-start rounded-[10px] border border-line bg-white px-3.5 text-sm font-semibold"
                      onClick={() =>
                        setMsg("Add judges from the Judging portal with the code.")
                      }
                    >
                      Add another judge
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/practice/rounds/${round1.id}`}
                    className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] bg-cardinal text-base font-bold text-white"
                  >
                    Start Round 1 and record
                  </Link>
                  {session.rounds.length > 1 ? (
                    <button
                      type="button"
                      disabled={nextBusy}
                      onClick={() => void nextRound()}
                      className="flex h-[52px] items-center justify-center rounded-[14px] border border-ink px-4 text-sm font-bold disabled:opacity-50"
                    >
                      {nextBusy ? "Advancing…" : "Next round"}
                    </button>
                  ) : null}
                </div>
                {msg ? <p className="text-sm text-muted">{msg}</p> : null}
              </section>
            ) : (
              <section className="rounded-[20px] bg-white p-5">
                <p className="text-sm text-muted">
                  Tap a round to open the practice room
                  {round1 ? (
                    <>
                      {" "}
                      or{" "}
                      <Link
                        href={`/practice/rounds/${round1.id}`}
                        className="text-cardinal underline"
                      >
                        join Round 1
                      </Link>
                    </>
                  ) : null}
                  .
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={hereBusy || selfPresent}
                    onClick={() => void imHere()}
                    className="inline-flex h-11 items-center rounded-xl bg-cardinal px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {selfPresent
                      ? "You're here"
                      : hereBusy
                        ? "Marking…"
                        : "I'm here"}
                  </button>
                  <Link
                    href="/judging"
                    className="inline-flex h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold"
                  >
                    Judging portal
                  </Link>
                </div>
                {hereMsg ? (
                  <p className="mt-2 text-sm text-muted" role="status">
                    {hereMsg}
                  </p>
                ) : null}
              </section>
            )}

            {canInvite ? (
              <section className="flex flex-col gap-2 rounded-[20px] bg-white p-5">
                <h2 className="font-display m-0 text-[22px] font-extrabold">
                  Invite another team
                </h2>
                <p className="m-0 text-sm text-muted">
                  They get a notice on Home and accept in one tap.
                </p>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="min-h-11 min-w-[160px] rounded-xl border border-line bg-white px-3 text-sm"
                    value={inviteTeamId}
                    onChange={(e) => setInviteTeamId(e.target.value)}
                  >
                    <option value="">Pick a team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
                    onClick={() => {
                      if (!inviteTeamId || !session) return;
                      void fetch("/api/practice/invite", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          action: "invite",
                          sessionId: session.id,
                          teamId: inviteTeamId,
                        }),
                      }).then(async (r) => {
                        const d = await r.json();
                        setInviteMsg(
                          r.ok
                            ? `Invited. ${d.notified ?? 0} people got a notice on Home.`
                            : d.error ?? "Invite failed",
                        );
                      });
                    }}
                  >
                    Send invite
                  </button>
                </div>
                {inviteMsg ? (
                  <p className="m-0 text-sm text-muted">{inviteMsg}</p>
                ) : null}
                {shareLink ? (
                  <p className="m-0 break-all text-xs text-muted">
                    Online join link: {shareLink}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>

          <aside className="flex w-full flex-col gap-1.5 rounded-[20px] bg-white p-5 sm:w-[320px] sm:shrink-0">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display m-0 text-[22px] font-extrabold">
                Attendance
              </h2>
              <span className="text-[13px] font-semibold">
                {presentCount} of {people.length || presentCount}
              </span>
            </div>
            <span className="pb-1.5 text-[13px] text-muted">
              Cruxy pre-fills from voices and joined devices. Jainam or Dr. B
              confirms. Members can tap I&apos;m here.
            </span>
            {!admin ? (
              <button
                type="button"
                disabled={hereBusy || selfPresent}
                onClick={() => void imHere()}
                className="mb-2 min-h-11 rounded-xl bg-cardinal px-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {selfPresent
                  ? "You're here"
                  : hereBusy
                    ? "Marking…"
                    : "I'm here"}
              </button>
            ) : null}
            {hereMsg && admin ? (
              <p className="m-0 pb-1 text-xs text-muted">{hereMsg}</p>
            ) : null}
            {(attendance.length
              ? attendance
              : people.map((p) => ({
                  person_id: p.id,
                  status: "absent" as const,
                  source: "admin",
                }))
            )
              .slice(0, 20)
              .map((a) => {
                const p = personById[a.person_id];
                if (!p) return null;
                return (
                  <div
                    key={a.person_id}
                    className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-[#ECEEF1] py-2 text-sm"
                  >
                    <span>
                      <strong>{p.name}</strong>{" "}
                      <span
                        className={
                          a.status === "absent"
                            ? "text-[#C62828]"
                            : "text-muted"
                        }
                      >
                        {sourceLabel(a.source, p.recording_ok, a.status)}
                      </span>
                    </span>
                    {admin ? (
                      <span className="flex rounded-lg bg-paper p-0.5">
                        {(["present", "late", "absent"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void setAtt(p.id, s)}
                            className={
                              a.status === s
                                ? "min-h-11 rounded-md bg-white px-2.5 text-xs font-semibold capitalize text-ink"
                                : "min-h-11 rounded-md px-2.5 text-xs font-semibold capitalize text-muted"
                            }
                          >
                            {s}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs capitalize text-muted">
                        {a.status}
                      </span>
                    )}
                  </div>
                );
              })}
            {people.length > 11 ? (
              <span className="pt-2 text-[13px] text-muted">
                + {people.length - 11} more
              </span>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function uniqueTeamName(
  teamId: string,
  people: { team_id: string | null; team_name: string | null }[],
) {
  return people.find((p) => p.team_id === teamId)?.team_name ?? "Team";
}
