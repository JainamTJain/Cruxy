/**
 * Smoke: Team Brief fact extraction and default modes.
 * Run: NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' tsx scripts/smoke-team-brief.ts
 */
import {
  defaultBriefMode,
  pullCitedFacts,
} from "../src/lib/case-brain/team-brief";
import { SEED_TEAM_IDS } from "../src/lib/seed/ids";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const facts = pullCitedFacts(`
Thesis: We argue that restitution is required.
The museum acquired the object in 1945 after wartime seizure (Smith 2019, p. 12).
We claim ownership follows.
A peer-reviewed study found higher return rates when provenance is incomplete [4].
See https://example.org/report for the registry counts from 2020.
`);

assert(facts.length >= 2, `expected cited facts, got ${facts.length}`);
assert(
  !facts.some((f) => /thesis|we (argue|claim)/i.test(f.text)),
  "stance lines must not become library candidates",
);
assert(
  facts.some((f) => /museum acquired/i.test(f.text)),
  "parenthetical citation should yield a fact",
);

assert(
  defaultBriefMode(SEED_TEAM_IDS.team3) === "build_in_crux",
  "Team 3 starts in Crux",
);
assert(
  defaultBriefMode(SEED_TEAM_IDS.team1) === "own_doc",
  "Team 1 starts on own doc",
);

console.log("smoke-team-brief: ok", { facts: facts.length });
