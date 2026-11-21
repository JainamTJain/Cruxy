/**
 * F-333: Agent / Job / Model tier / Runs catalog for admin.
 */
import type { CruxyAgentName } from "@/lib/cruxy/prompts/shared";
import { AGENT_DEFAULT_TIER } from "@/lib/cruxy/prompts/shared";

export type AgentCatalogRow = {
  agent: CruxyAgentName;
  job: string;
  tier: "small" | "strong";
  tierNote: string;
  runs: string;
  /** Prefixes on ai_calls.feature that count as this agent's runs. */
  featurePrefixes: string[];
};

export const AGENT_CATALOG: AgentCatalogRow[] = [
  {
    agent: "librarian",
    job: "Sort files, split passages, write file cards, extract ideas",
    tier: AGENT_DEFAULT_TIER.librarian,
    tierNote: "Small",
    runs: "On sync, batch",
    featurePrefixes: ["librarian"],
  },
  {
    agent: "researcher",
    job: "Find gaps, search, read, verify, write finding cards",
    tier: AGENT_DEFAULT_TIER.researcher,
    tierNote: "Small for search and reading, strong for verification",
    runs: "Nightly, batch",
    featurePrefixes: ["research_"],
  },
  {
    agent: "analyst",
    job: "Check proposals, consistency across cases, change the facts list",
    tier: AGENT_DEFAULT_TIER.analyst,
    tierNote: "Strong",
    runs: "On each proposal",
    featurePrefixes: ["analyst"],
  },
  {
    agent: "coach",
    job: "One pagers, flashcards, Socratic drills, language and analogies",
    tier: AGENT_DEFAULT_TIER.coach,
    tierNote: "Small for cards, strong for Socratic",
    runs: "On demand",
    featurePrefixes: ["coach", "socratic"],
  },
  {
    agent: "moderator",
    job: "Pick and phrase bank questions, write new ones",
    tier: AGENT_DEFAULT_TIER.moderator,
    tierNote: "Small",
    runs: "On demand, nightly",
    featurePrefixes: ["moderator"],
  },
  {
    agent: "opponent",
    job: "Write and read the other team's presentation or commentary",
    tier: AGENT_DEFAULT_TIER.opponent,
    tierNote: "Strong",
    runs: "Practice",
    featurePrefixes: ["opponent"],
  },
  {
    agent: "judge",
    job: "Score cards with evidence, ask Q&A questions, write reports and redos",
    tier: AGENT_DEFAULT_TIER.judge,
    tierNote: "Strong",
    runs: "After each round",
    featurePrefixes: ["judge"],
  },
  {
    agent: "assistant",
    job: "The chat drawer",
    tier: AGENT_DEFAULT_TIER.assistant,
    tierNote: "Small by default, strong when asked to reason",
    runs: "On demand",
    featurePrefixes: ["assistant", "admin_program"],
  },
];

export function matchAgentFeature(
  feature: string,
  prefixes: string[],
): boolean {
  const f = feature.toLowerCase();
  return prefixes.some((p) => f.startsWith(p.toLowerCase()) || f.includes(p.toLowerCase()));
}
