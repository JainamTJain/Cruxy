"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/page-intro";
import { VoiceEnrollment } from "@/components/voice-enrollment";

type Item = {
  key: string;
  label: string;
  stored: string;
  whoSees: string;
  present: boolean;
};

export default function PrivacyCentrePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [recordingOk, setRecordingOk] = useState(true);
  const [reRecord, setReRecord] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const [inv, me] = await Promise.all([
      fetch("/api/privacy/inventory").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ]);
    setItems((inv as { items?: Item[] }).items ?? []);
    setRecordingOk(
      (me as { person?: { recording_ok?: boolean } }).person
        ?.recording_ok !== false,
    );
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function download() {
    const res = await fetch("/api/privacy/export");
    if (!res.ok) {
      setMsg("Could not download.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ??
      "crux-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Download started.");
  }

  async function deleteReflections() {
    if (
      !window.confirm(
        "Delete all of your round reflections? This cannot be undone.",
      )
    ) {
      return;
    }
    const res = await fetch("/api/privacy/reflections", { method: "DELETE" });
    const data = (await res.json()) as { count?: number; error?: string };
    if (!res.ok) {
      setMsg(data.error ?? "Could not delete.");
      return;
    }
    setMsg(`Deleted ${data.count ?? 0} reflections.`);
    await refresh();
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
      await refresh();
    } else {
      setMsg("Could not update consent.");
    }
  }

  async function saveVoiceSample(voice: Blob) {
    setVoiceBusy(true);
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
      await refresh();
    } else {
      setMsg("Could not save the voice sample.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <div>
        <Link href="/settings" className="text-sm text-muted underline">
          Settings
        </Link>
        <PageIntro title="Privacy centre">
          What Crux stores about you, who can see it, and how to download or
          delete.
        </PageIntro>
      </div>

      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">
          What we store
        </h2>
        <ul className="mt-4 list-none space-y-4 p-0">
          {items.map((item) => (
            <li key={item.key} className="border-t border-line pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-muted">
                  {item.present ? "On file" : "Not set yet"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{item.stored}</p>
              <p className="mt-1 text-sm">{item.whoSees}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-xl font-extrabold">Your controls</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Button type="button" onClick={() => void download()}>
            Download my data
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void deleteReflections()}
          >
            Delete my reflections
          </Button>
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
            Not now: text only (deletes voice sample)
          </Button>
          {recordingOk ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setReRecord((v) => !v)}
            >
              {reRecord ? "Hide re-record" : "Re-record voice sample"}
            </Button>
          ) : null}
        </div>
        {reRecord ? (
          <div className="mt-4">
            <VoiceEnrollment
              busy={voiceBusy}
              onDone={(blob) => void saveVoiceSample(blob)}
              onCancelTextOnly={() => {
                setReRecord(false);
                void saveConsent(false);
              }}
            />
          </div>
        ) : null}
      </section>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
    </main>
  );
}
