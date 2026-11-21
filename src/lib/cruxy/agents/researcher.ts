
import { randomUUID } from "crypto";
import { createProposal } from "@/lib/case-brain/service";
import { getCaseBrain } from "@/lib/case-brain/service";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { COPYRIGHT_PROMPT_LINE, clipQuoteForStorage } from "@/lib/cruxy/copyright";
import { digestOpenBook, isOpenAccessUrl } from "@/lib/cruxy/open-books";
import { gapsFromClaimMaps } from "@/lib/cruxy/research-gaps";
import { dedupeFindings } from "@/lib/cruxy/research-dedupe";
import {
  pagesToCitationSources,
  readBestResults,
} from "@/lib/cruxy/research-read";
import { capFindingPoint } from "@/lib/cruxy/shorten";
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
  listLibraryFiles,
  listPassagesForFile,
  listResearchRuns,
  listTeams,
  saveBookRequest,
  saveResearchRun,
} from "@/lib/db/library-repository";
import { listCases, listPeopleFull, logActivity } from "@/lib/db/repository";
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
        claim_ref: `Case ${caseNumber}, Claim 1, Support 2`,
        detail: `No Drive passage yet backs the second support on "${title}".`,
      },
      {
        kind: "unanswered_counter",
        claim_ref: `Case ${caseNumber}, Claim 1`,
        detail: "Counterclaim concede/distinguish/rebut rows are thin across teams.",
      },
    ],
    findings: [
      {
        point: `Clarify the values in tension for ${title} with a standard framework pair.`,
        why_it_matters: `Strengthens Claim 1 on Case ${caseNumber} before the regional.`,
        claim_ref: `Case ${caseNumber}, Claim 1, Support 1`,
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
 * Nightly Researcher: gap finding → search → full read of top links →
 * verify → dedupe → proposals / book requests / open-book digest.
 */
export async function runNightlyResearcher(opts?: {
  personId?: string | null;
  caseNumbers?: number[];
}): Promise<{
  runs: ResearchRun[];
  bookRequestsCreated: number;
  proposalsCreated: number;
  openBooksDigested: number;
  skippedDuplicates: number;
  stub: boolean;
  aiCalls: number;
}> {
  const cases = (await listCases()).filter((c) => c.active);
  const teams = await listTeams();
  const files = await listLibraryFiles();
  const existingBooks = await listBookRequests();
  const priorRuns = await listResearchRuns(80);
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
  let openBooksDigested = 0;
  let skippedDuplicates = 0;
  let stub = true;
  let aiCalls = 0;

  for (const c of target) {
    const related = files.filter((f) => f.case_numbers.includes(c.number));
    const brains = await Promise.all(
      teams.map((t) => getCaseBrain(t.id, c.id)),
    );
    const deterministicGaps = gapsFromClaimMaps({
      caseNumber: c.number,
      brains,
      hasLibraryFiles: related.length > 0,
    });

    const seed = stubSearch(c.number, c.title);
    seed.gaps = deterministicGaps.length ? deterministicGaps : seed.gaps;

    const search = await runAgent({
      agent: "researcher",
      feature: "research_night_search",
      tier: "small",
      system: `${researcherSearchSystemPrompt()}\n\n${COPYRIGHT_PROMPT_LINE}`,
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

    // F-096: read best 3–5 result links in full, then verify with that corpus.
    const links = findings.map((f) => f.link).filter(Boolean);
    const pages = await readBestResults(links, 5);
    const readSources = pagesToCitationSources(pages);
    const readCorpus =
      pages.length > 0
        ? pages
            .map(
              (p) =>
                `[${p.url}] ${p.title}\n${p.text.slice(0, 2500)}`,
            )
            .join("\n\n")
        : "(No full pages fetched; verify from search findings only.)";

    const verify = await runAgent({
      agent: "researcher",
      feature: "research_night_verify",
      tier: "strong",
      system: `${researcherVerifySystemPrompt()}\n\n${COPYRIGHT_PROMPT_LINE}`,
      user: `Verify these findings for Case ${c.number}. Prefer two independent sources or one primary. Cap each point at 40 words. Short quotes only.\n\nFindings JSON:\n${JSON.stringify(findings)}\n\nFull pages read:\n${readCorpus}`,
      schema: researcherVerifySchema,
      personId: opts?.personId,
      sources: readSources,
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

    let researchFindings: ResearchFinding[] = findings.map((f) => ({
      id: randomUUID(),
      point: capFindingPoint(f.point),
      why_it_matters: f.why_it_matters,
      claim_ref: f.claim_ref,
      quote: clipQuoteForStorage(f.quote),
      link: f.link,
      verified: f.verified,
      needs_check: f.needs_check,
      source_ids: f.source_ids,
    }));

    // F-099: dedupe against library + yesterday's findings for this case.
    const yesterdayCutoff = Date.now() - 36 * 60 * 60 * 1000;
    const priorFindings = priorRuns
      .filter(
        (r) =>
          r.case_id === c.id &&
          new Date(r.created_at).getTime() >= yesterdayCutoff,
      )
      .flatMap((r) => r.findings);

    const libraryTexts: string[] = [];
    for (const f of related.slice(0, 8)) {
      libraryTexts.push(f.name, f.card ?? "", (f.text_content ?? "").slice(0, 400));
      try {
        const passages = await listPassagesForFile(f.id);
        for (const p of passages.slice(0, 4)) {
          libraryTexts.push(p.text.slice(0, 400));
        }
      } catch {
        /* sample / missing passages ok */
      }
    }

    const deduped = dedupeFindings({
      findings: researchFindings,
      priorFindings,
      libraryTexts,
    });
    researchFindings = deduped.kept;
    skippedDuplicates += deduped.skipped;

    // Stop rule: drop findings for gaps that already have 2 verified sources.
    researchFindings = researchFindings.filter((f) => {
      const prior = priorFindings.filter(
        (p) =>
          p.claim_ref === f.claim_ref && p.verified && !p.needs_check,
      ).length;
      return prior < 2;
    });

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
          text: finding.point,
          kind: "fact",
          origin: "research",
          originRef: `research:${run.id}:${finding.id}|${finding.link}`,
          citationIds: [],
        });
        proposalsCreated += 1;
      }
    }

    // F-106: auto-digest open-access links.
    for (const finding of researchFindings) {
      if (!isOpenAccessUrl(finding.link)) continue;
      const digested = await digestOpenBook({
        url: finding.link,
        title: finding.point.slice(0, 80),
        caseId: c.id,
        personId: opts?.personId ?? null,
      });
      if (digested.fileId && digested.reason !== "already_digested") {
        openBooksDigested += 1;
      }
    }

    const bookReq =
      (search.ok && search.data.book_request) ||
      (gaps.some((g) => g.kind === "unsupported_support") &&
      researchFindings.every((f) => !isOpenAccessUrl(f.link))
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
          b.title.toLowerCase().includes(`case ${c.number}`),
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
      openBooksDigested,
      skippedDuplicates,
      aiCalls,
      stub,
    },
  });

  return {
    runs,
    bookRequestsCreated,
    proposalsCreated,
    openBooksDigested,
    skippedDuplicates,
    stub,
    aiCalls,
  };
}
