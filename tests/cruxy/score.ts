import fs from "fs";
import path from "path";

export type CaseFixture = {
  id: string;
  caseNumber: number;
  title: string;
  argument: {
    claim: string;
    logic_line: string;
    supports: string[];
    counterclaim_response: string;
  };
  sources: Array<{ id: string; text: string }>;
  agreedCritique: {
    mustMention: string[];
    fallacyFlags: string[];
    socraticMustAsk?: boolean;
    expectWeak?: boolean;
    minCitationClaims?: number;
  };
};

export type CaseScore = {
  id: string;
  points: number;
  max: number;
  notes: string[];
};

export function loadCaseFixtures(): CaseFixture[] {
  const dir = path.join(process.cwd(), "tests", "cruxy", "cases");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) =>
      JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as CaseFixture,
    );
}

export function loadBaseline(): {
  version: number;
  minScore: number;
  lastScore: number;
} {
  const file = path.join(
    process.cwd(),
    "tests",
    "cruxy",
    "fixtures",
    "baseline.json",
  );
  return JSON.parse(fs.readFileSync(file, "utf8")) as {
    version: number;
    minScore: number;
    lastScore: number;
  };
}

export function saveBaselineScore(score: number): void {
  const file = path.join(
    process.cwd(),
    "tests",
    "cruxy",
    "fixtures",
    "baseline.json",
  );
  const baseline = loadBaseline();
  baseline.lastScore = score;
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + "\n");
}

/** Score an agent critique text against the agreed critique rubric. */
export function scoreCritique(
  fixture: CaseFixture,
  output: {
    text: string;
    askedQuestion: boolean;
    claimCount: number;
    flaggedWeak?: boolean;
  },
): CaseScore {
  const notes: string[] = [];
  let points = 0;
  let max = 0;
  const lower = output.text.toLowerCase();

  for (const term of fixture.agreedCritique.mustMention) {
    max += 1;
    if (lower.includes(term.toLowerCase())) {
      points += 1;
    } else {
      notes.push(`missing mention: ${term}`);
    }
  }

  if (fixture.agreedCritique.socraticMustAsk) {
    max += 1;
    if (output.askedQuestion) {
      points += 1;
    } else {
      notes.push("expected a Socratic question first");
    }
  }

  if (fixture.agreedCritique.expectWeak) {
    max += 1;
    if (output.flaggedWeak || /weak|missing|fallacy|law|ethics/.test(lower)) {
      points += 1;
    } else {
      notes.push("expected weak-argument flag");
    }
  }

  for (const flag of fixture.agreedCritique.fallacyFlags) {
    max += 1;
    if (lower.includes(flag.toLowerCase()) || output.flaggedWeak) {
      points += 1;
    } else {
      notes.push(`missing fallacy flag: ${flag}`);
    }
  }

  const minClaims = fixture.agreedCritique.minCitationClaims ?? 0;
  if (minClaims > 0) {
    max += 1;
    if (output.claimCount >= minClaims) points += 1;
    else notes.push(`expected >= ${minClaims} cited claims`);
  }

  return { id: fixture.id, points, max, notes };
}
