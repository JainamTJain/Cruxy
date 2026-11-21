/**
 * Bridge to Workstream I (privacy, ops, reliability).
 * I owns brute-force helpers for session codes / judging portal and nightly audio cleanup.
 * Prefer those modules when present; keep local fallbacks until I merges.
 */
import { addMinutes } from "@/lib/utils";

export type CodeAttemptGate =
  | { ok: true }
  | { ok: false; reason: string; lockedUntil?: string };

/**
 * Check / record a failed session-code or judging-portal attempt.
 * Delegates to `@/lib/ops/brute-force` when Workstream I has landed.
 */
export async function gateCodeAttempt(opts: {
  key: string;
  success: boolean;
  maxFailures?: number;
  lockMinutes?: number;
  /** Sample-store mutable list (sample mode only). */
  attempts?: {
    key: string;
    failures: number;
    locked_until: string | null;
  }[];
}): Promise<CodeAttemptGate> {
  try {
    const opsPath = "@/lib/ops/brute-force";
    const ops = (await import(opsPath)) as {
      gateCodeAttempt?: (o: {
        key: string;
        success: boolean;
        maxFailures?: number;
        lockMinutes?: number;
      }) => Promise<CodeAttemptGate>;
    };
    if (typeof ops.gateCodeAttempt === "function") {
      return ops.gateCodeAttempt(opts);
    }
  } catch {
    // I not merged yet.
  }

  const max = opts.maxFailures ?? 5;
  const mins = opts.lockMinutes ?? 10;
  const list = opts.attempts;
  if (!list) return { ok: true };

  let row = list.find((a) => a.key === opts.key);
  if (!row) {
    row = { key: opts.key, failures: 0, locked_until: null };
    list.push(row);
  }
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return {
      ok: false,
      reason: "Too many wrong codes. Try again in a few minutes.",
      lockedUntil: row.locked_until,
    };
  }
  if (opts.success) {
    row.failures = 0;
    row.locked_until = null;
    return { ok: true };
  }
  row.failures += 1;
  if (row.failures >= max) {
    row.locked_until = addMinutes(new Date(), mins).toISOString();
    row.failures = 0;
    return {
      ok: false,
      reason: "Too many wrong codes. Locked for 10 minutes.",
      lockedUntil: row.locked_until,
    };
  }
  return { ok: false, reason: "Wrong code." };
}

/** Ask I's nightly cleanup to delete stale audio when available. */
export async function requestStaleAudioCleanup(): Promise<void> {
  try {
    const opsPath = "@/lib/ops/audio-cleanup";
    const ops = (await import(opsPath)) as {
      deleteStaleAudio?: () => Promise<void>;
    };
    if (typeof ops.deleteStaleAudio === "function") {
      await ops.deleteStaleAudio();
    }
  } catch {
    // I not merged — recording.ts keeps a local stale cleanup for sample mode.
  }
}
