/** Shared shapes for Cruxy page actions (preview then Apply). */

export type ActPlanResult =
  | { kind: "not_action" }
  | { kind: "say"; text: string }
  | {
      kind: "plan";
      action: string;
      summary: string;
      lines: string[];
      data: unknown;
      teamId?: string | null;
    };

export type ActApplyResult = {
  message: string;
  /** Client may navigate here after Apply (e.g. start a drill). */
  navigate?: string | null;
};

/** Suggestion chips for the full Cruxy panel, by page. */
export function suggestionChipsForPage(page: string): string[] {
  if (page.startsWith("/team/roles")) {
    return ["Shuffle the rest fairly", "Who has the most leads?"];
  }
  if (page.startsWith("/case-brain") || page.startsWith("/team/cases")) {
    return ["Quiz me on this case", "Make flashcards from the key points"];
  }
  if (page.startsWith("/practice")) {
    return ["Start a 10 minute drill", "One hint, please"];
  }
  if (page === "/today" || page.startsWith("/today/")) {
    return ["Plan my next 20 minutes", "What should I do first?"];
  }
  return ["Quiz me on this case", "One hint, please"];
}

/** Exact tap path when Cruxy cannot do the action yet. Never a soft deflection. */
export function cannotDoYet(actionLabel: string, tapInstead: string): string {
  return `I cannot ${actionLabel} from here yet. ${tapInstead}`;
}
