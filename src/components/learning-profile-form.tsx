"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { APPE_SCORE_ITEMS, type AppeItemKey } from "@/lib/practice/types";
import {
  DEFAULT_APPE_BASELINE,
  DEFAULT_SLIDER,
  LEARNING_SLIDER_META,
  type AppeBaselines,
  type LearningSliderKey,
  type LearningSliders,
} from "@/lib/learning/types";

type Props = {
  /** When true, show first-run framing. */
  firstRun?: boolean;
  onSaved?: () => void;
  busy?: boolean;
};

function emptySliders(): LearningSliders {
  return {
    visual_verbal: DEFAULT_SLIDER,
    analogies_formal: DEFAULT_SLIDER,
    ethical_mechanization: DEFAULT_SLIDER,
    short_deep: DEFAULT_SLIDER,
    direct_gentle: DEFAULT_SLIDER,
  };
}

function emptyBaselines(): Record<AppeItemKey, number> {
  const out = {} as Record<AppeItemKey, number>;
  for (const i of APPE_SCORE_ITEMS) out[i.key] = DEFAULT_APPE_BASELINE;
  return out;
}

/**
 * Shared learning-profile editor for first run and Settings.
 */
export function LearningProfileForm({ firstRun, onSaved, busy }: Props) {
  const [sliders, setSliders] = useState<LearningSliders>(emptySliders);
  const [baselines, setBaselines] =
    useState<Record<AppeItemKey, number>>(emptyBaselines);
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
            visual_verbal: number;
            analogies_formal: number;
            ethical_mechanization: number;
            short_deep: number;
            direct_gentle: number;
            appe_baselines: AppeBaselines;
          } | null;
          defaults?: boolean;
        } | null) => {
          if (d?.profile) {
            setSliders({
              visual_verbal: d.profile.visual_verbal,
              analogies_formal: d.profile.analogies_formal,
              ethical_mechanization: d.profile.ethical_mechanization,
              short_deep: d.profile.short_deep,
              direct_gentle: d.profile.direct_gentle,
            });
            setBaselines({
              ...emptyBaselines(),
              ...d.profile.appe_baselines,
            });
          }
          setLoaded(true);
        },
      )
      .catch(() => setLoaded(true));
  }, []);

  function setSlider(key: LearningSliderKey, value: number) {
    setSliders((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    const res = await fetch("/api/learning-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sliders, appeBaselines: baselines }),
    });
    const data = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save profile.");
      return;
    }
    setMsg("Learning profile saved.");
    onSaved?.();
  }

  if (!loaded) {
    return <p className="text-sm text-muted">Loading profile…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {firstRun ? (
        <p className="m-0 text-sm text-muted">
          Tell Cruxy how you learn. You can change this any time in Settings.
          Defaults sit in the middle of each scale.
        </p>
      ) : (
        <p className="m-0 text-sm text-muted">
          Cruxy uses this on every answer, drill, flashcard and explanation.
          Only you, Dr. B and Jainam can see it.
        </p>
      )}

      <section className="flex flex-col gap-5">
        <h3 className="m-0 font-display text-lg font-extrabold">How you learn</h3>
        {LEARNING_SLIDER_META.map((m) => (
          <label key={m.key} className="flex flex-col gap-1.5 text-sm">
            <span className="flex justify-between gap-2 font-medium">
              <span>{m.left}</span>
              <span className="font-mono text-xs text-muted">{sliders[m.key]}</span>
              <span>{m.right}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={sliders[m.key]}
              onChange={(e) => setSlider(m.key, Number(e.target.value))}
              className="w-full"
              aria-label={`${m.left} versus ${m.right}`}
            />
            <span className="text-xs text-muted">{m.help}</span>
          </label>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h3 className="m-0 font-display text-lg font-extrabold">
            Your APPE baselines
          </h3>
          <p className="mt-1 text-xs text-muted">
            Rate yourself 1 to 10 on each scoring card item. Later we compare
            these with real judge cards, only against your own past.
          </p>
        </div>
        {APPE_SCORE_ITEMS.map((item) => (
          <label key={item.key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{item.label}</span>
            <span className="text-xs text-muted">{item.question}</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                value={baselines[item.key]}
                onChange={(e) =>
                  setBaselines((p) => ({
                    ...p,
                    [item.key]: Number(e.target.value),
                  }))
                }
                className="w-full"
                aria-label={`${item.label} baseline`}
              />
              <span className="w-6 font-mono text-xs">{baselines[item.key]}</span>
            </div>
          </label>
        ))}
      </section>

      <Button
        type="button"
        disabled={busy || saving}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : firstRun ? "Save and continue" : "Save learning profile"}
      </Button>
      {msg ? <p className="m-0 text-sm text-[#0F7B6C]">{msg}</p> : null}
      {error ? <p className="m-0 text-sm text-cardinal">{error}</p> : null}
    </div>
  );
}
