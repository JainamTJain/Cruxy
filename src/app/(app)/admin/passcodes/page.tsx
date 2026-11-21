"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Keypad } from "@/components/keypad";
import { REVEAL_SECONDS } from "@/lib/constants";

type Row = {
  id: string;
  name: string;
  team_id: string | null;
  role: string;
  hasPasscode: boolean;
  mustChoose: boolean;
  setAt: string | null;
  lastSignIn: string | null;
};

type Team = { id: string; name: string; colour: string };

export default function PasscodesPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{
    id: string;
    code: string;
    left: number;
  } | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/passcodes");
    if (!res.ok) {
      setError("Tech admin + admin view required.");
      return;
    }
    const data = (await res.json()) as { teams: Team[]; people: Row[] };
    setTeams(data.teams);
    setPeople(data.people);
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

  async function doReveal(personId: string, adminPasscode?: string) {
    setError(null);
    const res = await fetch("/api/admin/passcodes/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId, adminPasscode }),
    });
    const data = (await res.json()) as {
      error?: string;
      needsReauth?: boolean;
      passcode?: string;
      revealSeconds?: number;
    };
    if (res.status === 401 && data.needsReauth) {
      setNeedsReauth(true);
      setPendingRevealId(personId);
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "Reveal failed.");
      return;
    }
    setNeedsReauth(false);
    setPendingRevealId(null);
    setReveal({
      id: personId,
      code: data.passcode!,
      left: data.revealSeconds ?? REVEAL_SECONDS,
    });
    await load();
  }

  async function doReset(personId: string) {
    setError(null);
    setResetCode(null);
    const res = await fetch("/api/admin/passcodes/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId }),
    });
    const data = (await res.json()) as { error?: string; oneTimeCode?: string };
    if (!res.ok) {
      setError(data.error ?? "Reset failed.");
      return;
    }
    setResetCode(data.oneTimeCode ?? null);
    await load();
  }

  function teamName(id: string | null) {
    return teams.find((t) => t.id === id)?.name ?? "Admin";
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
          Only Jainam
        </p>
        <h1 className="font-display text-3xl font-semibold">Passcodes</h1>
        <p className="mt-1 text-sm text-muted">
          First Show in 10 minutes asks for your own passcode. Every Show and
          Reset goes in the activity log. Your own passcode is never listed.
        </p>
      </div>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}
      {resetCode ? (
        <p className="rounded-xl bg-gold/20 px-3 py-2 text-sm">
          One-time code for them (share in person):{" "}
          <span className="font-mono font-semibold">{resetCode}</span>
        </p>
      ) : null}

      {needsReauth ? (
        <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
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
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Person</th>
              <th className="py-2 pr-3">Team</th>
              <th className="py-2 pr-3">Passcode</th>
              <th className="py-2 pr-3">Chosen</th>
              <th className="py-2 pr-3">Last sign in</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b border-ink/5">
                <td className="py-3 pr-3 font-medium">{p.name}</td>
                <td className="py-3 pr-3">{teamName(p.team_id)}</td>
                <td className="py-3 pr-3 font-mono">
                  {reveal?.id === p.id
                    ? `${reveal.code} · hides in ${reveal.left}s`
                    : p.hasPasscode
                      ? "••••••"
                      : p.mustChoose
                        ? "One-time / must choose"
                        : "Hasn't chosen one yet"}
                </td>
                <td className="py-3 pr-3 text-muted">
                  {p.setAt ? new Date(p.setAt).toLocaleDateString() : "·"}
                </td>
                <td className="py-3 pr-3 text-muted">
                  {p.lastSignIn
                    ? new Date(p.lastSignIn).toLocaleString()
                    : "never"}
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!p.hasPasscode}
                      onClick={() => void doReveal(p.id)}
                    >
                      {reveal?.id === p.id ? "Hide" : "Show"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void doReset(p.id)}
                    >
                      Reset
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
