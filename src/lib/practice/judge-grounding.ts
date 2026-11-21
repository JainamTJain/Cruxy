/**
 * F-252: Before any human cards exist, Cruxy judge is grounded in APPE
 * Guide to Scoring, score bands, and judges' Q&A guidance from domain docs
 * (the team's Drive copies of the same materials).
 */
import { readFile } from "fs/promises";
import path from "path";

let cached: string | null = null;

export async function getJudgeGroundingPack(): Promise<{
  text: string;
  sources: string[];
}> {
  if (cached) {
    return {
      text: cached,
      sources: [
        "docs/domain/scoring-card.md",
        "docs/domain/ethics-bowl.md",
      ],
    };
  }

  const root = process.cwd();
  const files = [
    "docs/domain/scoring-card.md",
    "docs/domain/ethics-bowl.md",
  ];
  const chunks: string[] = [];
  for (const rel of files) {
    try {
      const raw = await readFile(path.join(root, rel), "utf8");
      chunks.push(`# ${rel}\n${raw.slice(0, 12_000)}`);
    } catch {
      // Missing file: skip; empty grounding is honest.
    }
  }

  cached =
    chunks.join("\n\n").trim() ||
    [
      "APPE score bands: 9-10 outstanding, 8 excellent, 7 solid, 6 noticeable weaknesses,",
      "5 more serious weaknesses, 3-4 seriously flawed, 1-2 almost absent.",
      "Separate a logical flaw from disagreement with the conclusion.",
      "Each judge asks one question and one follow-up in Q&A.",
    ].join(" ");

  return {
    text: cached,
    sources: files,
  };
}

/** True when no human (non-Cruxy) cards exist yet for grounding priority. */
export function shouldPreferDriveGrounding(humanCardCount: number): boolean {
  return humanCardCount <= 0;
}
