"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DAILY_MINUTES_OPTIONS,
  DEFAULT_DAILY_MINUTES,
  EXPLANATION_SAMPLES,
  FEEDBACK_SAMPLES,
  FOCUS_AREA_OPTIONS,
  type DailyMinutes,
  type ExplanationStyle,
  type FeedbackTone,
  type FocusArea,
  type LearnedPrefs,
} from "@/lib/learning/types";
import { cn } from "@/lib/utils";

type Props = {
  /** When true, show first-run framing and Skip. */
  firstRun?: boolean;
  onSaved?: () => void;
  busy?: boolean;
  /** Compact embed under Settings My profile. */
  embedded?: boolean;
};

/**
 * Four concrete choices (~30 seconds). Skippable on first run.
 */
export function LearningProfileForm({
  firstRun,
  onSaved,
  busy,
  embedded,
}: Props) {
  const [dailyMinutes, setDailyMinutes] = useState<DailyMinutes>(
    DEFAULT_DAILY_MINUTES,
  );
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [explanationStyle, setExplanationStyle] =
    useState<ExplanationStyle>("example_first");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("gentle");
  const [learned, setLearned] = useState<LearnedPrefs>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/learning-profile")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          profile?: {
            daily_minutes: DailyMinutes | null;
            focus_areas: FocusArea[];
            explanation_style: ExplanationStyle | null;
            feedback_tone: FeedbackTone | null;
            learned_prefs?: LearnedPrefs;
          } | null;
        } | null) => {
          if (d?.profile) {
            if (d.profile.daily_minutes) {
              setDailyMinutes(d.profile.daily_minutes);
            }
            setFocusAreas(d.profile.focus_areas ?? []);
            if (d.profile.explanation_style) {
              setExplanationStyle(d.profile.explanation_style);
            }
            if (d.profile.feedback_tone) {
              setFeedbackTone(d.profile.feedback_tone);
            }
            setLearned(d.profile.learned_prefs ?? {});
          }
          setLoaded(true);
        },
      )
      .catch(() => setLoaded(true));
  }, []);

  function toggleFocus(area: FocusArea) {
    setFocusAreas((prev) => {
      if (prev.includes(area)) return prev.filter((a) => a !== area);
      if (prev.length >= 2) return [prev[1]!, area];
      return [...prev, area];
    });
  }

  async function save(opts?: { skip?: boolean }) {
    setSaving(true);
    setError(null);
    setMsg(null);
    const res = await fetch("/api/learning-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        opts?.skip
          ? { skip: true }
          : {
              dailyMinutes,
              focusAreas,
              explanationStyle,
              feedbackTone,
            },
      ),
    });
    const data = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    setMsg(opts?.skip ? "Skipped for now. You can change this in Settings." : "Saved.");
    onSaved?.();
  }

  async function resetLearned() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/learning-profile/reset-learned", {
      method: "POST",
    });
    setSaving(false);
    if (!res.ok) {
      setError("Could not reset.");
      return;
    }
    setLearned({});
    setMsg("Cleared what Cruxy learned from chips.");
  }

  if (!loaded) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const learnedBits: string[] = [];
  if (learned.prefer_shorter) learnedBits.push("shorter answers");
  if (learned.prefer_example) learnedBits.push("examples first");
  if (learned.prefer_more_detail) learnedBits.push("more detail");

  return (
    <div className={cn("flex flex-col gap-5", embedded && "gap-4")}>
      {firstRun ? (
        <p className="m-0 text-sm text-muted">
          Four quick choices. About 30 seconds. Skip anytime; change later in
          Settings.
        </p>
      ) : (
        <p className="m-0 text-sm text-muted">
          This sizes Today and the roadmap, and shapes how Cruxy answers. Only
          you, Dr. B and Jainam see it.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="m-0 font-display text-lg font-extrabold">Time</h3>
        <p className="m-0 text-xs text-muted">
          On a normal weekday until Dec 5, I can give:
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DAILY_MINUTES_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setDailyMinutes(o.value)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm",
                dailyMinutes === o.value
                  ? "border-cardinal bg-cardinal/5 font-semibold"
                  : "border-ink/15 bg-white",
              )}
            >
              <span className="block font-medium">{o.label}</span>
              <span className="mt-1 block text-xs text-muted">{o.help}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 font-display text-lg font-extrabold">Focus</h3>
        <p className="m-0 text-xs text-muted">
          Which part of a round do you most want to improve? Pick up to two.
        </p>
        <div className="flex flex-col gap-2">
          {FOCUS_AREA_OPTIONS.map((o) => {
            const on = focusAreas.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleFocus(o.value)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left text-sm",
                  on
                    ? "border-cardinal bg-cardinal/5 font-semibold"
                    : "border-ink/15 bg-white",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 font-display text-lg font-extrabold">
          Explanations
        </h3>
        <p className="m-0 text-xs text-muted">
          Same short answer two ways. Which helps more?
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXPLANATION_SAMPLES.map((s) => (
            <button
              key={s.style}
              type="button"
              onClick={() => setExplanationStyle(s.style)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm",
                explanationStyle === s.style
                  ? "border-cardinal bg-cardinal/5"
                  : "border-ink/15 bg-white",
              )}
            >
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                {s.label}
              </span>
              <p className="m-0 mt-1 leading-snug">{s.body}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 font-display text-lg font-extrabold">Feedback</h3>
        <p className="m-0 text-xs text-muted">
          Two sample lines. Pick the tone you want from Cruxy.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEEDBACK_SAMPLES.map((s) => (
            <button
              key={s.tone}
              type="button"
              onClick={() => setFeedbackTone(s.tone)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm",
                feedbackTone === s.tone
                  ? "border-cardinal bg-cardinal/5"
                  : "border-ink/15 bg-white",
              )}
            >
              <span className="font-medium">{s.label}</span>
              <p className="m-0 mt-1 leading-snug text-muted">{s.body}</p>
            </button>
          ))}
        </div>
      </section>

      {!firstRun ? (
        <section className="rounded-xl border border-ink/10 bg-paper px-3 py-3">
          <h3 className="m-0 text-sm font-semibold">What Cruxy has learned</h3>
          <p className="mt-1 text-xs text-muted">
            From Shorter, Example and More detail under replies.
          </p>
          <p className="mt-2 text-sm">
            {learnedBits.length
              ? learnedBits.join(", ")
              : "Nothing extra yet."}
          </p>
          {learnedBits.length ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={saving}
              onClick={() => void resetLearned()}
            >
              Reset
            </Button>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || saving}
          onClick={() => void save()}
        >
          {saving
            ? "Saving…"
            : firstRun
              ? "Save and continue"
              : "Save how Cruxy helps me"}
        </Button>
        {firstRun ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy || saving}
            onClick={() => void save({ skip: true })}
          >
            Skip for now
          </Button>
        ) : null}
      </div>
      {msg ? <p className="m-0 text-sm text-[#0F7B6C]">{msg}</p> : null}
      {error ? <p className="m-0 text-sm text-cardinal">{error}</p> : null}
    </div>
  );
}
