/**
 * Data mode:
 * - sample: local JSON store under .data/ (USE_SAMPLE_DATA=1, or unset Supabase in non-prod)
 * - supabase: real Postgres via service role (server) / anon (client)
 *
 * Production never falls back to sample data. Missing Supabase there is a hard error
 * at the call site once repositories try to use the client.
 */
export function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

export function isSampleDataMode(): boolean {
  if (isProductionRuntime()) {
    if (process.env.USE_SAMPLE_DATA === "1") {
      throw new Error(
        "USE_SAMPLE_DATA=1 is not allowed in production. Configure Supabase instead.",
      );
    }
    return false;
  }
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
