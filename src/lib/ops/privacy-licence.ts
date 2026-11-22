import type { Person, SessionPayload } from "@/lib/types";

/**
 * Wave 7 research, roles and mood privacy helpers (Workstream I).
 * Safe to import from client or server: no secrets, no service role.
 *
 * Store full text only for open licence / public domain sources.
 * Never fetch past a paywall. Material requests: Jainam only.
 */

/** Max words kept as a quote when the source is not open. */
export const MAX_CLOSED_QUOTE_WORDS = 40;

const OPEN_LICENCE_TOKENS = [
  "public-domain",
  "public domain",
  "pd",
  "cc0",
  "cc-zero",
  "cc-by",
  "cc by",
  "cc-by-sa",
  "cc by-sa",
  "creativecommons.org/publicdomain",
  "creativecommons.org/licenses/by",
  "open-access",
  "open access",
  "oa",
  "arxiv",
  "pmc",
  "pubmed central",
  "unpaywall-oa",
  "unpaywall oa",
  "doaj",
  "core.ac.uk",
] as const;

const CLOSED_HINTS = [
  "all-rights-reserved",
  "all rights reserved",
  "paywall",
  "subscription",
  "copyright",
  "closed",
  "restricted",
] as const;

function normLicence(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/[_/]+/g, " ");
}

/** True when the licence string is open or public domain. */
export function isOpenOrPublicDomainLicence(
  licence: string | null | undefined,
): boolean {
  const s = normLicence(licence);
  if (!s) return false;
  for (const closed of CLOSED_HINTS) {
    if (s.includes(closed)) return false;
  }
  for (const token of OPEN_LICENCE_TOKENS) {
    if (s.includes(token)) return true;
  }
  return false;
}

/**
 * Full passage / full text may be stored only for open or public domain sources.
 * Paywalled and unknown licences must not store full text.
 */
export function canStoreFullText(opts: {
  licence?: string | null;
  isPaywalled?: boolean;
  fetchedPastPaywall?: boolean;
}): boolean {
  if (opts.fetchedPastPaywall) return false;
  if (opts.isPaywalled) return false;
  return isOpenOrPublicDomainLicence(opts.licence);
}

/** Trim a quote for closed sources; empty when no text. */
export function clipClosedQuote(
  text: string | null | undefined,
  maxWords = MAX_CLOSED_QUOTE_WORDS,
): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}...`;
}

/**
 * Decide what to keep from a research hit.
 * Never returns full text when storage is not allowed.
 */
export function researchStoragePlan(opts: {
  licence?: string | null;
  isPaywalled?: boolean;
  fetchedPastPaywall?: boolean;
  excerpt?: string | null;
}): {
  storeFullText: boolean;
  quote: string;
  needsMaterialRequest: boolean;
} {
  if (opts.fetchedPastPaywall) {
    return { storeFullText: false, quote: "", needsMaterialRequest: true };
  }
  const storeFullText = canStoreFullText(opts);
  if (storeFullText) {
    return {
      storeFullText: true,
      quote: "",
      needsMaterialRequest: false,
    };
  }
  const quote = clipClosedQuote(opts.excerpt);
  return {
    storeFullText: false,
    quote,
    needsMaterialRequest: Boolean(opts.isPaywalled) || !quote,
  };
}

/** Material requests (and book_requests): Jainam / tech admin only. */
export function canViewMaterialRequests(
  person: Person | null | undefined,
  session: SessionPayload,
): boolean {
  return Boolean(
    person && person.role === "tech_admin" && session.adminView,
  );
}

export function canCreateMaterialRequest(
  person: Person | null | undefined,
  session: SessionPayload,
): boolean {
  // Any signed-in member may file one; only Jainam sees the queue.
  return Boolean(person && session.personId);
}

/**
 * Roles board: same team (or admin view), never another team's grid.
 * Mirrors canSetCaseRole without importing the server repository graph.
 */
export function canEditRolesBoard(
  person: Person,
  session: SessionPayload,
  teamId: string,
): boolean {
  const isAdmin =
    person.role === "tech_admin" || person.role === "coach_admin";
  if (isAdmin && session.adminView) return true;
  return Boolean(session.teamId && session.teamId === teamId);
}

/**
 * Who should get a role-change notification.
 * Only people whose assignment changed (never the actor about their own edit).
 */
export function roleChangeNotifyPersonIds(opts: {
  actorId: string;
  previousPersonId: string | null | undefined;
  nextPersonId: string | null | undefined;
}): string[] {
  const ids = new Set<string>();
  const prev = opts.previousPersonId ?? null;
  const next = opts.nextPersonId ?? null;
  if (prev && prev !== next) ids.add(prev);
  if (next && next !== prev) ids.add(next);
  ids.delete(opts.actorId);
  return [...ids];
}

/**
 * Mood / Genie events must stay as opaque keys plus generic bubbles.
 * Reject payloads that look like personal data.
 */
export function assertMoodEventHasNoPersonalData(payload: unknown): {
  ok: boolean;
  reason?: string;
} {
  if (payload == null) return { ok: true };
  if (typeof payload === "string" || typeof payload === "number") {
    return { ok: true };
  }
  if (typeof payload !== "object") {
    return { ok: false, reason: "mood event must be a plain object or key" };
  }
  const banned = [
    "person_id",
    "personId",
    "name",
    "brier",
    "mastery",
    "prediction",
    "transcript",
    "score",
    "email",
    "voice",
    "passcode",
  ];
  const walk = (v: unknown, path: string): string | null => {
    if (v == null) return null;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const hit = walk(v[i], `${path}[${i}]`);
        if (hit) return hit;
      }
      return null;
    }
    if (typeof v === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const key = k.toLowerCase();
        if (banned.some((b) => key.includes(b.toLowerCase()))) {
          return `banned field ${path}.${k}`;
        }
        const hit = walk(child, `${path}.${k}`);
        if (hit) return hit;
      }
    }
    return null;
  };
  const reason = walk(payload, "event");
  return reason ? { ok: false, reason } : { ok: true };
}
