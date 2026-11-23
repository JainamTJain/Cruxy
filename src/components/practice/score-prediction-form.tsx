"use client";

import { useEffect, useState } from "react";
import { CONFIDENCE_OPTIONS, normalizeItemPrediction } from "@/lib/practice/brier";
import {
  APPE_SCORE_ITEMS,
  type AppeItemKey,
  type ItemPrediction,
  type ItemPredictionInput,
  type PredictionConfidence,
} from "@/lib/practice/types";

type Gate = {
  ready: boolean;
  speakers: { id: string; name: string; predicted: boolean }[];
  missing: string[];
  requiredItems: AppeItemKey[];
};

type Props = {
  roundId: string;
  personId: string | null;
  onGateChange?: (ready: boolean) => void;
};

function defaultItem(): ItemPrediction {
  return { score: 5, confidence: 50 };
}

/**
 * Wave 6: every speaker predicts scores + confidence + the question they expect
 * before the round can start.
 */
export function ScorePredictionForm({
  roundId,
  personId,
  onGateChange,
}: Props) {
  const [gate, setGate] = useState<Gate | null>(null);
  const [canPredict, setCanPredict] = useState(false);
  const [scores, setScores] = useState<
    Partial<Record<AppeItemKey, ItemPrediction>>
  >({});
  const [question, setQuestion] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function refresh() {
    try {
      const res = await fetch(`/api/practice/rounds/${roundId}/predictions`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(d.error ?? "Could not load predictions.");
        setGate({
          ready: false,
          speakers: [],
          missing: [],
          requiredItems: APPE_SCORE_ITEMS.map((i) => i.key),
        });
        return;
      }
      const data = (await res.json()) as {
        gate: Gate;
        canPredict?: boolean;
        mine: {
          item_scores: Partial<Record<AppeItemKey, ItemPredictionInput>>;
          expected_question: string;
        } | null;
      };
      setGate(data.gate);
      setCanPredict(Boolean(data.canPredict));
      onGateChange?.(data.gate.ready);
      if (data.mine) {
        const next: Partial<Record<AppeItemKey, ItemPrediction>> = {};
        for (const [k, v] of Object.entries(data.mine.item_scores ?? {})) {
          const n = normalizeItemPrediction(v as ItemPredictionInput);
          if (n) next[k as AppeItemKey] = n;
        }
        setScores(next);
        setQuestion(data.mine.expected_question ?? "");
        setSaved(true);
      }
    } catch {
      setMsg("Could not load predictions.");
      setGate({
        ready: false,
        speakers: [],
        missing: [],
        requiredItems: APPE_SCORE_ITEMS.map((i) => i.key),
      });
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const myDone = Boolean(
    saved ||
      (personId && gate?.speakers.find((s) => s.id === personId)?.predicted),
  );
  const iAmSpeaker = canPredict;

  function setScore(key: AppeItemKey, score: number) {
    setScores((p) => ({
      ...p,
      [key]: { ...(p[key] ?? defaultItem()), score },
    }));
  }

  function setConfidence(key: AppeItemKey, confidence: PredictionConfidence) {
    setScores((p) => ({
      ...p,
      [key]: { ...(p[key] ?? defaultItem()), confidence },
    }));
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/practice/rounds/${roundId}/predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemScores: scores,
        expectedQuestion: question,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Could not save");
      return;
    }
    setSaved(true);
    setGate(data.gate);
    onGateChange?.(Boolean(data.gate?.ready));
    setMsg("Prediction saved.");
  }

  if (!gate) {
    return (
      <div className="space-y-2">
        <p className="m-0 text-sm text-[#8C929D]">Loading predictions…</p>
        {msg ? (
          <p className="m-0 text-sm text-[#E8A0A8]" role="alert">
            {msg}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-[#262934] bg-[#16181F] p-5 text-[#F2F3F5]">
      <h2 className="m-0 text-base font-bold">Predict your scores</h2>
      <p className="m-0 text-sm text-[#8C929D]">
        Required before the round starts. Say how sure you are on each item.
        Compared only with your own past after judging.
      </p>

      <ul className="m-0 list-none space-y-1 p-0 text-sm">
        {gate.speakers.map((s) => (
          <li key={s.id} className="flex justify-between gap-2">
            <span>{s.name}</span>
            <span className={s.predicted ? "text-[#6EE7B7]" : "text-[#E8C36A]"}>
              {s.predicted ? "Predicted" : "Waiting"}
            </span>
          </li>
        ))}
      </ul>

      {iAmSpeaker && !myDone ? (
        <div className="flex flex-col gap-4 border-t border-[#262934] pt-3">
          {(gate.requiredItems.length
            ? gate.requiredItems
            : APPE_SCORE_ITEMS.map((i) => i.key)
          ).map((key) => {
            const meta = APPE_SCORE_ITEMS.find((i) => i.key === key);
            if (!meta) return null;
            const row = scores[key] ?? defaultItem();
            return (
              <div key={key} className="flex flex-col gap-2 text-sm">
                <span className="font-medium">{meta.label}</span>
                <span className="text-xs text-[#8C929D]">{meta.question}</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={row.score}
                    onChange={(e) => setScore(key, Number(e.target.value))}
                    className="w-full"
                    aria-label={`${meta.label} score`}
                  />
                  <span className="w-6 font-mono text-xs">{row.score}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[#8C929D]">
                    How sure are you?
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CONFIDENCE_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setConfidence(key, c)}
                        className={
                          row.confidence === c
                            ? "min-h-11 rounded-lg bg-[#F2F3F5] text-xs font-semibold text-[#0C0D11]"
                            : "min-h-11 rounded-lg border border-[#3B404A] text-xs font-semibold text-[#C9CCD3]"
                        }
                      >
                        {c}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Question you expect</span>
            <textarea
              className="min-h-[72px] rounded-xl border border-[#3B404A] bg-[#0C0D11] p-3 text-sm text-[#F2F3F5]"
              placeholder="What judge question do you think you will get?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="h-11 rounded-xl bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11]"
          >
            {busy ? "Saving…" : "Lock my prediction"}
          </button>
        </div>
      ) : null}

      {iAmSpeaker && myDone ? (
        <p className="m-0 text-sm text-[#6EE7B7]">Your prediction is locked.</p>
      ) : null}

      {!gate.ready ? (
        <p className="m-0 text-sm text-[#E8C36A]">
          Round waits for: {gate.missing.join(", ") || "speakers"}
        </p>
      ) : (
        <p className="m-0 text-sm text-[#6EE7B7]">
          Everyone predicted. Ready to start.
        </p>
      )}
      {msg ? <p className="m-0 text-sm text-[#8C929D]">{msg}</p> : null}
    </section>
  );
}
