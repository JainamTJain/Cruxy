"use client";

import { useState } from "react";
import { useAccessPrefs } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import {
  TEXT_SIZE_STEPS,
  type ReduceMotionMode,
  type TextSizeStep,
} from "@/lib/access/types";

const SIZE_LABEL: Record<TextSizeStep, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra large",
};

const MOTION_LABEL: Record<ReduceMotionMode, string> = {
  system: "Match my device",
  on: "Reduce motion",
  off: "Allow motion",
};

/** Display controls for Settings and the user menu. */
export function DisplaySettings({ compact = false }: { compact?: boolean }) {
  const { prefs, setPrefsLocal, savePrefs } = useAccessPrefs();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function persist(partial: Partial<typeof prefs>) {
    setPrefsLocal(partial);
    setBusy(true);
    const ok = await savePrefs(partial);
    setBusy(false);
    setMsg(
      ok
        ? "Display settings saved for your account."
        : "Saved on this device. Sign in again later to sync to your account.",
    );
  }

  return (
    <section
      className={compact ? "space-y-3" : "space-y-4"}
      aria-labelledby="display-settings-heading"
    >
      <div>
        <h2
          id="display-settings-heading"
          className="font-display text-lg font-semibold"
        >
          Display and motion
        </h2>
        {!compact ? (
          <p className="mt-1 text-sm text-muted">
            Make text easier to read, raise contrast, pick a clearer font, and
            control motion. Defaults follow your device. Saved for you alone.
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Text size</legend>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Text size"
        >
          {TEXT_SIZE_STEPS.map((step) => {
            const selected = prefs.text_size === step;
            return (
              <button
                key={step}
                type="button"
                role="radio"
                aria-checked={selected}
                className={
                  selected
                    ? "min-h-11 rounded-xl bg-cardinal px-3 py-2 text-sm font-semibold text-white"
                    : "min-h-11 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
                }
                onClick={() => void persist({ text_size: step })}
              >
                {SIZE_LABEL[step]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={prefs.high_contrast}
          onChange={(e) => void persist({ high_contrast: e.target.checked })}
        />
        <span>
          <span className="font-semibold">High contrast</span>
          <span className="block text-muted">
            Darker text and stronger borders for low vision.
          </span>
        </span>
      </label>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={prefs.readable_font}
          onChange={(e) => void persist({ readable_font: e.target.checked })}
        />
        <span>
          <span className="font-semibold">Readable font</span>
          <span className="block text-muted">
            A clearer typeface that helps many people with dyslexia.
          </span>
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Motion</legend>
        <p className="text-sm text-muted">
          Includes the Genie bob and other animations. Match my device follows
          your system setting.
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Motion preference"
        >
          {(["system", "on", "off"] as ReduceMotionMode[]).map((mode) => {
            const selected = prefs.reduce_motion === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                className={
                  selected
                    ? "min-h-11 rounded-xl bg-cardinal px-3 py-2 text-sm font-semibold text-white"
                    : "min-h-11 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
                }
                onClick={() => void persist({ reduce_motion: mode })}
              >
                {MOTION_LABEL[mode]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {msg ? (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {msg}
        </p>
      ) : null}
      {busy ? (
        <p className="sr-only" role="status">
          Saving display settings
        </p>
      ) : null}
      {!compact ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void persist({
              text_size: "md",
              high_contrast: false,
              readable_font: false,
              reduce_motion: "system",
            })
          }
        >
          Reset to defaults
        </Button>
      ) : null}
    </section>
  );
}
