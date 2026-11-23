import "server-only";

/**
 * Tiny in-process TTL cache for stable catalog reads (teams, cases,
 * competitions). Request-scoped React cache is not enough across hot API
 * routes that each re-list the same dozen rows.
 *
 * Invalidate by writing through the same key after a rare mutation, or wait
 * for the TTL. Never cache person-scoped or team-private data here.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

const DEFAULT_TTL_MS = 30_000;

export async function cachedRead<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await loader();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Drop one key (or everything) after a catalog write. */
export function invalidateReadCache(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}

export const READ_CACHE_KEYS = {
  teams: "catalog:teams",
  cases: "catalog:cases",
  competitions: "catalog:competitions",
} as const;
