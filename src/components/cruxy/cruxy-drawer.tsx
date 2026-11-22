"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFocusTrap } from "@/components/access/focus-trap";
import { announceCruxy } from "@/components/access/live-region";
import { CruxWordmark } from "@/components/crux-wordmark";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { PreferenceChips } from "@/components/cruxy/preference-chips";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { GeniePose } from "@/components/cruxy/mood/genie-pose";
import { emitMood } from "@/components/cruxy/mood/bus";
import { useCruxyMood } from "@/components/cruxy/mood/use-cruxy-mood";
import { TailoredLine } from "@/components/learning/tailored-line";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Cite = { id: string; text: string; kind: string };

type AdminAnswer = {
  text: string;
  citations?: Cite[];
  suggestedNext?: string | null;
  stats?: Record<string, string | number | boolean>;
};

export function CruxyDrawer() {
  const {
    drawerOpen,
    setDrawerOpen,
    page,
    highlight,
    caseId,
    sleep,
    setMood,
    setBubble,
    recordingOrTimed,
    emitCruxyEvent,
  } = useCruxy();
  const { mood } = useCruxyMood();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Cite[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [adminName, setAdminName] = useState("Admin");
  const [adminExtra, setAdminExtra] = useState<AdminAnswer | null>(null);
  const [hintOnly, setHintOnly] = useState(false);
  const [wantsMore, setWantsMore] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), [setDrawerOpen]);
  const trapRef = useFocusTrap({
    active: drawerOpen,
    onEscape: closeDrawer,
  });

  useEffect(() => {
    if (!drawerOpen) return;
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then(
        (d: {
          session?: { adminView?: boolean; name?: string; role?: string };
        }) => {
          const admin = Boolean(d.session?.adminView);
          setAdminMode(admin);
          if (d.session?.name) setAdminName(d.session.name);
        },
      )
      .catch(() => undefined);
  }, [drawerOpen]);

  useEffect(() => {
    if (answer) announceCruxy(answer.slice(0, 240));
  }, [answer]);

  useEffect(() => {
    if (prompt) announceCruxy(prompt);
  }, [prompt]);

  if (!drawerOpen) return null;

  async function ask(opts?: { forceAnswer?: boolean; wantHint?: boolean }) {
    if (!question.trim()) return;
    setBusy(true);
    emitMood({ type: "user.ask" });
    emitMood({ type: "cruxy.writing" });
    emitCruxyEvent("listen.typing");
    setAdminExtra(null);
    try {
      if (adminMode) {
        const res = await fetch("/api/cruxy/admin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const data = (await res.json()) as AdminAnswer & {
          error?: string;
          text?: string;
        };
        if (!res.ok) {
          setAnswer(data.error ?? "Could not answer in admin mode.");
          emitCruxyEvent("judge.unexpected");
        } else {
          setAnswer(data.text ?? "");
          setCitations(data.citations ?? []);
          setAdminExtra(data);
          setMood("curious");
          setBubble(null);
        }
        return;
      }

      const { decideCharacterMode } = await import("@/lib/cruxy/character");
      const decision = decideCharacterMode({
        question,
        adminMode: false,
        timedRound: recordingOrTimed,
        alreadyAsked: Boolean(prompt) || Boolean(opts?.forceAnswer),
        triedAnswer: Boolean(opts?.forceAnswer),
        wantsHint: Boolean(opts?.wantHint || hintOnly),
      });

      if (decision.mode === "ask" && decision.question) {
        setPrompt(decision.question);
        setBubble(decision.question);
        emitCruxyEvent("ask.question");
        return;
      }

      if (decision.mode === "hint") {
        const { HINT_FALLBACK } = await import("@/lib/cruxy/character");
        setAnswer(HINT_FALLBACK);
        setCitations([]);
        emitCruxyEvent("hint.given");
        setHintOnly(false);
        return;
      }

      const res = await fetch("/api/cruxy/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          page,
          highlight,
          caseId,
          skipAskFirst: true,
        }),
      });
      const data = (await res.json()) as {
        text: string;
        citations: Cite[];
        refusedWithoutSources: boolean;
        questionFirst: string | null;
        leanFlag?: string | null;
        wantsMoreAvailable?: boolean;
      };
      const lean = data.leanFlag ? `\n\n(${data.leanFlag})` : "";
      setAnswer(`${data.text}${lean}`);
      setCitations(data.citations ?? []);
      setWantsMore(Boolean(data.wantsMoreAvailable));
      if (data.refusedWithoutSources) emitCruxyEvent("source.new");
      else setMood("curious");
      setBubble(null);
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  }

  const chips = adminMode
    ? [
        "Which team needs help?",
        "Who is ready to lead Case 9?",
        "What happened today?",
        "Where do teams disagree?",
        "Readiness brief for UCSB",
      ]
    : ["Quiz me on this case", "One hint, please"];

  return (
    <div
      ref={trapRef}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-mist bg-paper shadow-xl",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Cruxy assistant"
    >
      <header className="flex items-center justify-between gap-3 border-b border-mist bg-ink px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {busy ? (
            <LoadingGenie compact size={48} label="Thinking..." />
          ) : (
            <GeniePose pose={mood} width={44} />
          )}
          <div className="min-w-0">
            <CruxWordmark className="text-[22px]" />
            <p className="mt-0.5 text-[11px] text-white/70">
              {adminMode ? (
                <>
                  Admin mode
                  <br />
                  {adminName}
                </>
              ) : (
                <>
                  Knows this page
                  <br />
                  Cites Evidence Library first
                </>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-lg px-2 py-1 text-sm text-white/80"
          onClick={closeDrawer}
        >
          Close
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {!adminMode ? (
          <TailoredLine className="m-0 text-xs text-muted" />
        ) : null}
        {!adminMode ? (
          <p className="rounded-xl bg-mist/60 px-3 py-2 text-xs text-muted">
            Page: <span className="font-mono text-ink">{page}</span>
            {highlight ? (
              <>
                <br />
                Highlight: {highlight}
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-muted">
            Ask about the program: roadmaps, case brains and attendance.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className="rounded-full border border-mist bg-white px-3 py-1 text-xs"
              onClick={() => {
                setQuestion(c);
                if (c === "One hint, please") setHintOnly(true);
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {busy && !answer && !prompt ? (
          <LoadingGenie label="Cruxy is thinking..." size={88} />
        ) : null}

        {prompt ? (
          <div className="rounded-2xl border border-gold/40 bg-[#FFF7DB] px-3 py-3">
            <p className="font-medium">Cruxy asks first</p>
            <p className="mt-1">{prompt}</p>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => {
                void ask({ forceAnswer: true });
              }}
            >
              I tried. Give me the answer
            </Button>
          </div>
        ) : null}

        {answer ? (
          <div className="space-y-2" aria-live="polite">
            <p className="rounded-2xl bg-white px-3 py-3 shadow-sm">{answer}</p>
            <PreferenceChips />
            {adminExtra?.suggestedNext ? (
              <p className="text-xs text-muted">
                Suggested next step: {adminExtra.suggestedNext}
              </p>
            ) : null}
            {citations.length ? (
              <ul className="space-y-1 text-xs text-muted">
                {citations.map((c, i) => (
                  <li key={c.id} className="border-l-2 border-cardinal/40 pl-2">
                    [T{i + 1}] {c.kind}: {c.text}
                  </li>
                ))}
              </ul>
            ) : /couldn.?t find a source/i.test(answer) ? (
              <p className="text-xs text-muted">No citation to show.</p>
            ) : null}
            {wantsMore ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuestion((q) =>
                    q.toLowerCase().includes("say more")
                      ? q
                      : `${q || "Continue"}. Say more.`,
                  );
                  void ask({ forceAnswer: true });
                }}
              >
                Say more
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="space-y-2 border-t border-mist p-4">
        <textarea
          className="min-h-[72px] w-full rounded-xl border border-mist bg-white px-3 py-2 text-sm"
          placeholder={
            adminMode ? "Who hasn't practised Case 5?" : "Ask Cruxy…"
          }
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            emitCruxyEvent("listen.typing");
          }}
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={busy}
            onClick={() => {
              void ask({
                wantHint: hintOnly || question === "One hint, please",
              });
            }}
          >
            {busy ? "Thinking…" : "Ask"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDrawerOpen(false);
              sleep();
            }}
          >
            Back to the lamp
          </Button>
        </div>
        <p className="m-0 text-center text-[11px] text-muted">
          <Link href="/help" className="underline">
            Help
          </Link>
          {", "}
          <Link href="/help/ethics-bowl" className="underline">
            Ethics Bowl in 90 seconds
          </Link>
        </p>
      </footer>
    </div>
  );
}
