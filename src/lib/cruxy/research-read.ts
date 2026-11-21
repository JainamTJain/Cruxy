/**
 * F-096: read the best 3 to 5 results per gap in full (not snippets).
 */
import type { CitationSource } from "@/lib/cruxy/citations";
import { clipQuoteForStorage } from "@/lib/cruxy/copyright";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_CHARS = 12_000;

export type ReadPageResult = {
  url: string;
  title: string;
  text: string;
  ok: boolean;
};

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
    const ctype = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const text = ctype.includes("html")
      ? stripHtml(raw).slice(0, MAX_CHARS)
      : raw.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
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

/** Pick distinct links, fetch up to `limit` full pages. */
export async function readBestResults(
  links: string[],
  limit = 5,
): Promise<ReadPageResult[]> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const t = link.trim();
    if (!t || seen.has(t)) continue;
    if (!/^https?:\/\//i.test(t)) continue;
    seen.add(t);
    unique.push(t);
    if (unique.length >= limit) break;
  }

  const out: ReadPageResult[] = [];
  for (const url of unique) {
    const page = await fetchPageText(url);
    if (page.ok) out.push(page);
    if (out.length >= limit) break;
  }
  return out;
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
