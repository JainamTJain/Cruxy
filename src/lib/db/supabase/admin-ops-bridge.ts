/**
 * Soft bridge to Workstream I (`src/lib/ops/**`) and H (weekly Cruxy review).
 * Those modules are not on main yet. When they land, flip the imports below
 * from null stubs to the real exports. Do not invent schema here (G's
 * reserved migration is 00017 if a table is ever needed).
 */
import "server-only";

export type DeletePersonResult = {
  ok: true;
  deleted: {
    transcript_lines: number;
    voice_sample: boolean;
    comments: number;
  };
};

export type SeasonExportResult = {
  ok: true;
  /** Downloadable archive (Drive SA is read-only; not uploaded). */
  filename: string;
  bytes: number;
  /** Optional base64 or signed URL once I lands. */
  downloadPath?: string;
};

export type BackupStatus = {
  available: boolean;
  lastBackupAt: string | null;
  lastBackupBytes: number | null;
  lastBackupPath: string | null;
  note: string;
};

export type CruxyReviewDraft = {
  id: string;
  weekOf: string;
  summary: string;
  proposedUpdates: { kind: string; text: string }[];
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type PrivacyOps = {
  deletePersonPrivateData: (
    personId: string,
    actorId: string,
  ) => Promise<DeletePersonResult>;
};

type SeasonOps = {
  buildSeasonArchive: (actorId: string) => Promise<SeasonExportResult>;
};

type BackupOps = {
  getBackupStatus: () => Promise<BackupStatus>;
};

type ReviewOps = {
  listPendingReviews: () => Promise<CruxyReviewDraft[]>;
  approveReview: (
    draftId: string,
    actorId: string,
  ) => Promise<{ ok: true }>;
  rejectReview: (
    draftId: string,
    actorId: string,
    reason?: string,
  ) => Promise<{ ok: true }>;
};

/**
 * Workstream I: set this to `await import("@/lib/ops/privacy")` once that
 * file exists. Until then the admin panel shows a waiting slot.
 */
export async function loadPrivacyOps(): Promise<PrivacyOps | null> {
  return null;
}

/** Workstream I: season-end downloadable archive. */
export async function loadSeasonOps(): Promise<SeasonOps | null> {
  return null;
}

/** Workstream I: weekly logical backup status from Storage. */
export async function loadBackupOps(): Promise<BackupOps | null> {
  return null;
}

/**
 * Workstream H: weekly Cruxy review draft the tech admin approves.
 * Wire to the H module when it lands.
 */
export async function loadReviewOps(): Promise<ReviewOps | null> {
  return null;
}

export function waitingPayload(workstream: "I" | "H", feature: string) {
  return {
    available: false as const,
    waitingFor: workstream,
    feature,
    message:
      workstream === "I"
        ? `Waiting for Workstream I to ship ${feature}.`
        : `Waiting for Workstream H to ship ${feature}.`,
  };
}
