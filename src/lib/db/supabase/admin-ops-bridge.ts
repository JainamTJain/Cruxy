/**
 * Soft bridge from Workstream G's admin panel to Workstream I (`src/lib/ops/**`)
 * and H (weekly Cruxy review). Privacy / season / backup → I; review → H.
 */
import "server-only";
import { adminDeletePersonPrivateData } from "@/lib/ops/privacy-delete";
import { runSeasonEndExport } from "@/lib/ops/season-export";
import { getBackupStatus as opsGetBackupStatus } from "@/lib/ops/backup";
import {
  approveWeeklyReview,
  listPendingWeeklyReviews,
} from "@/lib/cruxy/weekly-review";

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

/** Workstream H: weekly Cruxy review draft the tech admin approves. */
export async function loadReviewOps(): Promise<ReviewOps | null> {
  return {
    async listPendingReviews() {
      const rows = await listPendingWeeklyReviews();
      return rows.map((r) => ({
        id: r.id,
        weekOf: r.week_start,
        summary: r.draft_body,
        proposedUpdates: (r.proposed_check_updates ?? []).map((item) => {
          if (typeof item === "string") return { kind: "check", text: item };
          if (item && typeof item === "object") {
            const rec = item as { kind?: unknown; text?: unknown };
            return {
              kind: typeof rec.kind === "string" ? rec.kind : "check",
              text:
                typeof rec.text === "string"
                  ? rec.text
                  : JSON.stringify(item),
            };
          }
          return { kind: "check", text: String(item) };
        }),
        status: r.status as CruxyReviewDraft["status"],
        created_at: r.created_at,
      }));
    },
    async approveReview(draftId, actorId) {
      await approveWeeklyReview({
        id: draftId,
        reviewedBy: actorId,
        approve: true,
      });
      return { ok: true };
    },
    async rejectReview(draftId, actorId, reason) {
      await approveWeeklyReview({
        id: draftId,
        reviewedBy: actorId,
        approve: false,
        note: reason ?? null,
      });
      return { ok: true };
    },
  };
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
