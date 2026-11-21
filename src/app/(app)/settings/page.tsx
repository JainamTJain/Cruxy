"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [digestOptIn, setDigestOptIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hideFloat, setHideFloat] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then(
        (d: {
          session?: { role?: string };
          person?: {
            email?: string | null;
            email_reminders_opt_in?: boolean;
            digest_opt_in?: boolean;
            role?: string;
          };
        }) => {
          setEmail(d.person?.email ?? "");
          setOptIn(Boolean(d.person?.email_reminders_opt_in));
          setDigestOptIn(Boolean(d.person?.digest_opt_in));
          const role = d.person?.role ?? d.session?.role;
          setIsAdmin(role === "tech_admin" || role === "coach_admin");
        },
      );
    void fetch("/api/prefs/cruxy")
      .then((r) => r.json())
      .then((d: { prefs?: { hide_floating_cruxy?: boolean } }) => {
        setHideFloat(Boolean(d.prefs?.hide_floating_cruxy));
      })
      .catch(() => undefined);
  }, []);

  async function saveReminders() {
    const res = await fetch("/api/settings/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        emailRemindersOptIn: optIn,
        digestOptIn: isAdmin ? digestOptIn : undefined,
      }),
    });
    setMsg(res.ok ? "Saved. Email only sends if you opted in." : "Could not save.");
  }

  async function saveCruxy() {
    const res = await fetch("/api/prefs/cruxy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hide_floating_cruxy: hideFloat }),
    });
    setMsg(res.ok ? "Cruxy preference saved." : "Could not save Cruxy preference.");
  }

  return (
    <main className="animate-fade-up max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Reminders stay in-app by default. Email only if you add an address and
          opt in.
        </p>
      </div>
      <label className="block text-sm">
        Email
        <input
          className="mt-1 w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="optional"
          type="email"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
        />
        Email reminders (opt in)
      </label>
      {isAdmin ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={digestOptIn}
            onChange={(e) => setDigestOptIn(e.target.checked)}
          />
          Weekly summary email (admins)
        </label>
      ) : null}
      <Button onClick={() => void saveReminders()}>Save reminders</Button>

      <div className="border-t border-ink/10 pt-4">
        <h2 className="font-display text-lg font-semibold">Cruxy</h2>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideFloat}
            onChange={(e) => setHideFloat(e.target.checked)}
          />
          Hide floating Cruxy (lamp stays)
        </label>
        <Button className="mt-3" variant="outline" onClick={() => void saveCruxy()}>
          Save Cruxy
        </Button>
      </div>
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
    </main>
  );
}
