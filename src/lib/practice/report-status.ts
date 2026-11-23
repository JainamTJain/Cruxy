import type { JudgeCard, PracticeRound, TranscriptLine } from "@/lib/practice/types";

export type ReportReadyStatus =
  | "ready"
  | "waiting_transcript"
  | "waiting_judging"
  | "judging_failed"
  | "waiting_cards";

/**
 * Classify why a report page may not be ready yet (Dec 5 robustness).
 */
export function classifyReportStatus(opts: {
  round: PracticeRound;
  reportHeadline: string | null | undefined;
  lines: TranscriptLine[];
  cards: JudgeCard[];
}): ReportReadyStatus {
  if (!opts.lines.length) return "waiting_transcript";
  const headline = (opts.reportHeadline ?? "").toLowerCase();
  if (
    headline.includes("could not finish judging") ||
    headline.includes("spend cap") ||
    headline.includes("no transcript yet")
  ) {
    return "judging_failed";
  }
  if (opts.reportHeadline) return "ready";
  if (opts.cards.length === 0) {
    if (opts.round.ended_at) return "waiting_judging";
    return "waiting_cards";
  }
  return "waiting_judging";
}

export function reportStatusCopy(status: ReportReadyStatus): {
  title: string;
  body: string;
} {
  switch (status) {
    case "waiting_transcript":
      return {
        title: "Transcript still coming",
        body: "The report opens once the transcript is saved. If you just ended the round, wait a moment and refresh.",
      };
    case "waiting_judging":
      return {
        title: "Judging in progress",
        body: "Cruxy is still scoring, or human cards are still arriving. Refresh in a minute.",
      };
    case "judging_failed":
      return {
        title: "Cruxy could not finish",
        body: "Human cards still count. Open End the round again when the connection is steady, or keep reading the human scorecard.",
      };
    case "waiting_cards":
      return {
        title: "No scores yet",
        body: "End the round from the session screen, or wait for a judge to submit a card.",
      };
    default:
      return { title: "Report ready", body: "" };
  }
}
