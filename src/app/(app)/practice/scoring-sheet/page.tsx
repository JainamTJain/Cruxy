"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppeScoringCard } from "@/components/practice/appe-scoring-card";

type Item = {
  key: string;
  label: string;
  question: string;
  sort_ord: number;
  min_score: number;
  max_score: number;
  is_total: boolean;
};

type Guide = {
  kind: "band" | "guide";
  title: string;
  body: string;
  sort_ord: number;
};

type Version = {
  id: string;
  source_label: string;
  source_path: string;
  checksum: string;
  status: string;
  diff_summary: string | null;
};

export default function ScoringSheetPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [guide, setGuide] = useState<Guide[]>([]);
  const [version, setVersion] = useState<Version | null>(null);
  const [pending, setPending] = useState<Version | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isTech, setIsTech] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  async function load() {
    const [sheetRes, meRes, sessRes] = await Promise.all([
      fetch("/api/practice/scoring-sheet"),
      fetch("/api/auth/me"),
      fetch("/api/practice/sessions"),
    ]);
    if (sheetRes.ok) {
      const data = (await sheetRes.json()) as {
        version: Version;
        items: Item[];
        guide: Guide[];
        pending: Version | null;
      };
      setVersion(data.version);
      setItems(data.items);
      setGuide(data.guide);
      setPending(data.pending);
    }
    if (meRes.ok) {
      const me = (await meRes.json()) as {
        session?: { role?: string; adminView?: boolean };
      };
      setIsTech(
        me.session?.role === "tech_admin" && Boolean(me.session?.adminView),
      );
    }
    if (sessRes.ok) {
      const data = (await sessRes.json()) as {
        teams?: { id: string; name: string }[];
      };
      setTeams((data.teams ?? []).slice(0, 2));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function propose() {
    const res = await fetch("/api/practice/scoring-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "propose" }),
    });
    const data = (await res.json()) as { error?: string };
    setMsg(res.ok ? "Newer Drive sheet queued for your review." : data.error ?? "Failed");
    await load();
  }

  async function decide(approve: boolean) {
    if (!pending) return;
    const res = await fetch("/api/practice/scoring-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: approve ? "confirm" : "reject",
        versionId: pending.id,
      }),
    });
    setMsg(res.ok ? (approve ? "Sheet switched." : "Kept the active sheet.") : "Failed");
    await load();
  }

  const bands = guide.filter((g) => g.kind === "band");
  const guides = guide.filter((g) => g.kind === "guide");

  return (
    <main className="animate-fade-up mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-bold tracking-[0.1em] text-muted">
          APPE SCORING SHEET
        </p>
        <h1 className="font-display text-3xl font-semibold">
          Judge card sheet
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {version
            ? `${version.source_label}. Same items, wording, order and 1 to 10 scales as the APPE training sheet.`
            : "Loading the active judge card sheet…"}
        </p>
      </div>

      {pending ? (
        <section className="rounded-2xl border border-gold/40 bg-gold/10 p-4">
          <h2 className="font-display text-lg font-semibold">
            Newer sheet waiting
          </h2>
          <p className="mt-1 text-sm">
            {pending.source_label}. {pending.diff_summary ?? "Diff not set."}
          </p>
          {isTech ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="h-[38px] rounded-[10px] bg-ink px-3 text-sm font-semibold text-white"
                onClick={() => void decide(true)}
              >
                Switch after review
              </button>
              <button
                type="button"
                className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-sm font-semibold"
                onClick={() => void decide(false)}
              >
                Keep current
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Jainam confirms the switch in admin view.
            </p>
          )}
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70 p-4">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs uppercase text-muted">
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2">Question on the sheet</th>
                  <th className="py-2">Scale</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key} className="border-b border-ink/5 align-top">
                    <td className="py-3 pr-2 font-medium">{item.label}</td>
                    <td className="py-3 pr-2 text-muted">{item.question}</td>
                    <td className="py-3 font-mono text-xs">
                      {item.min_score} to {item.max_score}
                      {item.is_total ? " (total)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {teams.length > 0 ? (
            <AppeScoringCard
              teams={teams}
              hasCommentingTeam
              hasJudgesQa
              onSubmit={async () => {
                setMsg("Practice card only. Submit from a live judging round.");
              }}
            />
          ) : null}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
            <h2 className="font-display text-lg font-semibold">Score bands</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {bands.map((b) => (
                <li key={b.title}>
                  <strong>{b.title}</strong>
                  <span className="text-muted"> ({b.body})</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
            <h2 className="font-display text-lg font-semibold">
              Guide to Scoring
            </h2>
            <ul className="mt-2 space-y-3 text-sm text-muted">
              {guides.map((g) => (
                <li key={g.title}>
                  <strong className="text-ink">{g.title}</strong>
                  <p className="mt-1">{g.body}</p>
                </li>
              ))}
            </ul>
          </section>
          {isTech ? (
            <button
              type="button"
              className="h-[38px] rounded-[10px] border border-mist bg-white px-3 text-sm font-semibold"
              onClick={() => void propose()}
            >
              Simulate newer Drive sheet
            </button>
          ) : null}
        </aside>
      </div>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      <Link href="/practice" className="text-sm underline">
        Back to practice
      </Link>
    </main>
  );
}
