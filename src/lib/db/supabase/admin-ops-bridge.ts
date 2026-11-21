/**
 * Soft bridge from Workstream G's admin panel to Workstream I (`src/lib/ops/**`)
 * and H (weekly Cruxy review). Privacy / season / backup are wired to I.
 * Review stays stubbed until H lands.
 */
import "server-only";
import { adminDeletePersonPrivateData } from "@/lib/ops/privacy-delete";
import { runSeasonEndExport } from "@/lib/ops/season-export";
import { getBackupStatus as opsGetBackupStatus } from "@/lib/ops/backup";

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

/** Workstream I: one-action admin privacy delete. */
export async function loadPrivacyOps(): Promise<PrivacyOps | null> {
  return {
    async deletePersonPrivateData(personId, actorId) {
      const result = await adminDeletePersonPrivateData({ personId, actorId });
      return {
        ok: true,
        deleted: {
          transcript_lines: result.transcriptLines,
          voice_sample: result.voiceSample,
          comments: result.comments,
        },
      };
    },
  };
}

/** Workstream I: season-end downloadable archive. */
export async function loadSeasonOps(): Promise<SeasonOps | null> {
  return {
    async buildSeasonArchive(actorId) {
      const year = new Date().getUTCFullYear();
      const result = await runSeasonEndExport({
        actorId,
        seasonLabel: `${year}-CA`,
        deleteVoiceSamples: true,
        deleteOldTranscripts: false,
      });
      return {
        ok: true,
        filename: result.storagePath,
        bytes: result.byteSize,
        downloadPath: result.downloadUrl ?? undefined,
      };
    },
  };
}

/** Workstream I: weekly logical backup status from Storage. */
export async function loadBackupOps(): Promise<BackupOps | null> {
  return {
    getBackupStatus: () => opsGetBackupStatus(),
  };
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
