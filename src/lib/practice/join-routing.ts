/**
 * Client-safe join / role screen routing (no server-only imports).
 */

export type PracticeScreen =
  | "presenter"
  | "commenter"
  | "observer"
  | "moderator"
  | "judge";

/** Where someone lands after joining a session (Home Join or code/link). */
export function hrefForPracticeScreen(
  screen: PracticeScreen | string | null | undefined,
  opts: { sessionId: string; roundId?: string | null },
): string {
  const roundId = opts.roundId ?? null;
  if (screen === "judge") {
    return roundId ? `/judging?round=${roundId}` : "/judging";
  }
  if (roundId && (screen === "presenter" || screen === "commenter" || screen === "moderator")) {
    return `/practice/rounds/${roundId}`;
  }
  if (roundId && screen === "observer") {
    return `/practice/rounds/${roundId}`;
  }
  const q = screen ? `?screen=${encodeURIComponent(screen)}` : "";
  return `/practice/sessions/${opts.sessionId}${q}`;
}

export const DRILL_ROUTES: Record<string, string> = {
  thesis_30: "/practice/drills/thesis",
  moderator_drill: "/practice/drills/moderator",
  commentary_drill: "/practice/drills/commentary",
  judges_qa_drill: "/practice/drills/judges-qa",
  free_record: "/practice/drills/free-record",
  conferral_drill: "/practice/drills/conferral",
  qa_routing: "/practice/drills/qa-routing",
  solo_speech: "/practice/drills/solo-speech",
};
