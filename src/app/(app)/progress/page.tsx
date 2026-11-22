"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/page-intro";
import { APPE_SCORE_ITEMS, type AppeItemKey } from "@/lib/practice/types";
import type { GoalStatus } from "@/lib/learning/growth-types";
import type { PeerKudos } from "@/lib/team/calendar-types";

type Series = {
  key: AppeItemKey;
  label: string;
  baseline: number | null;
  latest: number | null;
  delta: number | null;
};

type Goal = {
  id: string;
  title: string;
  body: string | null;
  status: GoalStatus;
  target_appe_item: AppeItemKey | null;
  comments: { id: string; body: string; author_id: string; created_at: string }[];
};

type View = {
  series: Series[];
  movedMost: {
    key: AppeItemKey;
    label: string;
    delta: number;
    baseline: number;
    latest: number;
  } | null;
  reflections: {
    id: string;
    went_well: string;
    one_change: string;
    confidence: number;
    created_at: string;
  }[];
  goals: Goal[];
};

type KudoRow = PeerKudos & { from_name?: string };

export default function ProgressPage() {
  const [view, setView] = useState<View | null>(null);
  const [kudos, setKudos] = useState<KudoRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [goalTitle, setGoalTitle] = useState("");
  const [goalBody, setGoalBody] = useState("");
  const [goalItem, setGoalItem] = useState<AppeItemKey | "">("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );

  async function refresh() {
    const res = await fetch("/api/my-progress");
    if (!res.ok) return;
    setView((await res.json()) as View);
  }

  useEffect(() => {
    void refresh();
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then(
        (d: {
          session?: { adminView?: boolean };
          person?: { role?: string };
        }) => {
          const role = d.person?.role;
          setIsAdminView(
            Boolean(
              d.session?.adminView &&
                (role === "coach_admin" || role === "tech_admin"),
            ),
          );
        },
      )
      .catch(() => undefined);
    void Promise.all([
      fetch("/api/team/kudos?mine=1"),
      fetch("/api/auth/people"),
    ]).then(async ([kRes, pRes]) => {
      if (kRes.ok) {
        const d = (await kRes.json()) as { kudos?: PeerKudos[] };
        setKudos(d.kudos ?? []);
      }
      if (pRes.ok) {
        const d = (await pRes.json()) as {
          people?: { id: string; name: string }[];
        };
        const map: Record<string, string> = {};
        for (const p of d.people ?? []) map[p.id] = p.name;
        setNames(map);
      }
    });
  }, []);

  async function addGoal() {
    setMsg(null);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: goalTitle,
        body: goalBody || null,
        targetAppeItem: goalItem || null,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(data.error ?? "Could not add goal.");
      return;
    }
    setGoalTitle("");
    setGoalBody("");
    setGoalItem("");
    setMsg("Goal saved.");
    await refresh();
  }

  async function setGoalStatus(id: string, status: GoalStatus) {
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refresh();
  }

  async function postComment(goalId: string) {
    const body = commentDrafts[goalId]?.trim() ?? "";
    if (!body) return;
    const res = await fetch(`/api/goals/${goalId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setMsg(data.error ?? "Could not comment.");
      return;
    }
    setCommentDrafts((p) => ({ ...p, [goalId]: "" }));
    await refresh();
  }

  const nextFocus = view?.reflections.find((r) => r.one_change.trim()) ?? null;
  const openGoals = view?.goals.filter((g) => g.status === "open") ?? [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <PageIntro title="Progress">
        Your scoring-card items against your own past only. Built for alone
        prep at odd hours.
      </PageIntro>
      <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <Link href="/practice" className="font-semibold text-cardinal underline">
          Start a practice
        </Link>
        <Link href="/practice/calibration" className="underline">
          Score trend
        </Link>
        <Link href="/settings/privacy" className="underline">
          Privacy
        </Link>
      </p>

      {!view ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          {nextFocus ? (
            <section className="rounded-[20px] border border-cardinal/25 bg-white p-5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-cardinal">
                Focus next round
              </span>
              <p className="m-0 mt-2 text-lg font-semibold leading-snug">
                {nextFocus.one_change}
              </p>
              <p className="m-0 mt-2 text-xs text-muted">
                From your last reflection. Shown again when you start practice.
              </p>
            </section>
          ) : null}

          <section className="rounded-[20px] bg-ink p-5 text-white">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-gold">
              Moved most
            </span>
            {view.movedMost ? (
              <>
                <p className="font-display m-0 mt-2 text-2xl font-extrabold">
                  {view.movedMost.label}
                </p>
                <p className="mt-2 text-sm text-[#C9CCD3]">
                  {view.movedMost.baseline.toFixed(1)} →{" "}
                  {view.movedMost.latest.toFixed(1)} (
                  {view.movedMost.delta > 0 ? "+" : ""}
                  {view.movedMost.delta.toFixed(1)})
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-[#C9CCD3]">
                Finish one judged round after your learning-profile baselines.
                Your biggest move shows here.
              </p>
            )}
          </section>

          <section className="rounded-[20px] bg-white p-5">
            <h2 className="font-display m-0 text-xl font-extrabold">
              Scoring card
            </h2>
            <ul className="mt-3 list-none space-y-2 p-0">
              {view.series.map((s) => (
                <li
                  key={s.key}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-2 text-sm first:border-0 first:pt-0"
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="font-mono text-xs text-muted">
                    {s.baseline != null ? `base ${s.baseline}` : "no base"}
                    {s.latest != null ? ` → ${s.latest}` : ""}
                    {s.delta != null
                      ? ` (${s.delta > 0 ? "+" : ""}${s.delta})`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[20px] bg-white p-5">
            <h2 className="font-display m-0 text-xl font-extrabold">
              Goals with Dr. B
            </h2>
            <p className="mt-1 text-xs text-muted">
              Up to three. Only you, Dr. B and Jainam.
            </p>
            <ul className="mt-3 list-none space-y-3 p-0">
              {view.goals.map((g) => (
                <li
                  key={g.id}
                  className="border-t border-line pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{g.title}</span>
                    <span className="text-xs text-muted">{g.status}</span>
                  </div>
                  {g.body ? (
                    <p className="mt-1 text-sm text-muted">{g.body}</p>
                  ) : null}
                  {g.target_appe_item ? (
                    <p className="mt-1 text-xs text-muted">
                      Linked to{" "}
                      {APPE_SCORE_ITEMS.find(
                        (i) => i.key === g.target_appe_item,
                      )?.label ?? g.target_appe_item}
                    </p>
                  ) : null}
                  {g.comments.map((c) => (
                    <p
                      key={c.id}
                      className="mt-2 rounded-xl bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                        Coach note
                      </span>
                      <br />
                      {c.body}
                    </p>
                  ))}
                  {g.status === "open" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void setGoalStatus(g.id, "done")}
                      >
                        Mark done
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void setGoalStatus(g.id, "dropped")}
                      >
                        Drop
                      </Button>
                    </div>
                  ) : null}
                  {isAdminView ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <textarea
                        className="min-h-[48px] rounded-xl border border-ink/15 bg-white p-2 text-sm"
                        placeholder="Comment as coach"
                        value={commentDrafts[g.id] ?? ""}
                        onChange={(e) =>
                          setCommentDrafts((p) => ({
                            ...p,
                            [g.id]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void postComment(g.id)}
                      >
                        Add coach comment
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {openGoals.length < 3 ? (
              <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                <input
                  className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
                  placeholder="Goal title"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                />
                <input
                  className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
                  placeholder="Optional detail"
                  value={goalBody}
                  onChange={(e) => setGoalBody(e.target.value)}
                />
                <select
                  className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
                  value={goalItem}
                  onChange={(e) =>
                    setGoalItem(e.target.value as AppeItemKey | "")
                  }
                >
                  <option value="">No scoring-card link</option>
                  {APPE_SCORE_ITEMS.map((i) => (
                    <option key={i.key} value={i.key}>
                      {i.label}
                    </option>
                  ))}
                </select>
                <Button type="button" onClick={() => void addGoal()}>
                  Add goal
                </Button>
              </div>
            ) : null}
          </section>

          <section className="rounded-[20px] bg-white p-5">
            <h2 className="font-display m-0 text-xl font-extrabold">
              Recent reflections
            </h2>
            {view.reflections.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                After a round, one minute on the report. Your one change comes
                back when you start the next session.
              </p>
            ) : (
              <ul className="mt-3 list-none space-y-3 p-0">
                {view.reflections.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="border-t border-line pt-3 text-sm first:border-0 first:pt-0"
                  >
                    <span className="text-xs text-muted">
                      {new Date(r.created_at).toLocaleDateString()},{" "}
                      {r.confidence}% sure
                    </span>
                    {r.one_change ? (
                      <p className="m-0 mt-1 font-medium">{r.one_change}</p>
                    ) : null}
                    {r.went_well ? (
                      <p className="m-0 mt-1 text-muted">
                        Went well: {r.went_well}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {kudos.length > 0 ? (
            <section className="rounded-[20px] bg-white p-5">
              <h2 className="font-display m-0 text-lg font-extrabold text-muted">
                Notes from teammates
              </h2>
              <ul className="mt-3 list-none space-y-3 p-0">
                {kudos.slice(0, 8).map((k) => (
                  <li key={k.id} className="text-sm">
                    <span className="font-medium">
                      {names[k.from_person_id] ?? k.from_name ?? "Teammate"}
                    </span>
                    <span className="text-muted">
                      {" "}
                      · {new Date(k.created_at).toLocaleDateString()}
                    </span>
                    <p className="m-0 mt-1 text-muted">{k.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
    </main>
  );
}
