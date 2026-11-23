"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  roundId: string;
  /** Optional: stop the mic before finalize. */
  onBeforeFinalize?: () => void | Promise<void>;
  label?: string;
  dark?: boolean;
};

type FinalizeBody = {
  ok?: boolean;
  error?: string;
  stage?: string;
  whatToDo?: string;
  transcriptStub?: boolean;
  lineCount?: number;
  alreadyFinalized?: boolean;
  reportId?: string | null;
  talkPeople?: number;
};

/**
 * Shared "finish drill" control: stop → finalize → report, with plain errors.
 */
export function DrillFinalizeBar({
  roundId,
  onBeforeFinalize,
  label = "Finish and get the report",
  dark = true,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [stubWarn, setStubWarn] = useState(false);
  const [talkPeople, setTalkPeople] = useState<number | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setStubWarn(false);
    try {
      await onBeforeFinalize?.();
      const res = await fetch(`/api/practice/rounds/${roundId}/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as FinalizeBody;
      if (!res.ok) {
        setMsg(
          [data.error, data.whatToDo].filter(Boolean).join(" ") ||
            "Could not finish. Check your connection and try again. Saved audio parts are kept.",
        );
        setBusy(false);
        return;
      }
      if (typeof data.talkPeople === "number") setTalkPeople(data.talkPeople);
      if (data.transcriptStub) {
        setStubWarn(true);
        setMsg(
          "Transcript used a stand-in because live transcription was unavailable. You can open the report, then ask a coach to re-run if needed.",
        );
        setBusy(false);
        // Still allow navigation after a short beat so the person sees the warning.
        window.setTimeout(() => {
          router.push(`/practice/rounds/${roundId}/report`);
        }, 1600);
        return;
      }
      router.push(`/practice/rounds/${roundId}/report`);
    } catch {
      setMsg(
        "Network dropped while finishing. Saved audio parts are kept. Tap Finish again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className={
          dark
            ? "flex h-[46px] items-center justify-center rounded-xl border border-[#F2F3F5] bg-[#F2F3F5] px-4 text-sm font-semibold text-[#0C0D11] disabled:opacity-50"
            : "flex h-11 items-center justify-center rounded-xl bg-cardinal px-4 text-sm font-semibold text-white disabled:opacity-50"
        }
      >
        {busy ? "Finishing…" : label}
      </button>
      {msg ? (
        <p
          className={
            stubWarn
              ? "m-0 text-sm text-[#E8C36A]"
              : dark
                ? "m-0 text-sm text-[#F87171]"
                : "m-0 text-sm text-cardinal"
          }
          role="alert"
        >
          {msg}
        </p>
      ) : null}
      {talkPeople != null && talkPeople > 0 ? (
        <p
          className={
            dark ? "m-0 text-xs text-[#8C929D]" : "m-0 text-xs text-muted"
          }
        >
          Talk stats ready for {talkPeople}{" "}
          {talkPeople === 1 ? "person" : "people"} on the report.
        </p>
      ) : null}
    </div>
  );
}
