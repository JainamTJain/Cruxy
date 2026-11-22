
import { randomUUID } from "crypto";
import { createProposal } from "@/lib/case-brain/service";
import { getCaseBrain } from "@/lib/case-brain/service";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { COPYRIGHT_PROMPT_LINE, clipQuoteForStorage } from "@/lib/cruxy/copyright";
import {
  literatureBriefForPrompt,
  searchOpenLiterature,
} from "@/lib/cruxy/literature/search";
import { isOpenLicence } from "@/lib/cruxy/literature/types";
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
import { createMaterialRequest } from "@/lib/db/supabase/material-requests-extra";
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
        title: "Stanford Encyclopedia of Philosophy",
        authors: [],
        year: null,
        doi: null,
        licence: "open access encyclopedia",
        open_access: true,
        citation: `Stanford Encyclopedia of Philosophy (n.d.). ${title}. https://plato.stanford.edu/`,
      },
    ],
    book_request: null,
    material_requests: [],
    claims: [],
  };
}

function matchLitHit(
  finding: { link?: string; doi?: string | null; title?: string | null },
  hits: Awaited<ReturnType<typeof searchOpenLiterature>>,
) {
  const doi = finding.doi?.toLowerCase() ?? null;
  if (doi) {
    const byDoi = hits.find((h) => h.doi?.toLowerCase() === doi);
    if (byDoi) return byDoi;
  }
  const link = finding.link ?? "";
  if (link) {
    const byUrl = hits.find(
      (h) =>
        h.url === link ||
        h.oa_url === link ||
        (h.doi && link.includes(h.doi)),
    );
    if (byUrl) return byUrl;
  }
  if (finding.title) {
    const t = finding.title.toLowerCase().slice(0, 40);
    return hits.find((h) => h.title.toLowerCase().includes(t)) ?? null;
  }
  return null;
}

/**
 * Nightly Researcher: gap finding → open literature + Gateway web search →
 * full read of open copies → verify → dedupe → proposals / material requests.
 */
export async function runNightlyResearcher(opts?: {
  personId?: string | null;
  caseNumbers?: number[];
}): Promise<{
  runs: ResearchRun[];
  bookRequestsCreated: number;
  materialRequestsCreated: number;
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
  let materialRequestsCreated = 0;
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

    const queryBits = [
      c.title,
      ...deterministicGaps.slice(0, 3).map((g) => g.detail.slice(0, 80)),
    ].join(" ");
    const litHits = await searchOpenLiterature(queryBits, { limit: 16 });
    const litBrief = literatureBriefForPrompt(litHits);

    const search = await runAgent({
      agent: "researcher",
      feature: "research_night_search",
      tier: "small",
      system: `${researcherSearchSystemPrompt()}\n\n${COPYRIGHT_PROMPT_LINE}\nPrefer the open-literature hits below (OpenAlex, Semantic Scholar, CORE, arXiv, PubMed Central, DOAJ, PhilPapers OA, Crossref/Unpaywall). Use Gateway web search for news, reports, court and government documents. Every finding needs title, authors, year, link, DOI when known, licence, open_access, and a citation line. Store only a short quote unless the source is open licence or public domain. For paywalled sources or books that matter, add material_requests (do not invent full text).`,
      user: `Case ${c.number}: ${c.title}. Drive files: ${related.map((f) => f.name).join("; ") || "none"}. Seed gaps: ${JSON.stringify(seed.gaps)}\n\nOpen literature hits:\n${litBrief}`,
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

    // Read only open-access / open-licence links in full.
    const openLinks = findings
      .map((f) => {
        const lit = matchLitHit(f, litHits);
        if (lit?.oa_url && (lit.open_access || isOpenLicence(lit.licence))) {
          return lit.oa_url;
        }
        if (f.open_access || isOpenAccessUrl(f.link) || isOpenLicence(f.licence)) {
          return f.link;
        }
        return null;
      })
      .filter((u): u is string => Boolean(u));

    const pages = await readBestResults(
      [...new Set([...openLinks, ...findings.map((f) => f.link).filter(Boolean)])],
      5,
    );
    const readSources = pagesToCitationSources(pages);
    const readCorpus =
      pages.length > 0
        ? pages
            .map(
              (p) =>
                `[${p.url}] ${p.title}\n${p.text.slice(0, 2500)}`,
            )
            .join("\n\n")
        : "(No full open pages fetched; verify from citations and short quotes only.)";

    const verify = await runAgent({
      agent: "researcher",
      feature: "research_night_verify",
      tier: "strong",
      system: `${researcherVerifySystemPrompt()}\n\n${COPYRIGHT_PROMPT_LINE}\nKeep bibliographic fields. Cap each point at 40 words. Short quotes only unless the page is open licence.`,
      user: `Verify these findings for Case ${c.number}. Prefer two independent sources or one primary.\n\nFindings JSON:\n${JSON.stringify(findings)}\n\nFull pages read (open copies only):\n${readCorpus}`,
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

    let researchFindings: ResearchFinding[] = findings.map((f) => {
      const lit = matchLitHit(f, litHits);
      const open =
        Boolean(f.open_access) ||
        Boolean(lit?.open_access) ||
        isOpenAccessUrl(f.link) ||
        isOpenLicence(f.licence ?? lit?.licence);
      const title = f.title ?? lit?.title ?? null;
      const authors = f.authors ?? lit?.authors ?? null;
      const year = f.year ?? lit?.year ?? null;
      const doi = f.doi ?? lit?.doi ?? null;
      const licence = f.licence ?? lit?.licence ?? null;
      const citation =
        f.citation ??
        lit?.citation ??
        [authors?.join(", "), year ? `(${year})` : null, title, f.link]
          .filter(Boolean)
          .join(". ");
      return {
        id: randomUUID(),
        point: capFindingPoint(f.point),
        why_it_matters: f.why_it_matters,
        claim_ref: f.claim_ref,
        quote: clipQuoteForStorage(f.quote),
        link: lit?.oa_url && open ? lit.oa_url : f.link,
        verified: f.verified,
        needs_check: f.needs_check,
        source_ids: [
          ...new Set([
            ...(f.source_ids ?? []),
            ...(lit ? [lit.source] : []),
          ]),
        ],
        title,
        authors,
        year,
        doi,
        licence,
        open_access: open,
        citation,
      };
    });

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

    for (const finding of researchFindings) {
      if (!finding.open_access || !finding.link) continue;
      if (!isOpenAccessUrl(finding.link) && !isOpenLicence(finding.licence)) {
        continue;
      }
      const digested = await digestOpenBook({
        url: finding.link,
        title: finding.title ?? finding.point.slice(0, 80),
        caseId: c.id,
        personId: opts?.personId ?? null,
      });
      if (digested.fileId && digested.reason !== "already_digested") {
        openBooksDigested += 1;
      }
    }

    const modelMaterials =
      (search.ok && search.data.material_requests) || [];
    for (const m of modelMaterials) {
      await createMaterialRequest({
        title: m.title,
        citation: m.citation,
        whyItMatters: m.why_it_matters,
        caseId: c.id,
        claimRef: m.claim_ref,
        whereToLook: m.where_to_look ?? "USC Libraries; publisher; author page",
        authors: m.authors,
        year: m.year,
        doi: m.doi,
        url: m.url,
        personId: opts?.personId ?? null,
      });
      materialRequestsCreated += 1;
    }

    // Heuristic: closed / book hits that matter for open gaps.
    for (const finding of researchFindings) {
      const lit = matchLitHit(finding, litHits);
      const paywalled =
        finding.open_access === false ||
        (lit && !lit.open_access) ||
        lit?.is_book;
      if (!paywalled) continue;
      if (!gaps.some((g) => g.claim_ref === finding.claim_ref)) continue;
      await createMaterialRequest({
        title: finding.title ?? finding.point.slice(0, 80),
        citation:
          finding.citation ??
          lit?.citation ??
          finding.link,
        whyItMatters: `${finding.why_it_matters} (${finding.claim_ref})`,
        caseId: c.id,
        claimRef: finding.claim_ref,
        whereToLook: lit?.is_book
          ? "USC Libraries; publisher; author page"
          : "USC Libraries; publisher site; Unpaywall / author page",
        authors: finding.authors?.join(", ") ?? lit?.authors.join(", ") ?? null,
        year: finding.year ?? lit?.year ?? null,
        doi: finding.doi ?? lit?.doi ?? null,
        url: finding.link ?? lit?.url ?? null,
        personId: opts?.personId ?? null,
      });
      materialRequestsCreated += 1;
    }

    const bookReq =
      (search.ok && search.data.book_request) ||
      (gaps.some((g) => g.kind === "unsupported_support") &&
      researchFindings.every((f) => !f.open_access)
        ? {
            title: `Ethics Bowl companion reading for Case ${c.number}`,
            reason: `Gap check on "${c.title}" points to a chapter the team does not own.`,
            chapter: "Ch. 3: Values in tension",
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
        await createMaterialRequest({
          title: bookReq.title,
          citation: bookReq.title,
          whyItMatters: bookReq.reason,
          caseId: c.id,
          claimRef: gaps[0]?.claim_ref ?? null,
          whereToLook: "USC Libraries",
          personId: opts?.personId ?? null,
        });
        materialRequestsCreated += 1;
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
      materialRequestsCreated,
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
    materialRequestsCreated,
    proposalsCreated,
    openBooksDigested,
    skippedDuplicates,
    stub,
    aiCalls,
  };
}
