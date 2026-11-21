/**
 * Data mode:
 * - sample: local JSON store under .data/ (USE_SAMPLE_DATA=1, or keys unset locally)
 * - supabase: real Postgres via service role (always on Vercel)
 *
 * Never fall back to sample data on Vercel. Missing keys there must fail loudly
 * so /api/auth/people cannot silently return an empty name list.
 */
export function isProductionRuntime(): boolean {
  return Boolean(process.env.VERCEL) || process.env.VERCEL_ENV === "production";
}

export function isSampleDataMode(): boolean {
  if (isProductionRuntime()) {
    if (process.env.USE_SAMPLE_DATA === "1") {
      throw new Error(
        "USE_SAMPLE_DATA=1 is not allowed on Vercel. Configure Supabase instead.",
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
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}
