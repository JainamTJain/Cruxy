"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DisplaySettings } from "@/components/access/display-settings";
import { StatusPill } from "@/components/access/status-pill";
import { PageIntro } from "@/components/page-intro";
import { Button } from "@/components/ui/button";
import { Keypad } from "@/components/keypad";
import { LearningProfileForm } from "@/components/learning-profile-form";
import { AlertSettings } from "@/components/notify/alert-settings";
import { VoiceEnrollment } from "@/components/voice-enrollment";
import { SAMPLE_MEMBER_STARTER } from "@/lib/constants";
import { validatePersonalPasscode } from "@/lib/auth/passcode-shape";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [digestOptIn, setDigestOptIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hideFloat, setHideFloat] = useState(false);
  const [recordingOk, setRecordingOk] = useState(true);
  const [reRecord, setReRecord] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [socraticOutcomes, setSocraticOutcomes] = useState<
    {
      id: string;
      attempt_kind?: string | null;
      score_delta: number | null;
      note: string | null;
      created_at: string;
    }[]
  >([]);
  const [socraticWeekLine, setSocraticWeekLine] = useState<string | null>(null);

  const [passStep, setPassStep] = useState<"idle" | "current" | "next" | "confirm">(
    "idle",
  );
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [nextCode, setNextCode] = useState<string | null>(null);
  const [devices, setDevices] = useState<
    {
      id: string;
      label: string;
      lastSeenAt: string;
      current: boolean;
    }[]
  >([]);
  const [deviceMsg, setDeviceMsg] = useState<string | null>(null);

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
            recording_ok?: boolean;
          };
        }) => {
          setEmail(d.person?.email ?? "");
          setOptIn(Boolean(d.person?.email_reminders_opt_in));
          setDigestOptIn(Boolean(d.person?.digest_opt_in));
          setRecordingOk(d.person?.recording_ok !== false);
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
    void fetch("/api/cruxy/socratic-outcomes")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          outcomes?: {
            id: string;
            attempt_kind?: string | null;
            score_delta: number | null;
            note: string | null;
            created_at: string;
          }[];
          week?: { lines?: string[] };
        } | null) => {
          if (!d) return;
          setSocraticOutcomes(d.outcomes ?? []);
          setSocraticWeekLine(d.week?.lines?.[0] ?? null);
        },
      )
      .catch(() => undefined);
    void loadDevices();
  }, []);

  async function loadDevices() {
    const res = await fetch("/api/settings/devices");
    if (!res.ok) return;
    const d = (await res.json()) as {
      devices?: {
        id: string;
        label: string;
        lastSeenAt: string;
        current: boolean;
      }[];
    };
    setDevices(d.devices ?? []);
  }

  async function revokeOthers() {
    setDeviceMsg(null);
    const res = await fetch("/api/settings/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke_others" }),
    });
    const j = (await res.json()) as { error?: string; message?: string };
    setDeviceMsg(j.message ?? j.error ?? null);
    await loadDevices();
  }

  async function revokeOne(deviceId: string) {
    setDeviceMsg(null);
    const res = await fetch("/api/settings/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke_one", deviceId }),
    });
    const j = (await res.json()) as { error?: string; message?: string };
    setDeviceMsg(j.message ?? j.error ?? null);
    await loadDevices();
  }

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
    if (res.ok) {
      window.dispatchEvent(
        new CustomEvent("cruxy-prefs", {
          detail: { hide_floating_cruxy: hideFloat },
        }),
      );
    }
    setMsg(res.ok ? "Cruxy preference saved." : "Could not save Cruxy preference.");
  }

  async function saveConsent(next: boolean) {
    const res = await fetch("/api/auth/consent-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordingOk: next, deleteVoice: !next }),
    });
    if (res.ok) {
      setRecordingOk(next);
      setReRecord(false);
      setMsg(
        next
          ? "Consent updated. You can be recorded in practice."
          : "Consent withdrawn. Voice sample deleted. Text only from now on.",
      );
    } else {
      setMsg("Could not update consent.");
    }
  }

  async function saveVoiceSample(voice: Blob) {
    setVoiceBusy(true);
    setMsg(null);
    const form = new FormData();
    form.set("recordingOk", "true");
    const ext = voice.type.includes("mp4") ? "mp4" : "webm";
    form.set("voice", voice, `sample.${ext}`);
    const res = await fetch("/api/auth/consent-update", {
      method: "POST",
      body: form,
    });
    setVoiceBusy(false);
    if (res.ok) {
      setRecordingOk(true);
      setReRecord(false);
      setMsg("Voice sample updated.");
    } else {
      setMsg("Could not save the new voice sample.");
    }
  }

  async function onPasscodeDigit(code: string) {
    setMsg(null);
    if (passStep === "current") {
      setCurrentCode(code);
      setPassStep("next");
      return;
    }
    if (passStep === "next") {
      const bad = validatePersonalPasscode(code, SAMPLE_MEMBER_STARTER);
      if (bad) {
        setMsg(bad);
        return;
      }
      setNextCode(code);
      setPassStep("confirm");
      return;
    }
    if (passStep === "confirm" && currentCode && nextCode) {
      const res = await fetch("/api/auth/change-passcode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current: currentCode,
          next: nextCode,
          confirm: code,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Could not change passcode.");
        setPassStep("idle");
        setCurrentCode(null);
        setNextCode(null);
        return;
      }
      setMsg("Passcode changed.");
      setPassStep("idle");
      setCurrentCode(null);
      setNextCode(null);
    }
  }

  return (
    <div className="animate-fade-up max-w-lg space-y-6">
      <PageIntro title="Settings">
        Reminders, display, consent, passcode and Cruxy. Change what helps you
        read and move through Crux.
      </PageIntro>
      <p className="text-sm text-muted">
        <Link href="/practice/calibration" className="underline">
          Your score prediction trend
        </Link>{" "}
        stays private to you.{" "}
        <Link href="/settings/privacy" className="underline">
          Privacy centre
        </Link>
        : what Crux stores about you, with download and delete.
      </p>

      <div className="border-t border-ink/10 pt-4">
        <DisplaySettings />
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

      <AlertSettings />

      <div
        id="my-profile"
        className="scroll-mt-20 space-y-5 border-t border-ink/10 pt-4"
      >
        <div>
          <h2 className="font-display text-lg font-semibold">My profile</h2>
          <p className="mt-1 text-sm text-muted">
            Voice, how Cruxy helps you, and consent. Changes apply right away.
          </p>
        </div>

        <section className="rounded-2xl border border-ink/10 bg-white p-4">
          <h3 className="m-0 text-sm font-semibold">Re-record my voice</h3>
          <p className="mt-1 text-xs text-muted">
            Guided enrollment. The old sample is replaced only after the new
            one passes.
          </p>
          {!recordingOk ? (
            <p className="mt-2 text-sm text-muted">
              Turn on recording consent below first, then re-record.
            </p>
          ) : (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReRecord((v) => !v)}
              >
                {reRecord ? "Hide enrollment" : "Re-record my voice"}
              </Button>
              {reRecord ? (
                <div className="mt-4">
                  <VoiceEnrollment
                    busy={voiceBusy}
                    onDone={(blob) => void saveVoiceSample(blob)}
                    onCancelTextOnly={() => {
                      setReRecord(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white p-4">
          <h3 className="m-0 text-sm font-semibold">
            Change how Cruxy helps me
          </h3>
          <div className="mt-3">
            <LearningProfileForm embedded />
          </div>
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white p-4">
          <h3 className="m-0 text-sm font-semibold">Change consent</h3>
          <p className="mt-1 text-sm text-muted">
            {recordingOk
              ? "You agreed to be recorded in practice."
              : "Text only. You will not be recorded."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={recordingOk ? "default" : "outline"}
              onClick={() => void saveConsent(true)}
            >
              I agree to be recorded in practice
            </Button>
            <Button
              type="button"
              variant={!recordingOk ? "default" : "outline"}
              onClick={() => void saveConsent(false)}
            >
              Not now: text only
            </Button>
          </div>
        </section>
      </div>

      <div className="border-t border-ink/10 pt-4">
        <h2 className="font-display text-lg font-semibold">Signed-in devices</h2>
        <p className="mt-1 text-sm text-muted">
          Browsers where you are signed in. Sign out others if you used a shared
          computer.
        </p>
        {devices.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No device list yet. Sign out and back in after the update.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {d.label}
                    {d.current ? (
                      <span className="ml-2 text-xs text-muted">This device</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    Last seen {new Date(d.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {!d.current ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-cardinal underline"
                    onClick={() => void revokeOne(d.id)}
                  >
                    Sign out
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void revokeOthers()}
        >
          Sign out of other devices
        </Button>
        {deviceMsg ? (
          <p className="mt-2 text-sm text-muted">{deviceMsg}</p>
        ) : null}
      </div>

      <div className="border-t border-ink/10 pt-4">
        <h2 className="font-display text-lg font-semibold">Passcode</h2>
        <p className="mt-1 text-sm text-muted">
          Enter your current passcode, then choose a new one twice.
        </p>
        {passStep === "idle" ? (
          <Button className="mt-3" variant="outline" onClick={() => setPassStep("current")}>
            Change passcode
          </Button>
        ) : (
          <div className="mt-3 max-w-sm rounded-2xl bg-[#E8F5F1] p-4">
            <p className="mb-3 text-sm font-semibold">
              {passStep === "current"
                ? "Current passcode"
                : passStep === "next"
                  ? "New passcode"
                  : "Type the new one again"}
            </p>
            <Keypad onSubmit={(c) => void onPasscodeDigit(c)} />
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => {
                setPassStep("idle");
                setCurrentCode(null);
                setNextCode(null);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-ink/10 pt-4">
        <h2 className="font-display text-lg font-semibold">
          Socratic outcomes
        </h2>
        <p className="mt-1 text-sm text-muted">
          After a Socratic drill with Cruxy, we check whether your next try on
          that claim improved (drill, flashcard or round score). Compared only
          with your own past.
        </p>
        {socraticWeekLine ? (
          <p className="mt-2 text-sm">{socraticWeekLine}</p>
        ) : null}
        {socraticOutcomes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No outcomes yet. Finish a Socratic drill, then answer a question,
            review a card or redo a round item on that case.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {socraticOutcomes.slice(0, 12).map((o) => {
              const improved = (o.score_delta ?? 0) > 0.01;
              return (
                <li
                  key={o.id}
                  className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-sm"
                >
                  <StatusPill
                    tone={improved ? "ok" : "neutral"}
                    label={improved ? "Improved" : "No lift"}
                  />
                  {o.attempt_kind ? (
                    <span className="ml-2 text-muted">on {o.attempt_kind}</span>
                  ) : null}
                  {o.score_delta != null ? (
                    <span className="ml-2 font-mono text-xs text-muted">
                      {o.score_delta > 0 ? "+" : ""}
                      {o.score_delta.toFixed(2)}
                    </span>
                  ) : null}
                  {o.note ? (
                    <p className="mt-1 text-xs text-muted">{o.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
      {msg ? (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
