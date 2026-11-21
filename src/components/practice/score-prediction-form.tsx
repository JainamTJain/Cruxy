"use client";

import { useEffect, useState } from "react";
import { APPE_SCORE_ITEMS, type AppeItemKey } from "@/lib/practice/types";

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

/**
 * Wave 6: every speaker predicts scores + the question they expect
 * before the round can start.
 */
export function ScorePredictionForm({
  roundId,
  personId,
  onGateChange,
}: Props) {
  const [gate, setGate] = useState<Gate | null>(null);
  const [canPredict, setCanPredict] = useState(false);
  const [scores, setScores] = useState<Partial<Record<AppeItemKey, number>>>(
    {},
  );
  const [question, setQuestion] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/practice/rounds/${roundId}/predictions`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      gate: Gate;
      canPredict?: boolean;
      mine: {
        item_scores: Partial<Record<AppeItemKey, number>>;
        expected_question: string;
      } | null;
    };
    setGate(data.gate);
    setCanPredict(Boolean(data.canPredict));
    onGateChange?.(data.gate.ready);
    if (data.mine) {
      setScores(data.mine.item_scores ?? {});
      setQuestion(data.mine.expected_question ?? "");
      setSaved(true);
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
      <p className="m-0 text-sm text-[#8C929D]">Loading predictions…</p>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-[#262934] bg-[#16181F] p-5 text-[#F2F3F5]">
      <h2 className="m-0 text-base font-bold">Predict your scores</h2>
      <p className="m-0 text-sm text-[#8C929D]">
        Required before the round starts. Compared only with your own past after
        judging.
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
        <div className="flex flex-col gap-3 border-t border-[#262934] pt-3">
          {(gate.requiredItems.length
            ? gate.requiredItems
            : APPE_SCORE_ITEMS.map((i) => i.key)
          ).map((key) => {
            const meta = APPE_SCORE_ITEMS.find((i) => i.key === key);
            if (!meta) return null;
            return (
              <label key={key} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{meta.label}</span>
                <span className="text-xs text-[#8C929D]">{meta.question}</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={scores[key] ?? 5}
                    onChange={(e) =>
                      setScores((p) => ({
                        ...p,
                        [key]: Number(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                  <span className="font-mono text-xs w-6">
                    {scores[key] ?? 5}
                  </span>
                </div>
              </label>
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
        <p className="m-0 text-sm text-[#6EE7B7]">
          Your prediction is locked
          {saved ? "" : ""}.
        </p>
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
