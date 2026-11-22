/**
 * F-096: read the best 3 to 5 results per gap in full (not snippets).
 * Wave 7 I: never fetch past a paywall. Callers should pass open-licence /
 * OA URLs only; this layer also refuses known paywall hosts and login walls.
 */
import type { CitationSource } from "@/lib/cruxy/citations";
import { clipQuoteForStorage } from "@/lib/cruxy/copyright";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_CHARS = 12_000;

/** Hosts that typically require a subscription for full text. */
const PAYWALL_HOST_HINTS = [
  "jstor.org",
  "sciencedirect.com",
  "elsevier.com",
  "link.springer.com",
  "springer.com",
  "wiley.com",
  "onlinelibrary.wiley.com",
  "tandfonline.com",
  "sagepub.com",
  "journals.sagepub.com",
  "academic.oup.com",
  "oxfordacademic.com",
  "cambridge.org",
  "proquest.com",
  "heinonline.org",
  "westlaw.com",
  "lexisnexis.com",
  "nature.com",
  "science.org",
  "ieee.org",
  "acm.org",
] as const;

export type ReadPageResult = {
  url: string;
  title: string;
  text: string;
  ok: boolean;
};

export function urlLooksPaywalled(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PAYWALL_HOST_HINTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
  } catch {
    return true;
  }
}

function looksLikeLoginWall(text: string): boolean {
  const head = text.slice(0, 1200).toLowerCase();
  if (text.length > 4000) return false;
  return (
    head.includes("sign in to continue") ||
    head.includes("log in to read") ||
    head.includes("purchase access") ||
    head.includes("subscribe to access") ||
    head.includes("get institutional access") ||
    (head.includes("paywall") && head.includes("access"))
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPageText(url: string): Promise<ReadPageResult> {
  if (urlLooksPaywalled(url)) {
    return { url, title: url, text: "", ok: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "CruxResearcher/1.0 (Ethics Bowl team tool)",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { url, title: url, text: "", ok: false };
    }
    // Redirected onto a known paywall host: drop.
    if (urlLooksPaywalled(res.url)) {
      return { url, title: url, text: "", ok: false };
    }
    const ctype = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const text = ctype.includes("html")
      ? stripHtml(raw).slice(0, MAX_CHARS)
      : raw.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    if (looksLikeLoginWall(text)) {
      return { url, title: url, text: "", ok: false };
    }
    const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
    return {
      url,
      title: titleMatch?.[1]?.trim() || url,
      text,
      ok: text.length > 80,
    };
  } catch {
    return { url, title: url, text: "", ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export type ReadBestOptions = {
  /**
   * When true (default), skip URLs that look paywalled before fetching.
   * Nightly research should pass only open / OA links and leave this on.
   */
  skipPaywalledHosts?: boolean;
};

/** Pick distinct links, fetch up to `limit` full pages. */
export async function readBestResults(
  links: string[],
  limit = 5,
  opts?: ReadBestOptions,
): Promise<ReadPageResult[]> {
  const skipPaywalled = opts?.skipPaywalledHosts !== false;
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const t = link.trim();
    if (!t || seen.has(t)) continue;
    if (!/^https?:\/\//i.test(t)) continue;
    if (skipPaywalled && urlLooksPaywalled(t)) continue;
    seen.add(t);
    unique.push(t);
    if (unique.length >= limit * 2) break;
  }

  const out: ReadPageResult[] = [];
  for (const url of unique) {
    const page = await fetchPageText(url);
    if (page.ok) out.push(page);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Wave 7 helper: fetch only the given open links (never widen to closed ones).
 */
export async function readOpenResultsOnly(
  openLinks: string[],
  limit = 5,
): Promise<ReadPageResult[]> {
  return readBestResults(openLinks, limit, { skipPaywalledHosts: true });
}

export function pagesToCitationSources(
  pages: ReadPageResult[],
): CitationSource[] {
  return pages.map((p, i) => ({
    id: `web-${i + 1}`,
    text: clipQuoteForStorage(p.text.slice(0, 600)),
    kind: "passage" as const,
  }));
}
