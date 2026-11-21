
import { createProposal } from "@/lib/case-brain/service";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { librarianSystemPrompt } from "@/lib/cruxy/prompts/librarian";
import {
  librarianTagSchema,
  type LibrarianTagOutput,
} from "@/lib/cruxy/schemas/librarian";
import type { CaseRow } from "@/lib/types";
import type { DriveListedFile, LibraryFileType } from "@/lib/library/types";
import type { CitationSource } from "@/lib/cruxy/citations";

export type LibrarianTagResult = LibrarianTagOutput & {
  stub: boolean;
  aiCalls: number;
};

/**
 * Librarian: sort files, write cards, extract ideas for Truth Sources.
 */
export async function runLibrarianTag(input: {
  listed: DriveListedFile;
  text: string;
  cases: CaseRow[];
  personId?: string | null;
  sources?: CitationSource[];
  fixtureKey?: string;
  stubFallback: () => LibrarianTagOutput;
}): Promise<LibrarianTagResult> {
  const caseList = input.cases
    .filter((c) => c.active)
    .map((c) => `${c.number}: ${c.title}`)
    .join("; ");

  const result = await runAgent({
    agent: "librarian",
    feature: "librarian_tag",
    tier: "small",
    system: librarianSystemPrompt(),
    user: `File: ${input.listed.name}\nPath: ${input.listed.path}\nActive cases: ${caseList}\nText (truncated):\n${input.text.slice(0, 4000)}`,
    schema: librarianTagSchema,
    personId: input.personId,
    sources: input.sources,
    fixtureKey: input.fixtureKey ?? "librarian_tag",
    estimatedCostUsd: 0.01,
    stubFallback: input.stubFallback,
  });

  if (!result.ok) {
    return { ...input.stubFallback(), stub: true, aiCalls: 1 };
  }

  return { ...result.data, stub: result.stub, aiCalls: 1 };
}

/**
 * Turn extracted ideas into per-team proposals (Teams 1–3 each get their own).
 * Prefer team_notes / research / practice_transcript from that team's Drive path.
 */
export async function librarianIdeasToProposals(input: {
  ideas: LibrarianTagOutput["ideas"];
  fileId: string;
  fileType: LibraryFileType | null;
  caseIds: string[];
  caseNumbers: number[];
  cases: CaseRow[];
  teams: Array<{ id: string; name: string }>;
  actorId: string;
  /** Optional: restrict proposals to one team (from Drive path Team 1/2/3). */
  teamFilter?: string | null;
}): Promise<number> {
  const caseId =
    input.caseIds[0] ??
    input.cases.find((c) => input.caseNumbers.includes(c.number))?.id ??
    null;
  if (!caseId || input.ideas.length === 0) return 0;

  const eligibleTypes: Array<LibraryFileType | null> = [
    "practice_transcript",
    "team_notes",
    "research",
    "coach_guidance",
  ];
  if (!eligibleTypes.includes(input.fileType)) return 0;

  const teams = input.teamFilter
    ? input.teams.filter(
        (t) =>
          t.id === input.teamFilter ||
          t.name.toLowerCase().includes(input.teamFilter!.toLowerCase()),
      )
    : input.teams;

  let created = 0;
  for (const team of teams) {
    for (const idea of input.ideas) {
      const kind =
        idea.kind === "fact" ||
        idea.kind === "quote" ||
        idea.kind === "example" ||
        idea.kind === "framework"
          ? idea.kind
          : "other";
      await createProposal({
        teamId: team.id,
        caseId,
        personId: input.actorId,
        text: idea.text,
        kind,
        origin:
          input.fileType === "practice_transcript" ? "transcript" : "reading",
        originRef: input.fileId,
      });
      created += 1;
    }
  }
  return created;
}

/** Infer Team 1/2/3 from a Drive path string. */
export function teamFromDrivePath(path: string | null | undefined): string | null {
  if (!path) return null;
  const m = path.match(/team\s*([123])/i);
  return m ? `Team ${m[1]}` : null;
}
