"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Report button on every signed-in page. `sidebar` (default) sits in the dark
 * sidebar from sm up; `header` sits in the phone top bar. Neither covers content.
 * Sends page, what they were doing, optional screenshot to Jainam's queue.
 */
export function ReportProblemButton({
  placement = "sidebar",
}: {
  placement?: "sidebar" | "header";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"problem" | "suggestion">("problem");
  const [whatDoing, setWhatDoing] = useState("");
  const [details, setDetails] = useState("");
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/consent") ||
    pathname.startsWith("/choose")
  ) {
    return null;
  }

  async function onFile(file: File | null) {
    if (!file) {
      setScreenshotBase64(null);
      setContentType(null);
      return;
    }
    if (file.size > 900_000) {
      setError("Screenshot is too large. Try a smaller crop.");
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    setScreenshotBase64(btoa(binary));
    setContentType(file.type || "image/jpeg");
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/help/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          pagePath: pathname,
          whatDoing,
          details: details || null,
          screenshotBase64,
          screenshotContentType: contentType,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not send. Try again.");
        return;
      }
      setDone(true);
      setWhatDoing("");
      setDetails("");
      setScreenshotBase64(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(false);
          setError(null);
        }}
        className={cn(
          placement === "header"
            ? "rounded-lg px-2 py-1 text-sm font-semibold text-white/85 hover:bg-white/10"
            : "fixed bottom-[136px] left-6 z-40 hidden rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 sm:inline-flex",
        )}
        aria-label="Report a problem or suggest something"
      >
        Report
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-3 sm:items-center"
          role="dialog"
          aria-label="Report a problem or suggest something"
        >
          <div className="w-full max-w-md rounded-[20px] bg-white p-5 text-ink shadow-xl">
            {done ? (
              <>
                <h2 className="font-display text-xl font-extrabold">Sent</h2>
                <p className="mt-2 text-sm text-muted">
                  Jainam got it. You will get a notice in Crux when it is fixed.
                </p>
                <button
                  type="button"
                  className="mt-4 h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <h2 className="font-display text-xl font-extrabold">
                  Report or suggest
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Page: <span className="text-ink">{pathname}</span>
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className={cn(
                      "h-9 flex-1 rounded-lg text-sm font-semibold",
                      kind === "problem"
                        ? "bg-cardinal text-white"
                        : "bg-[#F7F8FA] text-ink",
                    )}
                    onClick={() => setKind("problem")}
                  >
                    Problem
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "h-9 flex-1 rounded-lg text-sm font-semibold",
                      kind === "suggestion"
                        ? "bg-cardinal text-white"
                        : "bg-[#F7F8FA] text-ink",
                    )}
                    onClick={() => setKind("suggestion")}
                  >
                    Suggestion
                  </button>
                </div>

                <label className="mt-3 block text-sm">
                  What were you doing?
                  <textarea
                    className="mt-1 min-h-[72px] w-full rounded-xl border border-ink/15 px-3 py-2 text-sm"
                    value={whatDoing}
                    onChange={(e) => setWhatDoing(e.target.value)}
                    placeholder="I tapped Start practice on Case 9…"
                  />
                </label>

                <label className="mt-2 block text-sm">
                  Extra detail (optional)
                  <textarea
                    className="mt-1 min-h-[56px] w-full rounded-xl border border-ink/15 px-3 py-2 text-sm"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </label>

                <label className="mt-2 block text-sm">
                  Screenshot (optional)
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-xs"
                    onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                  />
                </label>

                {error ? (
                  <p className="mt-2 text-sm text-cardinal">{error}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !whatDoing.trim()}
                    className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => void submit()}
                  >
                    {busy ? "Sending…" : "Send to Jainam"}
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-xl px-3 text-sm text-muted underline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
