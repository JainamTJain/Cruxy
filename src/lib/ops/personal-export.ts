import "server-only";
import { getPersonById } from "@/lib/db/repository";
import { getLearningProfile } from "@/lib/learning/profile";
import { listGoalsForPerson, listCommentsForGoals } from "@/lib/learning/goals";
import { listReflectionsForPerson } from "@/lib/learning/reflections";
import { listMyBrierTrend } from "@/lib/practice/predictions";
import { logActivity } from "@/lib/db/repository";
import { nowIso } from "@/lib/utils";

/**
 * One-file download of what Crux stores about this person (personal growth).
 * Never includes voice bytes, passcodes, or ai_calls.
 */
export async function buildPersonalDataExport(personId: string): Promise<{
  filename: string;
  json: string;
}> {
  const person = await getPersonById(personId);
  if (!person) throw new Error("Person not found");

  const [profile, reflections, goals, brier] = await Promise.all([
    getLearningProfile(personId),
    listReflectionsForPerson(personId, 100),
    listGoalsForPerson(personId),
    listMyBrierTrend(personId, 40).catch(() => []),
  ]);
  const comments = await listCommentsForGoals(goals.map((g) => g.id));

  const payload = {
    exported_at: nowIso(),
    person: {
      id: person.id,
      name: person.name,
      team_id: person.team_id,
      role: person.role,
      email: person.email,
      consent_version: person.consent_version,
      consent_at: person.consent_at,
      recording_ok: person.recording_ok,
      has_voice_sample: Boolean(person.voice_sample_path),
      pronunciation_note: person.pronunciation_note,
    },
    learning_profile: profile,
    round_reflections: reflections,
    personal_goals: goals,
    goal_comments: comments,
    score_prediction_brier: brier.map((b) => ({
      round_id: b.round_id,
      brier: b.brier,
      predicted_mean: b.predicted_mean,
      actual_mean: b.actual_mean,
      created_at: b.created_at,
    })),
    notes: [
      "Voice sample audio is not included. You can delete it in Settings.",
      "Practice recordings are deleted once the transcript is saved.",
      "Transcripts stay for the season; ask Jainam if you need lines removed.",
      "This file is only about you. It never includes other people's private data.",
    ],
  };

  await logActivity({
    person_id: personId,
    action: "personal_data_downloaded",
    target: personId,
    meta: null,
  });

  const day = nowIso().slice(0, 10);
  return {
    filename: `crux-my-data-${day}.json`,
    json: JSON.stringify(payload, null, 2),
  };
}

export type PrivacyInventoryItem = {
  key: string;
  label: string;
  stored: string;
  whoSees: string;
  present: boolean;
};

export async function getPrivacyInventory(
  personId: string,
): Promise<PrivacyInventoryItem[]> {
  const person = await getPersonById(personId);
  const profile = await getLearningProfile(personId);
  const reflections = await listReflectionsForPerson(personId, 1);
  const goals = await listGoalsForPerson(personId);

  return [
    {
      key: "voice_sample",
      label: "Voice sample",
      stored: "A short recording so transcripts can label your lines.",
      whoSees: "Stored privately. Used for speaker labels. You and Jainam can delete it.",
      present: Boolean(person?.voice_sample_path),
    },
    {
      key: "recordings_transcripts",
      label: "Recordings and transcripts",
      stored:
        "Practice audio is kept briefly, then deleted once the transcript is saved. Transcripts stay for the season.",
      whoSees: "Your team, Dr. B and Jainam see transcripts for practice rounds. Other teams do not.",
      present: true,
    },
    {
      key: "learning_profile",
      label: "Learning profile",
      stored: "Time budget, focus areas, explanation and feedback prefs.",
      whoSees: "Only you, Dr. B and Jainam.",
      present: Boolean(profile?.completed_at),
    },
    {
      key: "chat",
      label: "Team chat",
      stored: "Messages you send in team channels.",
      whoSees: "Your team and admins.",
      present: true,
    },
    {
      key: "reflections",
      label: "Round reflections",
      stored: "What went well, one change, and how sure you felt after a round.",
      whoSees: "Only you, Dr. B and Jainam.",
      present: reflections.length > 0,
    },
    {
      key: "goals",
      label: "Personal goals",
      stored: "Up to three goals, plus comments from Dr. B.",
      whoSees: "Only you, Dr. B and Jainam.",
      present: goals.length > 0,
    },
  ];
}
