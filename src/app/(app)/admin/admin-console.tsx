"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Keypad } from "@/components/keypad";
import { REVEAL_SECONDS } from "@/lib/constants";
import type { ModelSettingRow, ModelTier, ReasoningEffort } from "@/lib/cruxy/models";

type Member = {
  id: string;
  name: string;
  consent_at: string | null;
  recording_ok: boolean;
  voice_sample_path: string | null;
  last_sign_in_at: string | null;
};

type TeamBlock = {
  id: string;
  name: string;
  colour: string;
  readiness: number;
  deltaWeek: number;
  members: Member[];
};

type PasscodeRow = {
  id: string;
  name: string;
  team_id: string | null;
  role: string;
  hasPasscode: boolean;
  mustChoose: boolean;
  setAt: string | null;
  lastSignIn: string | null;
};

type Overview = {
  role: string;
  teams: TeamBlock[];
  coaches: { id: string; name: string; last_sign_in_at: string | null }[];
  attendancePct: number;
  spend: {
    spent: number;
    caps: { monthly_usd: number; research_paused: boolean };
    byFeature: { label: string; cost_usd: number; note?: string }[];
    alert80: boolean;
  } | null;
  books: {
    id: string;
    title: string;
    chapter: string | null;
    case_id: string | null;
    status: string;
  }[] | null;
  driveSortQueue: {
    id: string;
    filename: string;
    hint: string;
    confidence: number;
    status: string;
  }[] | null;
  calibration: {
    id: string;
    label: string;
    gap: number;
    judge_name: string | null;
    human_cards: number;
  }[] | null;
  models: Record<ModelTier, ModelSettingRow> | null;
  starters: {
    memberSet: boolean;
    coachSet: boolean;
    memberEnvMissing: boolean;
    memberSetAt: string | null;
    coachSetAt: string | null;
  } | null;
  activity: {
    readOnly: boolean;
    entries: {
      id: string;
      action: string;
      personName: string;
      target: string | null;
      at: string;
      meta: Record<string, unknown> | null;
    }[];
  };
  weekly: {
    optedIn: boolean;
    email: string | null;
    nextSend: string;
    preview: {
      attendance: { name: string; sessions: number; present: number }[];
      scoresByTeam: { team: string; rounds: number; avg: number }[];
      biggestImprovements: string[];
      casesAtRisk: string[];
      openDisagreements: string[];
      thingsToCare: string[];
      spendLine: string | null;
      errors: string[];
      recipients: { name: string; email: string; includeSpend: boolean }[];
    };
  };
};

function memberStatus(m: Member): { text: string; kind: "ok" | "warn" | "muted" } {
  if (!m.last_sign_in_at) return { text: "hasn't signed in", kind: "warn" };
  if (!m.recording_ok) return { text: "text only", kind: "muted" };
  return {
    text: m.voice_sample_path ? "recorded ✓ voice ✓" : "recorded ✓",
    kind: "ok",
  };
}

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const wasYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (sameDay) {
    return `today ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (wasYesterday) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatActivity(e: Overview["activity"]["entries"][0]): string {
  const a = e.action;
  if (a === "passcode_reveal") return `Showed a passcode`;
  if (a === "passcode_reset") return `Reset a passcode`;
  if (a === "sign_in_locked") return `5 wrong codes, locked 10 min`;
  if (a === "sign_in_failed") return `Wrong passcode try`;
  if (a === "decision_accept") return e.meta?.reason
    ? `✅ ${String(e.meta.reason)}`
    : "Accepted a proposal";
  if (a === "decision_reject") return e.meta?.reason
    ? `❌ ${String(e.meta.reason)}`
    : "Rejected a proposal";
  if (a.includes("session")) return a.replaceAll("_", " ");
  return a.replaceAll("_", " ");
}

function OnlyJainam() {
  return (
    <span className="self-start rounded-md bg-[#FFF3C4] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] text-[#8A6500]">
      ONLY JAINAM
    </span>
  );
}

const EFFORTS: (ReasoningEffort | "")[] = [
  "",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function AdminConsole() {
  const [data, setData] = useState<Overview | null>(null);
  const [passPeople, setPassPeople] = useState<PasscodeRow[]>([]);
  const [teamsMap, setTeamsMap] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{
    id: string;
    code: string;
    left: number;
  } | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [starterMsg, setStarterMsg] = useState<string | null>(null);
  const [starterWhich, setStarterWhich] = useState<"member" | "coach" | null>(null);
  const [starterDraft, setStarterDraft] = useState("");
  const [weeklyMsg, setWeeklyMsg] = useState<string | null>(null);
  const [modelMsg, setModelMsg] = useState<string | null>(null);
  const [modelDrafts, setModelDrafts] = useState<
    Record<ModelTier, { model: string; fallbacks: string; effort: string }>
  >({
    small: { model: "", fallbacks: "", effort: "" },
    strong: { model: "", fallbacks: "", effort: "" },
    embed: { model: "", fallbacks: "", effort: "" },
  });
  const [deletePersonId, setDeletePersonId] = useState("");
  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);
  const [seasonMsg, setSeasonMsg] = useState<string | null>(null);
  const [seasonDownload, setSeasonDownload] = useState<string | null>(null);
  const [backupNote, setBackupNote] = useState<string>(
    "Checking backup status…",
  );
  const [backupAt, setBackupAt] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movePersonId, setMovePersonId] = useState("");
  const [moveTeamId, setMoveTeamId] = useState("");
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const [weeklyPreviewOpen, setWeeklyPreviewOpen] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<
    {
      id: string;
      weekOf: string;
      summary: string;
      proposedUpdates: { kind: string; text: string }[];
      status: string;
    }[]
  >([]);
  const [reviewWaiting, setReviewWaiting] = useState<string | null>(null);

  async function load() {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (!me.session?.adminView) {
      setError("Turn on Admin switch first.");
      return;
    }
    const res = await fetch("/api/admin/overview");
    if (!res.ok) {
      setError("Could not load admin console.");
      return;
    }
    const overview = (await res.json()) as Overview;
    setData(overview);
    if (overview.models) {
      setModelDrafts({
        small: {
          model: overview.models.small.model,
          fallbacks: overview.models.small.fallbacks.join(", "),
          effort: overview.models.small.effort_default ?? "",
        },
        strong: {
          model: overview.models.strong.model,
          fallbacks: overview.models.strong.fallbacks.join(", "),
          effort: overview.models.strong.effort_default ?? "",
        },
        embed: {
          model: overview.models.embed.model,
          fallbacks: overview.models.embed.fallbacks.join(", "),
          effort: overview.models.embed.effort_default ?? "",
        },
      });
    }
    if (overview.role === "tech_admin") {
      const pc = await fetch("/api/admin/passcodes");
      if (pc.ok) {
        const j = (await pc.json()) as {
          teams: { id: string; name: string }[];
          people: PasscodeRow[];
        };
        setTeamsMap(j.teams);
        setPassPeople(j.people);
      }
      const bak = await fetch("/api/admin/ops/backup");
      if (bak.ok) {
        const j = (await bak.json()) as {
          status?: { note?: string; lastBackupAt?: string | null };
          message?: string;
        };
        setBackupNote(j.status?.note ?? j.message ?? "No backup yet.");
        setBackupAt(j.status?.lastBackupAt ?? null);
      }
      const rev = await fetch("/api/admin/cruxy-review");
      if (rev.ok) {
        const j = (await rev.json()) as {
          available?: boolean;
          message?: string;
          drafts?: typeof reviewDrafts;
        };
        setReviewDrafts(j.drafts ?? []);
        setReviewWaiting(j.available === false ? j.message ?? null : null);
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!reveal) return;
    if (reveal.left <= 0) {
      setReveal(null);
      return;
    }
    const t = window.setTimeout(() => {
      setReveal((r) => (r ? { ...r, left: r.left - 1 } : null));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [reveal]);

  const tech = data?.role === "tech_admin";

  const spendPct = useMemo(() => {
    if (!data?.spend) return 0;
    const cap = data.spend.caps.monthly_usd || 30;
    return Math.min(100, Math.round((data.spend.spent / cap) * 100));
  }, [data?.spend]);

  async function doReveal(personId: string, adminPasscode?: string) {
    setError(null);
    const res = await fetch("/api/admin/passcodes/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId, adminPasscode }),
    });
    const j = (await res.json()) as {
      error?: string;
      needsReauth?: boolean;
      passcode?: string;
      revealSeconds?: number;
    };
    if (res.status === 401 && j.needsReauth) {
      setNeedsReauth(true);
      setPendingRevealId(personId);
      return;
    }
    if (!res.ok) {
      setError(j.error ?? "Reveal failed.");
      return;
    }
    setNeedsReauth(false);
    setPendingRevealId(null);
    setReveal({
      id: personId,
      code: j.passcode!,
      left: j.revealSeconds ?? REVEAL_SECONDS,
    });
    await load();
  }

  async function doReset(personId: string) {
    setResetCode(null);
    const res = await fetch("/api/admin/passcodes/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId }),
    });
    const j = (await res.json()) as { error?: string; oneTimeCode?: string };
    if (!res.ok) {
      setError(j.error ?? "Reset failed.");
      return;
    }
    setResetCode(j.oneTimeCode ?? null);
    await load();
  }

  async function rotateStarter() {
    if (!starterWhich || !/^\d{6}$/.test(starterDraft)) {
      setStarterMsg("Enter a new 6 digit starter code.");
      return;
    }
    const res = await fetch("/api/admin/passcodes/starter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ which: starterWhich, code: starterDraft }),
    });
    const j = (await res.json()) as { error?: string; oneTimePlain?: string };
    if (!res.ok) {
      setStarterMsg(j.error ?? "Could not rotate.");
      return;
    }
    setStarterMsg(
      starterWhich === "member"
        ? `Member starter rotated. Share the new code in person only.`
        : `Dr. B's coach starter rotated. Share in person only.`,
    );
    setStarterDraft("");
    setStarterWhich(null);
    await load();
  }

  async function pauseResearch(paused: boolean) {
    await fetch("/api/admin/spend", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ research_paused: paused }),
    });
    await load();
  }

  async function sortItem(id: string) {
    await fetch("/api/admin/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortId: id }),
    });
    await load();
  }

  async function weekly(action: "opt_in" | "opt_out" | "send_now") {
    const res = await fetch("/api/admin/weekly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = (await res.json()) as {
      error?: string;
      stub?: boolean;
      recipientCount?: number;
      skippedReason?: string;
    };
    if (!res.ok) {
      setWeeklyMsg(j.error ?? "Failed");
      return;
    }
    if (action === "send_now") {
      setWeeklyPreviewOpen(true);
      setWeeklyMsg(
        j.skippedReason ??
          `Preview ready for ${j.recipientCount ?? 0} opted-in admin(s)${
            j.stub ? " (email stubbed until EMAIL_API_KEY is set)" : ""
          }.`,
      );
      await load();
    } else {
      setWeeklyMsg(action === "opt_in" ? "Opted in." : "Opted out.");
      await load();
    }
  }

  async function movePerson() {
    if (!movePersonId) {
      setMoveMsg("Pick a person.");
      return;
    }
    const res = await fetch("/api/admin/people", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: movePersonId,
        teamId: moveTeamId || null,
      }),
    });
    const j = (await res.json()) as { error?: string; person?: { name: string } };
    if (!res.ok) {
      setMoveMsg(j.error ?? "Could not move.");
      return;
    }
    setMoveMsg(
      moveTeamId
        ? `Moved ${j.person?.name ?? "person"} to the selected team.`
        : `Removed ${j.person?.name ?? "person"} from their team.`,
    );
    setMovePersonId("");
    await load();
  }

  async function deletePersonData() {
    if (!deletePersonId) {
      setPrivacyMsg("Pick a person first.");
      return;
    }
    if (
      !window.confirm(
        "Delete this person's transcript lines, voice sample and comments? Scores stay anonymous.",
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/ops/delete-person", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId: deletePersonId }),
    });
    const j = (await res.json()) as {
      error?: string;
      message?: string;
      available?: boolean;
      deleted?: {
        transcript_lines: number;
        voice_sample: boolean;
        comments: number;
      };
    };
    if (res.status === 501 || j.available === false) {
      setPrivacyMsg(j.message ?? "Privacy delete is not available yet.");
      return;
    }
    if (!res.ok) {
      setPrivacyMsg(j.error ?? "Delete failed.");
      return;
    }
    setPrivacyMsg(
      `Deleted ${j.deleted?.transcript_lines ?? 0} transcript lines, ${
        j.deleted?.comments ?? 0
      } comments${j.deleted?.voice_sample ? ", voice sample" : ""}.`,
    );
  }

  async function runSeasonExport() {
    setSeasonMsg(null);
    setSeasonDownload(null);
    const res = await fetch("/api/admin/ops/season-export", { method: "POST" });
    const j = (await res.json()) as {
      error?: string;
      message?: string;
      available?: boolean;
      filename?: string;
      bytes?: number;
      downloadPath?: string;
    };
    if (res.status === 501 || j.available === false) {
      setSeasonMsg(j.message ?? "Season archive is not available yet.");
      return;
    }
    if (!res.ok) {
      setSeasonMsg(j.error ?? "Export failed.");
      return;
    }
    setSeasonDownload(j.downloadPath ?? null);
    setSeasonMsg(
      `Archive ready: ${j.filename} (${j.bytes ?? 0} bytes). The Drive service account is read only, so download this file yourself.`,
    );
  }

  async function reviewAction(draftId: string, action: "approve" | "reject") {
    const res = await fetch("/api/admin/cruxy-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, action }),
    });
    const j = (await res.json()) as { error?: string; message?: string };
    if (!res.ok) {
      setReviewMsg(j.message ?? j.error ?? "Could not update review.");
      return;
    }
    setReviewMsg(action === "approve" ? "Approved." : "Rejected.");
    await load();
  }

  async function saveModel(tier: ModelTier) {
    const draft = modelDrafts[tier];
    const fallbacks = draft.fallbacks
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tier,
        model: draft.model.trim(),
        fallbacks,
        effort_default: (draft.effort || null) as ReasoningEffort | null,
      }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setModelMsg(j.error ?? "Could not save.");
      return;
    }
    setModelMsg(`Saved ${tier} tier.`);
    await load();
  }

  function teamName(id: string | null) {
    if (!id) return "Admin";
    return teamsMap.find((t) => t.id === id)?.name ?? "Admin";
  }

  function formatRevealCode(code: string) {
    const digits = code.replace(/\D/g, "");
    if (digits.length === 6) {
      return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
    }
    return code;
  }

  if (error && !data) {
    return (
      <div className="animate-fade-up">
        <p className="text-sm text-cardinal">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted">Loading admin console…</p>;
  }

  return (
    <div className="animate-fade-up flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Admin console
          </span>
          <h1 className="font-display m-0 text-[48px] font-extrabold leading-none tracking-[-0.02em]">
            Running the program
          </h1>
        </div>
        <p className="max-w-[360px] text-right text-[13px] text-muted">
          Dr. B sees everything here except the panels marked{" "}
          <span className="rounded-md bg-[#FFF3C4] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] text-[#8A6500]">
            ONLY JAINAM
          </span>
        </p>
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.teams.map((t) => (
          <div
            key={t.id}
            className="flex flex-col gap-1.5 rounded-[20px] bg-white p-5"
          >
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              {t.name} ready
            </span>
            <span
              className="font-display text-[40px] font-extrabold leading-none"
              style={{ color: t.colour }}
            >
              {t.readiness}%
            </span>
            <span className="text-[13px] text-muted">
              {t.deltaWeek > 0 ? `+${t.deltaWeek}` : t.deltaWeek} this week
            </span>
          </div>
        ))}
        <div className="flex flex-col gap-1.5 rounded-[20px] bg-white p-5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Attendance
          </span>
          <span className="font-display text-[40px] font-extrabold leading-none">
            {data.attendancePct}%
          </span>
          <span className="text-[13px] text-muted">last 3 sessions</span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {data.teams.map((t) => (
          <section
            key={t.id}
            className="flex flex-col gap-3 rounded-[20px] bg-white p-5"
            style={{ borderTop: `5px solid ${t.colour}` }}
          >
            <div className="flex justify-between">
              <strong>{t.name}</strong>
              <span className="font-mono text-[13px]">{t.members.length}</span>
            </div>
            {t.members.map((m) => {
              const st = memberStatus(m);
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-[10px] bg-[#F7F8FA] px-3 py-2.5 text-sm"
                >
                  <span>{m.name}</span>
                  <span
                    className={
                      st.kind === "ok"
                        ? "text-xs font-bold text-[#0B5E53]"
                        : st.kind === "warn"
                          ? "text-xs font-bold text-[#C62828]"
                          : "text-xs font-bold text-muted"
                    }
                  >
                    {st.text}
                  </span>
                </div>
              );
            })}
            {t.name === "Team 3" ? (
              <button
                type="button"
                className="h-[38px] self-start rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                onClick={() => {
                  setMoveOpen(true);
                  setMoveMsg(null);
                }}
              >
                Add or move a person
              </button>
            ) : null}
          </section>
        ))}
      </div>

      {moveOpen ? (
        <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
          <strong>Move a person</strong>
          <p className="text-sm text-muted">
            Move someone between teams, or clear their team. New people join
            through the starter code, not from here.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Person
              <select
                className="h-[38px] rounded-[10px] border border-mist bg-white px-3"
                value={movePersonId}
                onChange={(e) => setMovePersonId(e.target.value)}
              >
                <option value="">Pick a person</option>
                {data.teams.flatMap((t) =>
                  t.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({t.name})
                    </option>
                  )),
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              New team
              <select
                className="h-[38px] rounded-[10px] border border-mist bg-white px-3"
                value={moveTeamId}
                onChange={(e) => setMoveTeamId(e.target.value)}
              >
                <option value="">No team</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="h-[38px] rounded-[10px] bg-ink px-3 text-[13px] font-semibold text-white"
              onClick={() => void movePerson()}
            >
              Save
            </button>
            <button
              type="button"
              className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
              onClick={() => setMoveOpen(false)}
            >
              Close
            </button>
          </div>
          {moveMsg ? <p className="text-sm text-muted">{moveMsg}</p> : null}
        </section>
      ) : null}

      {tech ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {data.spend ? (
            <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
              <OnlyJainam />
              <div className="flex items-baseline justify-between gap-2">
                <strong>Spend this month</strong>
                <span className="font-mono text-lg font-semibold">
                  ${data.spend.spent.toFixed(2)} / ${data.spend.caps.monthly_usd}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[#ECEEF1]">
                <div
                  className="h-2.5 rounded-full bg-ink"
                  style={{ width: `${spendPct}%` }}
                />
              </div>
              {data.spend.alert80 ? (
                <p className="text-xs font-bold text-cardinal">At or above 80% of the cap.</p>
              ) : null}
              <div className="grid grid-cols-[1fr_auto] gap-1.5 text-[13px]">
                {data.spend.byFeature.map((f) => (
                  <div key={f.label} className="contents">
                    <span>{f.label}</span>
                    <span className="font-mono">
                      ${f.cost_usd.toFixed(2)}
                      {f.note ? ` (${f.note})` : ""}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/spend"
                  className="inline-flex h-[38px] items-center rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                >
                  Caps
                </Link>
                <button
                  type="button"
                  className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                  onClick={() =>
                    void pauseResearch(!data.spend!.caps.research_paused)
                  }
                >
                  {data.spend.caps.research_paused
                    ? "Resume research"
                    : "Pause research"}
                </button>
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
            <OnlyJainam />
            <strong>Books Cruxy asked for</strong>
            {(data.books ?? []).length === 0 ? (
              <p className="text-sm text-muted">No book requests yet.</p>
            ) : (
              (data.books ?? []).slice(0, 4).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-[10px] bg-[#F7F8FA] px-3 py-2.5 text-sm"
                >
                  <span>
                    <em>{b.title}</em>
                    {b.chapter ? `, ${b.chapter}` : ""}
                  </span>
                  <Link
                    href="/admin/books"
                    className="inline-flex h-[38px] items-center rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                  >
                    Upload
                  </Link>
                </div>
              ))
            )}
            <strong className="pt-1">Drive sorting queue</strong>
            {(data.driveSortQueue ?? [])
              .filter((d) => d.status === "pending")
              .slice(0, 3)
              .map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-[10px] bg-[#F7F8FA] px-3 py-2.5 text-sm"
                >
                  <span>
                    &ldquo;{d.filename}&rdquo;, {d.hint}
                  </span>
                  <button
                    type="button"
                    className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                    onClick={() => void sortItem(d.id)}
                  >
                    Sort
                  </button>
                </div>
              ))}
            {(data.driveSortQueue ?? []).filter((d) => d.status === "pending")
              .length === 0 ? (
              <p className="text-sm text-muted">Queue is clear.</p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
            <OnlyJainam />
            <strong>Calibration</strong>
            <div className="grid grid-cols-[1fr_auto] gap-1.5 text-[13px]">
              <span>Human cards so far</span>
              <span className="font-mono">
                {data.calibration?.[0]?.human_cards ?? 0}
              </span>
              {(data.calibration ?? []).slice(0, 3).map((c) => (
                <div key={c.id} className="contents">
                  <span>{c.label}</span>
                  <span className="font-mono">
                    {c.gap > 0 ? `+${c.gap}` : c.gap}
                  </span>
                </div>
              ))}
              {(data.calibration ?? []).find((c) => c.judge_name) ? (
                <>
                  <span>Most weighted judge</span>
                  <span>
                    {(data.calibration ?? []).find((c) => c.judge_name)
                      ?.judge_name ?? "None"}
                  </span>
                </>
              ) : null}
            </div>
            <span className="text-xs text-muted">
              Members never see weights or gaps.
            </span>
            <Link
              href="/admin/calibration"
              className="text-sm font-semibold text-cardinal underline"
            >
              Full calibration view
            </Link>
          </section>
        </div>
      ) : null}

      {tech ? (
        <section
          className="flex flex-col gap-3 rounded-[20px] bg-white p-5"
          aria-labelledby="pc"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <OnlyJainam />
              <strong id="pc" className="text-[17px]">
                Passcodes
              </strong>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="self-center text-[13px] text-muted">
                Starter code for new members:{" "}
                {data.starters?.memberEnvMissing
                  ? "env hash missing"
                  : data.starters?.memberSet
                    ? "set"
                    : "not set"}
              </span>
              <button
                type="button"
                className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                onClick={() => {
                  setStarterWhich("member");
                  setStarterDraft("");
                  setStarterMsg(null);
                }}
              >
                Change starter code
              </button>
              <button
                type="button"
                className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                onClick={() => {
                  setStarterWhich("coach");
                  setStarterDraft("");
                  setStarterMsg(null);
                }}
              >
                Change Dr. B starter
              </button>
            </span>
          </div>

          {data.starters?.memberEnvMissing ? (
            <p className="rounded-[10px] bg-[#FFF3C4] px-3 py-2 text-sm text-[#8A6500]">
              MEMBER_STARTER_CODE_HASH is not set. Add it in Vercel env, then
              rotate the starter here.
            </p>
          ) : null}

          {starterWhich ? (
            <div className="flex flex-wrap items-end gap-2 rounded-[12px] border border-mist bg-[#F7F8FA] p-3">
              <label className="flex flex-col gap-1 text-sm">
                New {starterWhich === "member" ? "member" : "coach"} starter (6
                digits)
                <input
                  className="h-[38px] rounded-[10px] border border-mist bg-white px-3 font-mono tracking-widest"
                  inputMode="numeric"
                  maxLength={6}
                  value={starterDraft}
                  onChange={(e) =>
                    setStarterDraft(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </label>
              <button
                type="button"
                className="h-[38px] rounded-[10px] bg-ink px-3 text-[13px] font-semibold text-white"
                onClick={() => void rotateStarter()}
              >
                Save new starter
              </button>
              <button
                type="button"
                className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                onClick={() => setStarterWhich(null)}
              >
                Cancel
              </button>
            </div>
          ) : null}
          {starterMsg ? <p className="text-sm text-muted">{starterMsg}</p> : null}
          {resetCode ? (
            <p className="rounded-[10px] bg-gold/20 px-3 py-2 text-sm">
              One-time code (share in person):{" "}
              <span className="font-mono font-semibold tracking-widest">
                {formatRevealCode(resetCode)}
              </span>
            </p>
          ) : null}

          {needsReauth ? (
            <div className="rounded-[12px] border border-mist bg-[#F7F8FA] p-4">
              <p className="mb-3 text-sm font-medium">
                Re-enter your passcode to reveal
              </p>
              <Keypad
                onSubmit={async (code) => {
                  if (pendingRevealId) await doReveal(pendingRevealId, code);
                }}
              />
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2.5 py-2 font-bold">Person</th>
                  <th className="px-2.5 py-2 font-bold">Team</th>
                  <th className="px-2.5 py-2 font-bold">Passcode</th>
                  <th className="px-2.5 py-2 font-bold">Chosen</th>
                  <th className="px-2.5 py-2 font-bold">Last sign in</th>
                  <th className="px-2.5 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {passPeople.map((p) => {
                  const showing = reveal?.id === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={
                        showing
                          ? "border-t border-[#ECEEF1] bg-[#FFF7DB]"
                          : "border-t border-[#ECEEF1]"
                      }
                    >
                      <td
                        className={`px-2.5 py-2.5 ${showing ? "font-semibold" : ""}`}
                      >
                        {p.name}
                      </td>
                      <td className="px-2.5 py-2.5">{teamName(p.team_id)}</td>
                      <td className="px-2.5 py-2.5 font-mono tracking-[0.2em]">
                        {showing ? (
                          <span>
                            <span className="text-lg font-semibold tracking-[0.15em]">
                              {formatRevealCode(reveal!.code)}
                            </span>{" "}
                            <span className="font-sans text-xs tracking-normal text-[#8A6500]">
                              hides in {reveal!.left}s
                            </span>
                          </span>
                        ) : p.hasPasscode ? (
                          "••••••"
                        ) : p.mustChoose ? (
                          <span className="font-sans tracking-normal text-muted">
                            One-time / must choose
                          </span>
                        ) : (
                          <span className="font-sans tracking-normal text-muted">
                            Hasn&apos;t chosen one yet
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5">
                        {p.setAt
                          ? new Date(p.setAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          : "not set"}
                      </td>
                      <td
                        className={`px-2.5 py-2.5 ${!p.lastSignIn ? "text-[#C62828]" : ""}`}
                      >
                        {formatWhen(p.lastSignIn)}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right">
                        {p.hasPasscode ? (
                          <>
                            <button
                              type="button"
                              className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                              onClick={() =>
                                showing
                                  ? setReveal(null)
                                  : void doReveal(p.id)
                              }
                            >
                              {showing ? "Hide" : "Show"}
                            </button>{" "}
                            <button
                              type="button"
                              className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                              onClick={() => void doReset(p.id)}
                            >
                              Reset
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                            onClick={() => void doReset(p.id)}
                          >
                            Send starter code
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="text-xs text-muted">
            Showing {passPeople.length} people. The first Show in 10 minutes asks
            for your own passcode. Every Show and Reset goes in the activity log.
            Your own passcode is never listed. Everyone was told you can see
            theirs when they chose it.
          </span>
        </section>
      ) : null}

      {tech && data.models ? (
        <section
          id="models"
          className="flex flex-col gap-3 rounded-[20px] bg-white p-5"
        >
          <span className="flex items-center gap-2.5">
            <OnlyJainam />
            <strong className="text-[17px]">Model settings</strong>
          </span>
          <p className="text-sm text-muted">
            Primary model and ordered fallbacks for each tier. Members never see
            these ids. Changes write to the activity log. See also{" "}
            <Link href="/admin/agents" className="underline">
              Cruxy agents
            </Link>{" "}
            for job, tier and run counts.
          </p>
          <div className="grid gap-3 lg:grid-cols-3">
            {(["small", "strong", "embed"] as ModelTier[]).map((tier) => (
              <div
                key={tier}
                className="flex flex-col gap-2 rounded-[12px] border border-mist bg-[#F7F8FA] p-3"
              >
                <strong className="capitalize">{tier}</strong>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Primary
                  <input
                    className="h-[38px] rounded-[10px] border border-mist bg-white px-3 font-mono text-[13px] text-ink"
                    value={modelDrafts[tier].model}
                    onChange={(e) =>
                      setModelDrafts((d) => ({
                        ...d,
                        [tier]: { ...d[tier], model: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Fallbacks (comma-separated)
                  <input
                    className="h-[38px] rounded-[10px] border border-mist bg-white px-3 font-mono text-[13px] text-ink"
                    value={modelDrafts[tier].fallbacks}
                    disabled={tier === "embed"}
                    placeholder={tier === "embed" ? "none (vector space)" : ""}
                    onChange={(e) =>
                      setModelDrafts((d) => ({
                        ...d,
                        [tier]: { ...d[tier], fallbacks: e.target.value },
                      }))
                    }
                  />
                </label>
                {tier !== "embed" ? (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Default effort
                    <select
                      className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] text-ink"
                      value={modelDrafts[tier].effort}
                      onChange={(e) =>
                        setModelDrafts((d) => ({
                          ...d,
                          [tier]: { ...d[tier], effort: e.target.value },
                        }))
                      }
                    >
                      {EFFORTS.map((e) => (
                        <option key={e || "unset"} value={e}>
                          {e || "unset"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="mt-1 h-[38px] self-start rounded-[10px] bg-ink px-3 text-[13px] font-semibold text-white"
                  onClick={() => void saveModel(tier)}
                >
                  Save {tier}
                </button>
              </div>
            ))}
          </div>
          {modelMsg ? <p className="text-sm text-muted">{modelMsg}</p> : null}
        </section>
      ) : null}

      {tech ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
            <OnlyJainam />
            <strong>Delete a person&apos;s private data</strong>
            <p className="text-sm text-muted">
              One action: transcript lines, voice sample and comments. Aggregate
              scores stay.
            </p>
            <select
              className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-sm"
              value={deletePersonId}
              onChange={(e) => setDeletePersonId(e.target.value)}
            >
              <option value="">Pick a person</option>
              {passPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="h-[38px] self-start rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
              onClick={() => void deletePersonData()}
            >
              Delete private data
            </button>
            {privacyMsg ? <p className="text-sm text-muted">{privacyMsg}</p> : null}
          </section>

          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
            <OnlyJainam />
            <strong>Season archive</strong>
            <p className="text-sm text-muted">
              Downloadable export for season end. The Drive service account is
              read only, so this is a file you download, not an upload.
            </p>
            <button
              type="button"
              className="h-[38px] self-start rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
              onClick={() => void runSeasonExport()}
            >
              Build season archive
            </button>
            {seasonMsg ? <p className="text-sm text-muted">{seasonMsg}</p> : null}
            {seasonDownload ? (
              <a
                href={seasonDownload}
                className="text-sm font-semibold text-cardinal underline"
                target="_blank"
                rel="noreferrer"
              >
                Download archive
              </a>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
            <OnlyJainam />
            <strong>Backup status</strong>
            <p className="text-sm text-muted">
              Weekly logical backup of key tables to Storage.
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-1.5 text-[13px]">
              <span>Last backup</span>
              <span className="font-mono">
                {backupAt ? formatWhen(backupAt) : "never"}
              </span>
            </div>
            <span className="text-xs text-muted">{backupNote}</span>
          </section>
        </div>
      ) : null}

      {tech ? (
        <section
          id="cruxy-review"
          className="flex flex-col gap-3 rounded-[20px] bg-white p-5"
        >
          <span className="flex items-center gap-2.5">
            <OnlyJainam />
            <strong className="text-[17px]">Weekly Cruxy review</strong>
          </span>
          <p className="text-sm text-muted">
            Cruxy drafts updates to its examples and checks from the week&apos;s
            feedback. You approve them here.
          </p>
          {reviewWaiting ? (
            <p className="rounded-[10px] bg-[#F7F8FA] px-3 py-2 text-sm text-muted">
              {reviewWaiting}
            </p>
          ) : null}
          {reviewDrafts.length === 0 && !reviewWaiting ? (
            <p className="text-sm text-muted">No pending drafts.</p>
          ) : null}
          {reviewDrafts.map((d) => (
            <div
              key={d.id}
              className="flex flex-col gap-2 rounded-[12px] border border-mist bg-[#F7F8FA] p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong>Week of {d.weekOf}</strong>
                <span className="text-xs uppercase tracking-wide text-muted">
                  {d.status}
                </span>
              </div>
              <p className="text-sm">{d.summary}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                {d.proposedUpdates.map((u, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink">{u.kind}:</span>{" "}
                    {u.text}
                  </li>
                ))}
              </ul>
              {d.status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-[38px] rounded-[10px] bg-ink px-3 text-[13px] font-semibold text-white"
                    onClick={() => void reviewAction(d.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-[13px] font-semibold"
                    onClick={() => void reviewAction(d.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {reviewMsg ? <p className="text-sm text-muted">{reviewMsg}</p> : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-start gap-3">
        <section className="min-w-0 flex-[2_1_560px] rounded-[20px] bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <strong>Activity log</strong>
            {data.activity.readOnly ? (
              <span className="text-xs text-muted">Dr. B: read only</span>
            ) : null}
          </div>
          <div className="grid grid-cols-[64px_110px_1fr] gap-x-3 gap-y-2 text-[13px]">
            {data.activity.entries.length === 0 ? (
              <p className="col-span-3 text-sm text-muted">No entries yet.</p>
            ) : (
              data.activity.entries.slice(0, 12).map((e) => (
                <div key={e.id} className="contents">
                  <span className="font-mono">
                    {new Date(e.at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>{e.personName}</span>
                  <span
                    className={
                      e.action.includes("locked") || e.action.includes("failed")
                        ? "text-[#C62828]"
                        : undefined
                    }
                  >
                    {formatActivity(e)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-[20px] bg-ink p-5 text-white">
          <strong>Weekly summary</strong>
          <span className="text-sm leading-relaxed text-[#D6D9DF]">
            {data.weekly.optedIn
              ? `Opted in. Next email ${data.weekly.nextSend}: attendance, scores by team, biggest improvements, cases at risk, open disagreements, Things to take care of.`
              : `Opt in for Sunday 6 pm: attendance, scores by team, biggest improvements, cases at risk, open disagreements, Things to take care of.`}
            {tech
              ? " Jainam also gets spend and errors."
              : ""}
          </span>
          <button
            type="button"
            className="self-start text-sm font-semibold text-gold"
            onClick={() => void weekly("send_now")}
          >
            Preview this week&apos;s email
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="h-[38px] rounded-[10px] border border-white/20 bg-white/10 px-3 text-[13px] font-semibold"
              onClick={() => void weekly("opt_in")}
            >
              Opt in
            </button>
            <button
              type="button"
              className="h-[38px] rounded-[10px] border border-white/20 bg-white/10 px-3 text-[13px] font-semibold"
              onClick={() => void weekly("opt_out")}
            >
              Opt out
            </button>
          </div>
          {weeklyMsg ? (
            <p className="text-xs text-[#D6D9DF]">{weeklyMsg}</p>
          ) : null}
          {weeklyPreviewOpen ? (
            <div className="mt-1 space-y-2 rounded-[12px] border border-white/15 bg-white/5 p-3 text-xs text-[#D6D9DF]">
              <p className="font-semibold text-white">This week</p>
              <p>
                Recipients:{" "}
                {data.weekly.preview.recipients.length
                  ? data.weekly.preview.recipients
                      .map((r) =>
                        r.includeSpend ? `${r.name} (with spend)` : r.name,
                      )
                      .join(", ")
                  : "none opted in"}
              </p>
              <p>
                Attendance:{" "}
                {data.weekly.preview.attendance
                  .slice(0, 4)
                  .map((a) => `${a.name} ${a.present}/${a.sessions}`)
                  .join(", ") || "none"}
              </p>
              <p>
                Scores:{" "}
                {data.weekly.preview.scoresByTeam
                  .map((s) => `${s.team} avg ${s.avg}/60`)
                  .join(", ") || "none"}
              </p>
              <p>
                Improvements:{" "}
                {data.weekly.preview.biggestImprovements.join("; ") || "none"}
              </p>
              <p>
                At risk:{" "}
                {data.weekly.preview.casesAtRisk.join("; ") || "none"}
              </p>
              <p>
                Disagreements:{" "}
                {data.weekly.preview.openDisagreements.join("; ") || "none"}
              </p>
              <p>
                Things:{" "}
                {data.weekly.preview.thingsToCare.join("; ") || "none"}
              </p>
              {tech && data.weekly.preview.spendLine ? (
                <p>Spend: {data.weekly.preview.spendLine}</p>
              ) : null}
              {tech && data.weekly.preview.errors.length ? (
                <p>Errors: {data.weekly.preview.errors.join("; ")}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/practice/admin" className="text-muted underline">
          Sessions
        </Link>
        <Link href="/revision/questions" className="text-muted underline">
          Question bank
        </Link>
        <Link href="/admin/competition" className="text-muted underline">
          Competition log
        </Link>
        {tech ? (
          <>
            <Link href="/admin/working" className="text-muted underline">
              Is Crux working?
            </Link>
            <Link href="/admin/spend" className="text-muted underline">
              Spend dashboard
            </Link>
          </>
        ) : null}
        <Link href="/home" className="text-muted underline">
          Back to member view
        </Link>
      </div>
    </div>
  );
}
