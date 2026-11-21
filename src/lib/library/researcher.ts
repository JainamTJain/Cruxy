import { randomUUID } from "crypto";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { createProposal } from "@/lib/case-brain/service";
import {
  listBookRequests,
  listCases,
  listLibraryFiles,
  listTeams,
  saveBookRequest,
  saveResearchRun,
} from "@/lib/db/library-repository";
import { readStore } from "@/lib/db/sample-store";
import { logActivity } from "@/lib/db/repository";
import type {
  BookRequest,
  ResearchFinding,
  ResearchGap,
  ResearchRun,
} from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

function stubGapsForCase(caseNumber: number, title: string): ResearchGap[] {
  return [
    {
      kind: "unsupported_support",
      claim_ref: `Case ${caseNumber} · Claim 1 · Support 2`,
      detail: `No Drive passage yet backs the second support on "${title}".`,
    },
    {
      kind: "unanswered_counter",
      claim_ref: `Case ${caseNumber} · Counterclaim`,
      detail: "Counterclaim concede/distinguish/rebut rows are thin across teams.",
    },
    {
      kind: "unanswered_moderator",
      claim_ref: `Case ${caseNumber} · Closing question`,
      detail: "No prepared answer for the case closing question.",
    },
  ];
}

function stubFindings(
  caseNumber: number,
  title: string,
): ResearchFinding[] {
  return [
    {
      id: randomUUID(),
      point: `Clarify the values in tension for ${title} with a standard framework pair.`,
      why_it_matters: `Strengthens Claim 1 on Case ${caseNumber} before the regional.`,
      claim_ref: `Case ${caseNumber} · Claim 1`,
      quote: "Name the values in tension and who is left out.",
      link: "https://plato.stanford.edu/",
      verified: false,
      needs_check: true,
      source_ids: ["sep-stub"],
    },
    {
      id: randomUUID(),
      point: "A primary source (court opinion or professional code) can close one gap.",
      why_it_matters: "Gives a citeable backing without repeating Drive notes.",
      claim_ref: `Case ${caseNumber} · Support`,
      quote: "Prefer one primary source over two weak secondary summaries.",
      link: "https://www.courtlistener.com/",
      verified: true,
      needs_check: false,
      source_ids: ["courtlistener-stub"],
    },
  ];
}

function maybeBookRequest(
  caseId: string,
  caseNumber: number,
  title: string,
): Omit<BookRequest, "id" | "created_at"> {
  return {
    title: `Ethics Bowl companion reading for Case ${caseNumber}`,
    reason: `Gap check on "${title}" points to a chapter the team does not own.`,
    chapter: "Ch. 3 — Values in tension",
    case_id: caseId,
    status: "open",
    created_by: null,
  };
}

/**
 * Nightly Researcher loop per active case.
 * Stubs when AI key missing; still writes gaps, finding cards, proposals, book requests.
 */
export async function runNightlyResearch(opts?: {
  personId?: string | null;
  caseNumbers?: number[];
}): Promise<{
  runs: ResearchRun[];
  bookRequestsCreated: number;
  proposalsCreated: number;
  stub: boolean;
  aiCalls: number;
}> {
  const cases = (await listCases()).filter((c) => c.active);
  const teams = await listTeams();
  const files = await listLibraryFiles();
  const existingBooks = await listBookRequests();
  const target = opts?.caseNumbers?.length
    ? cases.filter((c) => opts.caseNumbers!.includes(c.number))
    : cases;

  const store = await readStore();
  const actorId =
    opts?.personId ??
    store.people.find((p) => p.role === "tech_admin")?.id ??
    store.people[0]?.id ??
    "system";

  const runs: ResearchRun[] = [];
  let bookRequestsCreated = 0;
  let proposalsCreated = 0;
  let stub = true;
  let aiCalls = 0;

  for (const c of target) {
    const related = files.filter((f) => f.case_numbers.includes(c.number));
    const gaps = stubGapsForCase(c.number, c.title);
    if (related.length === 0) {
      gaps.unshift({
        kind: "unverified_fact",
        claim_ref: `Case ${c.number}`,
        detail: "No digested Drive files tagged to this case yet.",
      });
    }

    const researchCall = await callCruxy({
      feature: "research_night",
      model: "small",
      personId: opts?.personId ?? null,
      estimatedCostUsd: 0.05,
      messages: [
        {
          role: "system",
          content:
            "You are Cruxy's Researcher. List gaps vs the case set, prefer free sources, verify with two independents or one primary, write finding cards under 40 words. Cite or stay quiet.",
        },
        {
          role: "user",
          content: `Case ${c.number}: ${c.title}. Drive files tagged: ${related.map((f) => f.name).join("; ") || "none"}. Gaps seed: ${JSON.stringify(gaps)}`,
        },
      ],
    });
    aiCalls += 1;
    if (researchCall.ok && !researchCall.stub) stub = false;
    // Even with a live key, Track 1 keeps structured stub findings until web search is wired.
    const findings = stubFindings(c.number, c.title);

    const run: ResearchRun = {
      id: randomUUID(),
      case_id: c.id,
      gaps,
      findings,
      stub: true,
      created_at: nowIso(),
      created_by: opts?.personId ?? null,
    };
    await saveResearchRun(run);
    runs.push(run);

    for (const team of teams) {
      for (const finding of findings) {
        await createProposal({
          teamId: team.id,
          caseId: c.id,
          personId: actorId,
          text: `${finding.point} (${finding.link})`,
          kind: "fact",
          origin: "research",
          originRef: run.id,
        });
        proposalsCreated += 1;
      }
    }

    const already = existingBooks.some(
      (b) =>
        b.case_id === c.id &&
        b.status === "open" &&
        b.title.includes(`Case ${c.number}`),
    );
    if (!already && gaps.some((g) => g.kind === "unsupported_support")) {
      const draft = maybeBookRequest(c.id, c.number, c.title);
      await saveBookRequest({
        id: randomUUID(),
        ...draft,
        created_at: nowIso(),
      });
      bookRequestsCreated += 1;
    }
  }

  await logActivity({
    person_id: opts?.personId ?? null,
    action: "research_night",
    target: null,
    meta: {
      cases: target.map((c) => c.number),
      bookRequestsCreated,
      proposalsCreated,
      aiCalls,
      stub,
    },
  });

  return { runs, bookRequestsCreated, proposalsCreated, stub, aiCalls };
}
