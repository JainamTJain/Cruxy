/**
 * Bridge to Workstream I (privacy, ops, reliability).
 * I owns brute-force helpers for session codes / judging portal and nightly audio cleanup.
 * Thin wrappers so D call sites stay stable if I renames internals.
 */
import "server-only";
import {
  withPortalBruteForce,
  type PortalKind,
} from "@/lib/ops/brute-force";
import { runAudioBackstopCleanup } from "@/lib/ops/audio-cleanup";

export type CodeAttemptGate =
  | { ok: true }
  | { ok: false; reason: string; lockedUntil?: string };

export type { PortalKind };

/**
 * Run a session-code or judging-portal verify behind I's lock + failure logging.
 */
export async function gatePortalVerify<T>(opts: {
  portal: PortalKind;
  ipKey: string | null | undefined;
  personId?: string | null;
  targetLabel?: string | null;
  verify: () => Promise<{ ok: true; value: T } | { ok: false }>;
}): Promise<
  | { ok: true; value: T }
  | { ok: false; reason: string; lockedUntil?: string }
> {
  return withPortalBruteForce(opts);
}

/** Ask I's nightly backstop to clear stale practice audio (older than 24h). */
export async function requestStaleAudioCleanup(): Promise<void> {
  await runAudioBackstopCleanup();
}
