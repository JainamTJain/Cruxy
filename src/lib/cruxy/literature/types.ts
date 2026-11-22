/** Bibliographic hit from open literature / web research (Wave 7 H). */

export type LiteratureSourceId =
  | "openalex"
  | "semantic_scholar"
  | "core"
  | "arxiv"
  | "pubmed_central"
  | "doaj"
  | "philpapers"
  | "crossref"
  | "unpaywall"
  | "web";

export type LiteratureHit = {
  source: LiteratureSourceId;
  title: string;
  authors: string[];
  year: number | null;
  url: string | null;
  doi: string | null;
  licence: string | null;
  /** True when a legal open copy is known (Unpaywall OA, arXiv, etc.). */
  open_access: boolean;
  /** Landing page or PDF of the open copy when available. */
  oa_url: string | null;
  abstract: string | null;
  is_book: boolean;
  citation: string;
};

export function formatCitation(hit: Pick<
  LiteratureHit,
  "authors" | "year" | "title" | "doi" | "url"
>): string {
  const who =
    hit.authors.length === 0
      ? "Unknown"
      : hit.authors.length === 1
        ? hit.authors[0]!
        : hit.authors.length === 2
          ? `${hit.authors[0]} and ${hit.authors[1]}`
          : `${hit.authors[0]} et al.`;
  const year = hit.year ? `(${hit.year})` : "(n.d.)";
  const doiOrUrl = hit.doi
    ? `https://doi.org/${hit.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
    : hit.url ?? "";
  return `${who} ${year}. ${hit.title}${doiOrUrl ? `. ${doiOrUrl}` : ""}`;
}

export function isOpenLicence(licence: string | null | undefined): boolean {
  if (!licence) return false;
  const l = licence.toLowerCase();
  if (l.includes("public domain") || l.includes("cc0")) return true;
  if (l.includes("creative commons") || /\bcc[ -]?by\b/.test(l)) return true;
  if (l.includes("open access") && (l.includes("cc-") || l.includes("cc by"))) {
    return true;
  }
  return false;
}
