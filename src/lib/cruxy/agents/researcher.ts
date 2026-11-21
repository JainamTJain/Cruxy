
import { randomUUID } from "crypto";
import { createProposal } from "@/lib/case-brain/service";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import {
  researcherSearchSystemPrompt,
  researcherVerifySystemPrompt,
} from "@/lib/cruxy/prompts/researcher";
import {
  researcherSearchSchema,
  researcherVerifySchema,
  type ResearcherSearchOutput,
} from "@/lib/cruxy/schemas/researcher";
import {
  listBookRequests,
  listCases,
  listLibraryFiles,
  listTeams,
  saveBookRequest,
  saveResearchRun,
} from "@/lib/db/library-repository";
import { listPeopleFull, logActivity } from "@/lib/db/repository";
import type {
  BookRequest,
  ResearchFinding,
  ResearchGap,
  ResearchRun,
} from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

function stubSearch(caseNumber: number, title: string): ResearcherSearchOutput {
  return {
    gaps: [
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
    ],
    findings: [
      {
        point: `Clarify the values in tension for ${title} with a standard framework pair.`,
        why_it_matters: `Strengthens Claim 1 on Case ${caseNumber} before the regional.`,
        claim_ref: `Case ${caseNumber} · Claim 1`,
        quote: "Name the values in tension and who is left out.",
        link: "https://plato.stanford.edu/",
        verified: false,
        needs_check: true,
        source_ids: ["sep-stub"],
        citation_ids: [],
      },
    ],
    book_request: null,
    claims: [],
  };
}

/**
 * Nightly Researcher: gap finding (small + web search) then verification (strong).
 */
export async function runNightlyResearcher(opts?: {
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

  const people = await listPeopleFull();
  const actorId =
    opts?.personId ??
    people.find((p) => p.role === "tech_admin")?.id ??
    people[0]?.id ??
    "system";

  const runs: ResearchRun[] = [];
  let bookRequestsCreated = 0;
  let proposalsCreated = 0;
  let stub = true;
  let aiCalls = 0;

  for (const c of target) {
    const related = files.filter((f) => f.case_numbers.includes(c.number));
    const seed = stubSearch(c.number, c.title);
    if (related.length === 0) {
      seed.gaps.unshift({
        kind: "unverified_fact",
        claim_ref: `Case ${c.number}`,
        detail: "No digested Drive files tagged to this case yet.",
      });
    }

    const search = await runAgent({
      agent: "researcher",
      feature: "research_night_search",
      tier: "small",
      system: researcherSearchSystemPrompt(),
      user: `Case ${c.number}: ${c.title}. Drive files: ${related.map((f) => f.name).join("; ") || "none"}. Seed gaps: ${JSON.stringify(seed.gaps)}`,
      schema: researcherSearchSchema,
      personId: opts?.personId,
      webSearch: true,
      fixtureKey: `researcher_search_case_${c.number}`,
      estimatedCostUsd: 0.05,
      stubFallback: () => seed,
    });
    aiCalls += 1;

    let findings = search.ok ? search.data.findings : seed.findings;
    const gaps: ResearchGap[] = search.ok ? search.data.gaps : seed.gaps;
    if (search.ok && !search.stub) stub = false;

    const verify = await runAgent({
      agent: "researcher",
      feature: "research_night_verify",
      tier: "strong",
      system: researcherVerifySystemPrompt(),
      user: `Verify these findings for Case ${c.number}: ${JSON.stringify(findings)}`,
      schema: researcherVerifySchema,
      personId: opts?.personId,
      fixtureKey: `researcher_verify_case_${c.number}`,
      estimatedCostUsd: 0.08,
      stubFallback: () => ({
        findings,
        closed_gaps: [],
        claims: [],
      }),
    });
    aiCalls += 1;
    if (verify.ok) {
      findings = verify.data.findings;
      if (!verify.stub) stub = false;
    }

    const researchFindings: ResearchFinding[] = findings.map((f) => ({
      id: randomUUID(),
      point: f.point.slice(0, 280),
      why_it_matters: f.why_it_matters,
      claim_ref: f.claim_ref,
      quote: f.quote,
      link: f.link,
      verified: f.verified,
      needs_check: f.needs_check,
      source_ids: f.source_ids,
    }));

    const run: ResearchRun = {
      id: randomUUID(),
      case_id: c.id,
      gaps,
      findings: researchFindings,
      stub: search.ok ? search.stub : true,
      created_at: nowIso(),
      created_by: opts?.personId ?? null,
    };
    await saveResearchRun(run);
    runs.push(run);

    for (const team of teams) {
      for (const finding of researchFindings) {
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

    const bookReq =
      (search.ok && search.data.book_request) ||
      (gaps.some((g) => g.kind === "unsupported_support")
        ? {
            title: `Ethics Bowl companion reading for Case ${c.number}`,
            reason: `Gap check on "${c.title}" points to a chapter the team does not own.`,
            chapter: "Ch. 3 — Values in tension",
          }
        : null);

    if (bookReq) {
      const already = existingBooks.some(
        (b) =>
          b.case_id === c.id &&
          b.status === "open" &&
          b.title.includes(`Case ${c.number}`),
      );
      if (!already) {
        const row: BookRequest = {
          id: randomUUID(),
          title: bookReq.title,
          reason: bookReq.reason,
          chapter: bookReq.chapter ?? null,
          case_id: c.id,
          status: "open",
          created_at: nowIso(),
          created_by: null,
        };
        await saveBookRequest(row);
        bookRequestsCreated += 1;
      }
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
