/**
 * Data mode:
 * - sample: local JSON store under .data/ (default when Supabase unset or USE_SAMPLE_DATA=1)
 * - supabase: real Postgres via service role (server) / anon (client)
 */
export function isSampleDataMode(): boolean {
  if (process.env.USE_SAMPLE_DATA === "1") return true;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return !url || !key;
}

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}
