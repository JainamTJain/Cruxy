import { NextResponse } from "next/server";
import { isSampleDataMode, supabaseConfigured } from "@/lib/db/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Health must answer fast even when the DB is slow. */
export const maxDuration = 15;

type HealthBody = {
  ok: boolean;
  status: "ok" | "degraded" | "error";
  database: {
    mode: "sample" | "supabase" | "unconfigured";
    ok: boolean;
    pingMs: number | null;
    error?: string;
  };
  build: {
    commit: string | null;
    env: string | null;
    region: string | null;
    generatedAt: string;
  };
};

/**
 * Lightweight liveness for Vercel and uptime checks.
 * Pings the database (or confirms sample mode) and returns build info.
 * No secrets, no person data.
 */
export async function GET() {
  const generatedAt = new Date().toISOString();
  const build = {
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
      process.env.GIT_COMMIT?.slice(0, 12) ??
      null,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
    generatedAt,
  };

  if (isSampleDataMode()) {
    const body: HealthBody = {
      ok: true,
      status: "ok",
      database: { mode: "sample", ok: true, pingMs: 0 },
      build,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!supabaseConfigured()) {
    const body: HealthBody = {
      ok: false,
      status: "error",
      database: {
        mode: "unconfigured",
        ok: false,
        pingMs: null,
        error: "Supabase keys are missing",
      },
      build,
    };
    return NextResponse.json(body, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const started = Date.now();
  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    const { error } = await sb.from("teams").select("id").limit(1);
    const pingMs = Date.now() - started;
    if (error) {
      const body: HealthBody = {
        ok: false,
        status: "error",
        database: {
          mode: "supabase",
          ok: false,
          pingMs,
          error: "Database ping failed",
        },
        build,
      };
      return NextResponse.json(body, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const degraded = pingMs > 2000;
    const body: HealthBody = {
      ok: true,
      status: degraded ? "degraded" : "ok",
      database: { mode: "supabase", ok: true, pingMs },
      build,
    };
    return NextResponse.json(body, {
      status: degraded ? 200 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    const body: HealthBody = {
      ok: false,
      status: "error",
      database: {
        mode: "supabase",
        ok: false,
        pingMs: Date.now() - started,
        error: "Database ping threw",
      },
      build,
    };
    return NextResponse.json(body, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
