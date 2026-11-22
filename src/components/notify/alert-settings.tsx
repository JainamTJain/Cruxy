"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  KIND_LABELS,
  NOTIFY_KINDS,
  type EmailChannel,
  type NotifyKindsSettings,
} from "@/lib/notify/kinds";
import {
  formatQuietMinutes,
  parseQuietTime,
} from "@/lib/notify/quiet-hours";

type Settings = {
  push_enabled: boolean;
  kinds: NotifyKindsSettings;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Wave 9 J: per-kind push/email, quiet hours, Turn on alerts. */
export function AlertSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/notifications/settings");
    if (!res.ok) return;
    const data = (await res.json()) as {
      settings: Settings;
      pushAvailable: boolean;
    };
    setSettings(data.settings);
    setPushAvailable(data.pushAvailable);
    setQuietStart(formatQuietMinutes(data.settings.quiet_hours_start));
    setQuietEnd(formatQuietMinutes(data.settings.quiet_hours_end));
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(next: Partial<Settings> & {
    quiet_hours_start?: number | null;
    quiet_hours_end?: number | null;
  }) {
    setBusy(true);
    const res = await fetch("/api/notifications/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg("Could not save.");
      return;
    }
    const data = (await res.json()) as { settings: Settings };
    setSettings(data.settings);
    setMsg("Saved.");
  }

  async function turnOnAlerts() {
    if (!pushAvailable) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setMsg("This browser cannot show alerts.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg("Permission was not granted. You can try again later.");
        setBusy(false);
        return;
      }
      const keyRes = await fetch("/api/notifications/push");
      const keyData = (await keyRes.json()) as {
        publicKey?: string | null;
        configured?: boolean;
      };
      if (!keyData.publicKey) {
        setMsg("Alerts are not set up yet.");
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });
      const json = sub.toJSON();
      const saveRes = await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      if (!saveRes.ok) {
        setMsg("Could not turn on alerts.");
      } else {
        setMsg("Alerts are on for this device.");
        void load();
      }
    } catch {
      setMsg("Could not turn on alerts.");
    }
    setBusy(false);
  }

  async function turnOffAlerts() {
    setBusy(true);
    let endpoint: string | undefined;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = await reg?.pushManager.getSubscription();
      endpoint = sub?.endpoint;
      await sub?.unsubscribe();
    } catch {
      // ignore
    }
    await fetch("/api/notifications/push", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    setMsg("Alerts are off on this device.");
    void load();
    setBusy(false);
  }

  if (!settings) {
    return <p className="text-sm text-muted">Loading alert settings…</p>;
  }

  return (
    <section id="alerts" className="space-y-5 rounded-2xl bg-white p-5">
      <div>
        <h2 className="font-display text-xl font-extrabold">Alerts</h2>
        <p className="mt-1 text-sm text-muted">
          Choose what reaches your phone or email. Mentions can wait in a daily
          digest. Quiet hours pause pushes and instant email.
        </p>
      </div>

      {pushAvailable ? (
        <div className="flex flex-wrap items-center gap-3">
          {settings.push_enabled ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => void turnOffAlerts()}
            >
              Turn off alerts on this device
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 bg-gold font-bold text-ink hover:bg-gold/90"
              disabled={busy}
              onClick={() => void turnOnAlerts()}
            >
              Turn on alerts
            </Button>
          )}
          <p className="text-xs text-muted">
            We only ask for permission after you tap the button.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Phone alerts will appear here once Jainam adds the push keys.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-3 font-semibold">Kind</th>
              <th className="pb-2 pr-3 font-semibold">Push</th>
              <th className="pb-2 font-semibold">Email</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFY_KINDS.map((kind) => (
              <tr key={kind} className="border-t border-mist">
                <td className="py-3 pr-3 font-medium">{KIND_LABELS[kind]}</td>
                <td className="py-3 pr-3">
                  <input
                    type="checkbox"
                    checked={settings.kinds[kind].push}
                    aria-label={`${KIND_LABELS[kind]} push`}
                    onChange={(e) => {
                      const kinds = {
                        ...settings.kinds,
                        [kind]: {
                          ...settings.kinds[kind],
                          push: e.target.checked,
                        },
                      };
                      void save({ kinds });
                    }}
                  />
                </td>
                <td className="py-3">
                  <select
                    className="h-10 rounded-lg border border-mist bg-paper px-2"
                    value={settings.kinds[kind].email}
                    aria-label={`${KIND_LABELS[kind]} email`}
                    onChange={(e) => {
                      const email = e.target.value as EmailChannel;
                      const kinds = {
                        ...settings.kinds,
                        [kind]: { ...settings.kinds[kind], email },
                      };
                      void save({ kinds });
                    }}
                  >
                    <option value="off">Off</option>
                    <option value="instant">Instant</option>
                    <option value="digest">Daily digest</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Quiet hours</p>
        <p className="text-xs text-muted">
          Local time on this device. Leave blank to turn quiet hours off.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            From
            <input
              type="time"
              className="mt-1 block h-10 rounded-lg border border-mist px-2"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
            />
          </label>
          <label className="text-sm">
            To
            <input
              type="time"
              className="mt-1 block h-10 rounded-lg border border-mist px-2"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={busy}
            onClick={() =>
              void save({
                quiet_hours_start: parseQuietTime(quietStart),
                quiet_hours_end: parseQuietTime(quietEnd),
              })
            }
          >
            Save quiet hours
          </Button>
        </div>
      </div>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
    </section>
  );
}
