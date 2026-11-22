/**
 * Wave 7 literature search across open corpora.
 * Each provider fails soft; the orchestrator merges and dedupes.
 */
import "server-only";

import {
  formatCitation,
  type LiteratureHit,
  type LiteratureSourceId,
} from "@/lib/cruxy/literature/types";

const TIMEOUT_MS = 8_000;
const UA = "CruxEthicsBowl/1.0 (research; mailto:tech@crux.local)";

function unpaywallEmail(): string {
  return (
    process.env.UNPAYWALL_EMAIL?.trim() ||
    process.env.TECH_ADMIN_EMAIL?.trim() ||
    "research@crux.ethics"
  );
}

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/atom+xml, text/xml, */*" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function authorsFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === "string") return a;
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        if (typeof o.display_name === "string") return o.display_name;
        if (typeof o.name === "string") return o.name;
        if (typeof o.author === "object" && o.author) {
          const n = (o.author as { name?: string }).name;
          if (n) return n;
        }
        if (typeof o.given === "string" || typeof o.family === "string") {
          return [o.given, o.family].filter(Boolean).join(" ");
        }
      }
      return "";
    })
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function yearFrom(raw: unknown): number | null {
  if (typeof raw === "number" && raw > 1800 && raw < 2100) return raw;
  if (typeof raw === "string") {
    const m = raw.match(/(19|20)\d{2}/);
    if (m) return Number(m[0]);
  }
  return null;
}

function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  return doi
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim()
    .toLowerCase() || null;
}

function hit(partial: Omit<LiteratureHit, "citation">): LiteratureHit {
  return { ...partial, citation: formatCitation(partial) };
}

async function searchOpenAlex(q: string): Promise<LiteratureHit[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=5&mailto=${encodeURIComponent(unpaywallEmail())}`;
  const data = (await fetchJson(url)) as {
    results?: Array<Record<string, unknown>>;
  } | null;
  if (!data?.results) return [];
  return data.results.map((w) => {
    const doi = normalizeDoi(
      typeof w.doi === "string"
        ? w.doi
        : typeof w.ids === "object" && w.ids
          ? String((w.ids as { doi?: string }).doi ?? "")
          : null,
    );
    const oa = (w.open_access as { is_oa?: boolean; oa_url?: string } | null) ?? null;
    const primary = w.primary_location as
      | { landing_page_url?: string; license?: string; pdf_url?: string }
      | null;
    return hit({
      source: "openalex",
      title: String(w.title ?? "Untitled"),
      authors: authorsFrom(w.authorships),
      year: yearFrom(w.publication_year),
      url: primary?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : null),
      doi,
      licence: primary?.license ?? null,
      open_access: Boolean(oa?.is_oa),
      oa_url: oa?.oa_url ?? primary?.pdf_url ?? null,
      abstract: null,
      is_book: String(w.type ?? "").includes("book"),
    });
  });
}

async function searchSemanticScholar(q: string): Promise<LiteratureHit[]> {
  const fields =
    "title,authors,year,url,externalIds,openAccessPdf,publicationTypes,abstract";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=5&fields=${fields}`;
  const headers: Record<string, string> = {};
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }
  const data = (await fetchJson(url, { headers })) as {
    data?: Array<Record<string, unknown>>;
  } | null;
  if (!data?.data) return [];
  return data.data.map((p) => {
    const ids = (p.externalIds as { DOI?: string } | null) ?? null;
    const doi = normalizeDoi(ids?.DOI ?? null);
    const oa = p.openAccessPdf as { url?: string } | null;
    const types = Array.isArray(p.publicationTypes)
      ? (p.publicationTypes as string[])
      : [];
    return hit({
      source: "semantic_scholar",
      title: String(p.title ?? "Untitled"),
      authors: authorsFrom(p.authors),
      year: yearFrom(p.year),
      url: typeof p.url === "string" ? p.url : doi ? `https://doi.org/${doi}` : null,
      doi,
      licence: null,
      open_access: Boolean(oa?.url),
      oa_url: oa?.url ?? null,
      abstract: typeof p.abstract === "string" ? p.abstract.slice(0, 600) : null,
      is_book: types.some((t) => /book/i.test(t)),
    });
  });
}

async function searchCore(q: string): Promise<LiteratureHit[]> {
  const key = process.env.CORE_API_KEY?.trim();
  const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(q)}&limit=5`;
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  const data = (await fetchJson(url, { headers })) as {
    results?: Array<Record<string, unknown>>;
  } | null;
  if (!data?.results) return [];
  return data.results.map((w) => {
    const doi = normalizeDoi(
      typeof w.doi === "string" ? w.doi : Array.isArray(w.doi) ? String(w.doi[0]) : null,
    );
    const download = typeof w.downloadUrl === "string" ? w.downloadUrl : null;
    return hit({
      source: "core",
      title: String(w.title ?? "Untitled"),
      authors: authorsFrom(w.authors),
      year: yearFrom(w.yearPublished ?? w.year),
      url: typeof w.sourceFulltextUrls === "string"
        ? w.sourceFulltextUrls
        : download,
      doi,
      licence: typeof w.licence === "string" ? w.licence : null,
      open_access: true,
      oa_url: download,
      abstract: typeof w.abstract === "string" ? w.abstract.slice(0, 600) : null,
      is_book: false,
    });
  });
}

async function searchArxiv(q: string): Promise<LiteratureHit[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=5`;
  const xml = await fetchText(url);
  if (!xml) return [];
  const entries = xml.split("<entry>").slice(1);
  return entries.map((entry) => {
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Untitled")
      .replace(/\s+/g, " ")
      .trim();
    const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? null;
    const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1];
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) =>
      m[1]!.trim(),
    );
    const doi = normalizeDoi(
      entry.match(/arxiv\.org\/abs\/[\w./-]+/)?.[0]
        ? null
        : entry.match(/doi\.org\/([^\s<]+)/)?.[1] ?? null,
    );
    return hit({
      source: "arxiv",
      title,
      authors,
      year: yearFrom(published),
      url: id,
      doi,
      licence: "arXiv non-exclusive license",
      open_access: true,
      oa_url: id ? id.replace("/abs/", "/pdf/") + ".pdf" : null,
      abstract: (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600) || null,
      is_book: false,
    });
  });
}

async function searchEuropePmc(q: string): Promise<LiteratureHit[]> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=5&resultType=core`;
  const data = (await fetchJson(url)) as {
    resultList?: { result?: Array<Record<string, unknown>> };
  } | null;
  const rows = data?.resultList?.result ?? [];
  return rows.map((r) => {
    const doi = normalizeDoi(typeof r.doi === "string" ? r.doi : null);
    const pmcid = typeof r.pmcid === "string" ? r.pmcid : null;
    const isOa = String(r.isOpenAccess ?? "").toLowerCase() === "y";
    const oaUrl = pmcid
      ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/pdf/`
      : null;
    return hit({
      source: "pubmed_central",
      title: String(r.title ?? "Untitled"),
      authors: String(r.authorString ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8),
      year: yearFrom(r.pubYear),
      url: pmcid
        ? `https://europepmc.org/article/PMC/${pmcid.replace(/^PMC/i, "")}`
        : doi
          ? `https://doi.org/${doi}`
          : null,
      doi,
      licence: typeof r.license === "string" ? r.license : null,
      open_access: isOa,
      oa_url: isOa ? oaUrl : null,
      abstract: typeof r.abstractText === "string"
        ? r.abstractText.slice(0, 600)
        : null,
      is_book: false,
    });
  });
}

async function searchDoaj(q: string): Promise<LiteratureHit[]> {
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(q)}?pageSize=5`;
  const data = (await fetchJson(url)) as {
    results?: Array<{ bibjson?: Record<string, unknown> }>;
  } | null;
  if (!data?.results) return [];
  return data.results.map((row) => {
    const b = row.bibjson ?? {};
    const idList = Array.isArray(b.identifier) ? b.identifier : [];
    const doiEntry = idList.find(
      (i) =>
        i &&
        typeof i === "object" &&
        String((i as { type?: string }).type).toLowerCase() === "doi",
    ) as { id?: string } | undefined;
    const doi = normalizeDoi(doiEntry?.id ?? null);
    const linkList = Array.isArray(b.link) ? b.link : [];
    const full = linkList.find(
      (l) =>
        l &&
        typeof l === "object" &&
        String((l as { type?: string }).type).toLowerCase() === "fulltext",
    ) as { url?: string } | undefined;
    return hit({
      source: "doaj",
      title: String(b.title ?? "Untitled"),
      authors: authorsFrom(b.author),
      year: yearFrom(b.year),
      url: full?.url ?? (doi ? `https://doi.org/${doi}` : null),
      doi,
      licence: typeof b.journal === "object" && b.journal
        ? String((b.journal as { license?: Array<{ type?: string }> }).license?.[0]?.type ?? "") || null
        : null,
      open_access: true,
      oa_url: full?.url ?? null,
      abstract: typeof b.abstract === "string" ? b.abstract.slice(0, 600) : null,
      is_book: false,
    });
  });
}

async function searchPhilPapers(q: string): Promise<LiteratureHit[]> {
  // PhilPapers has no stable public JSON search; use OpenAlex philosophy filter.
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=topics.domain.id:https://openalex.org/domains/2&per_page=5&mailto=${encodeURIComponent(unpaywallEmail())}`;
  const data = (await fetchJson(url)) as {
    results?: Array<Record<string, unknown>>;
  } | null;
  if (!data?.results) return [];
  return data.results.map((w) => {
    const doi = normalizeDoi(typeof w.doi === "string" ? w.doi : null);
    const oa = (w.open_access as { is_oa?: boolean; oa_url?: string } | null) ?? null;
    const primary = w.primary_location as
      | { landing_page_url?: string; license?: string }
      | null;
    return hit({
      source: "philpapers",
      title: String(w.title ?? "Untitled"),
      authors: authorsFrom(w.authorships),
      year: yearFrom(w.publication_year),
      url: primary?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : null),
      doi,
      licence: primary?.license ?? null,
      open_access: Boolean(oa?.is_oa),
      oa_url: oa?.oa_url ?? null,
      abstract: null,
      is_book: String(w.type ?? "").includes("book"),
    });
  });
}

async function searchCrossref(q: string): Promise<LiteratureHit[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=5`;
  const data = (await fetchJson(url)) as {
    message?: { items?: Array<Record<string, unknown>> };
  } | null;
  const items = data?.message?.items ?? [];
  return items.map((w) => {
    const doi = normalizeDoi(typeof w.DOI === "string" ? w.DOI : null);
    const titleArr = Array.isArray(w.title) ? w.title : [];
    const type = String(w.type ?? "");
    return hit({
      source: "crossref",
      title: String(titleArr[0] ?? "Untitled"),
      authors: authorsFrom(w.author),
      year: yearFrom(
        (w.published as { "date-parts"?: number[][] })?.["date-parts"]?.[0]?.[0],
      ),
      url: doi ? `https://doi.org/${doi}` : null,
      doi,
      licence: Array.isArray(w.license)
        ? String((w.license[0] as { URL?: string })?.URL ?? "") || null
        : null,
      open_access: false,
      oa_url: null,
      abstract: null,
      is_book: /book/i.test(type),
    });
  });
}

async function enrichUnpaywall(hits: LiteratureHit[]): Promise<LiteratureHit[]> {
  const out: LiteratureHit[] = [];
  for (const h of hits) {
    if (!h.doi || (h.open_access && h.oa_url)) {
      out.push(h);
      continue;
    }
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(h.doi)}?email=${encodeURIComponent(unpaywallEmail())}`;
    const data = (await fetchJson(url)) as {
      is_oa?: boolean;
      best_oa_location?: {
        url_for_pdf?: string;
        url?: string;
        license?: string;
      } | null;
      oa_status?: string;
    } | null;
    if (!data) {
      out.push(h);
      continue;
    }
    const best = data.best_oa_location;
    out.push(
      hit({
        ...h,
        source: h.source === "crossref" ? "unpaywall" : h.source,
        open_access: Boolean(data.is_oa) || h.open_access,
        oa_url: best?.url_for_pdf ?? best?.url ?? h.oa_url,
        licence: best?.license ?? h.licence,
        url: h.url ?? best?.url ?? null,
      }),
    );
  }
  return out;
}

function dedupeHits(hits: LiteratureHit[]): LiteratureHit[] {
  const seen = new Set<string>();
  const out: LiteratureHit[] = [];
  for (const h of hits) {
    const key = (h.doi || h.title.toLowerCase().slice(0, 80)).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

const PROVIDERS: Array<{
  id: LiteratureSourceId;
  run: (q: string) => Promise<LiteratureHit[]>;
}> = [
  { id: "openalex", run: searchOpenAlex },
  { id: "semantic_scholar", run: searchSemanticScholar },
  { id: "core", run: searchCore },
  { id: "arxiv", run: searchArxiv },
  { id: "pubmed_central", run: searchEuropePmc },
  { id: "doaj", run: searchDoaj },
  { id: "philpapers", run: searchPhilPapers },
  { id: "crossref", run: searchCrossref },
];

/**
 * Fan out to open literature APIs. Safe for cron: each call times out and
 * failures return []. Gateway web search stays separate in callCruxy.
 */
export async function searchOpenLiterature(
  query: string,
  opts?: { limit?: number },
): Promise<LiteratureHit[]> {
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  const limit = opts?.limit ?? 20;

  const settled = await Promise.all(
    PROVIDERS.map(async (p) => {
      try {
        return await p.run(q);
      } catch {
        return [] as LiteratureHit[];
      }
    }),
  );

  let merged = dedupeHits(settled.flat());
  try {
    merged = await enrichUnpaywall(merged.slice(0, limit));
  } catch {
    /* Unpaywall optional */
  }
  return dedupeHits(merged).slice(0, limit);
}

export function literatureBriefForPrompt(hits: LiteratureHit[]): string {
  if (!hits.length) return "(No open-literature hits yet.)";
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.source} | OA=${h.open_access ? "yes" : "no"}${h.is_book ? " | book" : ""} | ${h.citation}${h.abstract ? `\nAbstract: ${h.abstract.slice(0, 220)}` : ""}`,
    )
    .join("\n\n");
}
