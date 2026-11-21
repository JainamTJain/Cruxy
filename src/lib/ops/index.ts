/**
 * Workstream I: privacy, operations and reliability.
 * Server-only helpers. Cron routes and G's admin screen call these.
 */
export { authorizeCron } from "@/lib/ops/cron-auth";
export {
  checkPortalLock,
  clearPortalAttempts,
  hashCallerKey,
  recordPortalFailure,
  withPortalBruteForce,
  type PortalKind,
  type PortalCheckResult,
} from "@/lib/ops/brute-force";
export { runAudioBackstopCleanup } from "@/lib/ops/audio-cleanup";
export {
  deleteVoiceSampleForPerson,
  deleteAllVoiceSamples,
  voiceSampleObjectPath,
} from "@/lib/ops/voice-samples";
export { adminDeletePersonPrivateData } from "@/lib/ops/privacy-delete";
export { runSeasonEndExport } from "@/lib/ops/season-export";
export { runSupabaseKeepalive } from "@/lib/ops/keepalive";
export {
  runWeeklyLogicalBackup,
  getBackupStatus,
  BACKUP_TABLES,
} from "@/lib/ops/backup";
export { checkAndSendSpendAlert } from "@/lib/ops/spend-alert";
export { sendOpsEmail } from "@/lib/ops/email";
export {
  assertMayRecord,
  assertRecordingLayoutAllowed,
  assertSessionJoinable,
  assertGuestRoundStillOpen,
  isPracticeSessionEnded,
} from "@/lib/ops/consent-recording";
