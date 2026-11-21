"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Overview = {
  role: string;
  permissions: { area: string; jainam: string; drB: string }[];
  teams: {
    id: string;
    name: string;
    colour: string;
    readiness: number;
    deltaWeek: number;
    members: {
      id: string;
      name: string;
      consent_at: string | null;
      recording_ok: boolean;
      voice_sample_path: string | null;
      last_sign_in_at: string | null;
    }[];
  }[];
  attendancePct: number;
  consent: {
    id: string;
    name: string;
    team_id: string | null;
    consent_at: string | null;
    recording_ok: boolean;
    voice_sample: boolean;
    last_sign_in_at: string | null;
  }[];
  spend: {
    spent: number;
    caps: { monthly_usd: number; research_paused: boolean };
    byFeature: { feature: string; cost_usd: number }[];
    alert80: boolean;
    atCap: boolean;
  } | null;
  books: {
    id: string;
    title: string;
    chapter: string | null;
    case_id: string | null;
    status: string;
  }[] | null;
  driveSortQueue: { id: string; filename: string; hint: string; confidence: number; status: string }[] | null;
  calibration: { id: string; label: string; gap: number; judge_name: string | null; human_cards: number }[] | null;
  activity: {
    readOnly: boolean;
    entries: {
      id: string;
      action: string;
      personName: string;
      target: string | null;
      at: string;
    }[];
  };
  weekly: {
    optedIn: boolean;
    email: string | null;
    nextSend: string;
    preview: { recipients: { name: string }[] };
  };
};

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cruxyQ, setCruxyQ] = useState("Who needs help?");
  const [cruxyA, setCruxyA] = useState<string | null>(null);
  const [weeklyMsg, setWeeklyMsg] = useState<string | null>(null);

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
    setData(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function askCruxy() {
    const res = await fetch("/api/cruxy/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: cruxyQ }),
    });
    const j = (await res.json()) as { text?: string; error?: string };
    setCruxyA(j.text ?? j.error ?? "No answer");
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
      setWeeklyMsg(
        j.skippedReason ??
          `Sent to ${j.recipientCount} opted-in admin(s)${j.stub ? " (email stub — set EMAIL_API_KEY)" : ""}.`,
      );
    } else {
      setWeeklyMsg(action === "opt_in" ? "Opted in." : "Opted out.");
      await load();
    }
  }

  async function sortItem(id: string) {
    await fetch("/api/admin/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortId: id }),
    });
    await load();
  }

  if (error) {
    return (
      <main className="animate-fade-up">
        <p className="text-sm text-cardinal">{error}</p>
      </main>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted">Loading admin console…</p>;
  }

  const tech = data.role === "tech_admin";

  return (
    <main className="animate-fade-up space-y-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin console</h1>
        <p className="mt-1 text-sm text-muted">
          Running the program. Dr. B sees everything except panels marked Only Jainam.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.teams.map((t) => (
          <div
            key={t.id}
            className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3"
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: t.colour }}>
              {t.name} ready
            </p>
            <p className="font-display text-3xl font-semibold">{t.readiness}%</p>
            <p className="text-xs text-muted">+{t.deltaWeek} this week</p>
          </div>
        ))}
        <div className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Attendance
          </p>
          <p className="font-display text-3xl font-semibold">{data.attendancePct}%</p>
          <p className="text-xs text-muted">last 3 sessions</p>
        </div>
      </section>

      <section id="consent">
        <h2 className="font-display text-xl font-semibold">Consent status</h2>
        <p className="mt-1 text-sm text-muted">Per person · recording / voice / sign-in</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {data.teams.map((t) => (
            <div key={t.id} className="rounded-2xl border border-ink/10 bg-white/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase" style={{ color: t.colour }}>
                {t.name} · {t.members.length}
              </p>
              <ul className="space-y-2 text-sm">
                {t.members.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span>{m.name}</span>
                    <span className="text-xs text-muted">
                      {!m.last_sign_in_at
                        ? "hasn't signed in"
                        : m.recording_ok
                          ? `recorded ✓${m.voice_sample_path ? " voice ✓" : ""}`
                          : "text only"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Permissions</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase text-muted">
                <th className="py-2">Area</th>
                <th className="py-2">Jainam</th>
                <th className="py-2">Dr. B</th>
              </tr>
            </thead>
            <tbody>
              {data.permissions.map((row) => (
                <tr key={row.area} className="border-b border-ink/5">
                  <td className="py-2 pr-3">{row.area}</td>
                  <td className="py-2 pr-3">{row.jainam}</td>
                  <td className="py-2">{row.drB}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {tech && data.spend ? (
        <section className="rounded-2xl border border-cardinal/20 bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
            Only Jainam
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Spend this month</h2>
              <p className="font-mono text-2xl">
                ${data.spend.spent.toFixed(2)} / ${data.spend.caps.monthly_usd}
              </p>
              {data.spend.alert80 ? (
                <p className="text-sm text-cardinal">80% alert — watch the cap.</p>
              ) : null}
              {data.spend.caps.research_paused ? (
                <p className="text-sm text-cardinal">Research paused.</p>
              ) : null}
            </div>
            <Link
              href="/admin/spend"
              className="rounded-xl bg-cardinal px-4 py-2 text-sm text-white"
            >
              Open spend dashboard
            </Link>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.spend.byFeature.map((f) => (
              <li key={f.feature} className="text-sm">
                <span className="capitalize">{f.feature}</span>
                <span className="float-right font-mono">${f.cost_usd.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tech && data.books ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-cardinal/20 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
              Only Jainam
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">
              Books Cruxy asked for
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.books.map((b) => (
                <li key={b.id}>
                  {b.title}
                  {b.chapter ? ` · ${b.chapter}` : ""}
                  <span className="text-muted"> · {b.status}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/admin/books"
              className="mt-3 inline-block text-sm text-cardinal underline"
            >
              Open book requests
            </Link>
          </div>
          <div className="rounded-2xl border border-cardinal/20 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
              Only Jainam
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">
              Drive sorting queue
            </h2>
            <Link
              href="/library/sorting"
              className="mt-1 block text-xs text-muted underline"
            >
              Full library sorting
            </Link>
            <ul className="mt-3 space-y-2 text-sm">
              {(data.driveSortQueue ?? [])
                .filter((d) => d.status === "pending")
                .map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span>
                      “{d.filename}” · {d.hint}{" "}
                      <span className="font-mono text-xs text-muted">
                        {(d.confidence * 100).toFixed(0)}%
                      </span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => void sortItem(d.id)}>
                      Sort
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      ) : null}

      {tech && data.calibration ? (
        <section className="rounded-2xl border border-cardinal/20 bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
            Only Jainam
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Calibration</h2>
              <p className="text-sm text-muted">
                Human cards so far · {data.calibration[0]?.human_cards ?? 0}. Members never see
                weights or gaps.
              </p>
            </div>
            <Link href="/admin/calibration" className="text-sm text-cardinal underline">
              Full calibration view
            </Link>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {data.calibration.map((c) => (
              <li key={c.id}>
                {c.label}{" "}
                <span className="font-mono">
                  {c.gap > 0 ? "+" : ""}
                  {c.gap}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tech ? (
        <section className="flex flex-wrap gap-3">
          <Link
            href="/admin/passcodes"
            className="rounded-xl bg-cardinal px-4 py-2 text-sm text-white"
          >
            Passcodes
          </Link>
          <Link
            href="/admin/books"
            className="rounded-xl border border-ink/15 bg-white/70 px-4 py-2 text-sm"
          >
            Book requests
          </Link>
          <Link
            href="/admin/working"
            className="rounded-xl border border-ink/15 bg-white/70 px-4 py-2 text-sm"
          >
            Is Crux working?
          </Link>
          <Link
            href="/admin/competition"
            className="rounded-xl border border-ink/15 bg-white/70 px-4 py-2 text-sm"
          >
            Competition log
          </Link>
        </section>
      ) : (
        <section>
          <Link
            href="/admin/competition"
            className="rounded-xl border border-ink/15 bg-white/70 px-4 py-2 text-sm"
          >
            Competition log
          </Link>
        </section>
      )}

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <h2 className="font-display text-xl font-semibold">Cruxy admin mode</h2>
        <p className="mt-1 text-sm text-muted">
          Program questions from live data — who is prepared, what is happening, who needs help.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            value={cruxyQ}
            onChange={(e) => setCruxyQ(e.target.value)}
          />
          <Button onClick={() => void askCruxy()}>Ask</Button>
        </div>
        {cruxyA ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-ink/5 p-3 text-sm">
            {cruxyA}
          </pre>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Activity log</h2>
            {data.activity.readOnly ? (
              <span className="text-xs text-muted">Dr. B: read only</span>
            ) : null}
          </div>
          <ul className="mt-3 space-y-2">
            {data.activity.entries.length === 0 ? (
              <li className="text-sm text-muted">No entries yet.</li>
            ) : (
              data.activity.entries.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl border border-ink/5 bg-white/50 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-muted">
                    {new Date(e.at).toLocaleString()}
                  </span>{" "}
                  <span className="font-medium">{e.personName}</span>{" "}
                  <span className="text-muted">{e.action}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
          <h2 className="font-display text-xl font-semibold">Weekly summary</h2>
          <p className="mt-1 text-sm text-muted">
            {data.weekly.optedIn
              ? `Opted in. Next email ${data.weekly.nextSend}.`
              : "Opt in to get Sunday 6 pm Pacific email."}{" "}
            Only opted-in admins receive it
            {data.weekly.preview.recipients.length
              ? ` (currently: ${data.weekly.preview.recipients.map((r) => r.name).join(", ")})`
              : " (none yet)"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void weekly("opt_in")}>
              Opt in
            </Button>
            <Button size="sm" variant="outline" onClick={() => void weekly("opt_out")}>
              Opt out
            </Button>
            <Button size="sm" variant="gold" onClick={() => void weekly("send_now")}>
              Preview / send this week
            </Button>
          </div>
          {weeklyMsg ? <p className="mt-2 text-sm text-muted">{weeklyMsg}</p> : null}
          <p className="mt-3 text-xs text-muted">
            Email address: {data.weekly.email ?? "add one in Settings first"}.
          </p>
        </div>
      </section>
    </main>
  );
}
