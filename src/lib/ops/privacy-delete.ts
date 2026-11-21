import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { getPersonById, logActivity } from "@/lib/db/repository";
import { updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { deleteVoiceSampleForPerson } from "@/lib/ops/voice-samples";

export type AdminPrivacyDeleteResult = {
  personId: string;
  transcriptLines: number;
  comments: number;
  voiceSample: boolean;
};

/**
 * One-action admin delete: this person's transcript lines, voice sample and
 * comments. Aggregate scores stay anonymous. Server function for G's admin
 * screen — call from an admin-only route after role check.
 */
export async function adminDeletePersonPrivateData(opts: {
  personId: string;
  actorId: string;
}): Promise<AdminPrivacyDeleteResult> {
  const person = await getPersonById(opts.personId);
  if (!person) throw new Error("Person not found");

  const actor = await getPersonById(opts.actorId);
  if (!actor || (actor.role !== "tech_admin" && actor.role !== "coach_admin")) {
    throw new Error("Only admins can delete a person's private data");
  }

  let transcriptLines = 0;
  let comments = 0;

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const beforeLines = s.transcript_lines.length;
      s.transcript_lines = s.transcript_lines.filter(
        (l) => l.speaker_person_id !== opts.personId,
      );
      transcriptLines = beforeLines - s.transcript_lines.length;

      const beforeComments = s.comments.length;
      s.comments = s.comments.filter((c) => c.person_id !== opts.personId);
      comments = beforeComments - s.comments.length;
    });
  } else {
    const sb = getServiceSupabase();

    const lines = await sb
      .from("transcript_lines")
      .delete()
      .eq("speaker_person_id", opts.personId)
      .select("id");
    if (lines.error) {
      throw new Error(`privacyDelete.transcripts: ${lines.error.message}`);
    }
    transcriptLines = lines.data?.length ?? 0;

    const cms = await sb
      .from("comments")
      .delete()
      .eq("person_id", opts.personId)
      .select("id");
    if (cms.error) {
      throw new Error(`privacyDelete.comments: ${cms.error.message}`);
    }
    comments = cms.data?.length ?? 0;
  }

  const voice = await deleteVoiceSampleForPerson({
    personId: opts.personId,
    actorId: opts.actorId,
    reason: "admin_delete",
  });

  await logActivity({
    person_id: opts.actorId,
    action: "admin_privacy_delete",
    target: opts.personId,
    meta: {
      transcript_lines: transcriptLines,
      comments,
      voice_sample: voice.deleted,
      name: person.name,
    },
  });

  return {
    personId: opts.personId,
    transcriptLines,
    comments,
    voiceSample: voice.deleted,
  };
}
