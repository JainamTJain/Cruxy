/**
 * Sample-mode only: ensure Team 3 Case 9 has a few pending proposals so the
 * Waiting queue matches the CaseBrain reference (Inspired by, practice, research).
 * Live Supabase already has Inspired-by rows from Workstream B / fan-out.
 */
import { randomUUID } from "crypto";
import { createProposal } from "@/lib/case-brain/service";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { caseId, SEED_PERSON_IDS, SEED_TEAM_IDS } from "@/lib/seed/ids";

export async function ensureDemoProposalQueue(args: {
  teamId: string;
  caseId: string;
  personId: string;
}): Promise<void> {
  if (!isSampleDataMode()) return;
  if (args.teamId !== SEED_TEAM_IDS.team3) return;
  if (args.caseId !== caseId(9)) return;

  const store = await readStore();
  const pending = store.proposals.filter(
    (p) =>
      p.team_id === args.teamId &&
      p.case_id === args.caseId &&
      p.status === "pending",
  );
  if (pending.length > 0) return;

  await createProposal({
    teamId: args.teamId,
    caseId: args.caseId,
    personId: SEED_PERSON_IDS.Ivan,
    text: "Egypt's 2009 Louvre stand-off shows an early, voluntary return buys goodwill. Use it to back C2 S3.",
    kind: "example",
    origin: "inspired_by_team",
    originRef: "Team 1 edit by Ivan",
    inspiredFromTeamId: SEED_TEAM_IDS.team1,
    ideaKey: "case9-louvre-2009-goodwill",
    citationIds: ["cite:france24-2009"],
  });

  // Practice proposal with analyst note (unverified)
  await createProposal({
    teamId: args.teamId,
    caseId: args.caseId,
    personId: SEED_PERSON_IDS.Nick,
    text: 'The Stone toured Chicago in the 1980s.',
    kind: "fact",
    origin: "transcript",
    originRef: "Practice · Nov 12 · 41:10 · Nick",
    ideaKey: "case9-chicago-tour-false",
    citationIds: [],
  });

  // Force the known analyst note for the Chicago tour falsehood
  await updateStore((s) => {
    const p = s.proposals.find(
      (x) =>
        x.team_id === args.teamId &&
        x.case_id === args.caseId &&
        x.idea_key === "case9-chicago-tour-false",
    );
    if (p) {
      p.cruxy_note =
        "Cruxy found no source: it left London only for wartime storage and one month in Paris (1972).";
      p.origin_ref = "From practice · Nov 12 · 41:10 · Nick";
    }
  });

  await createProposal({
    teamId: args.teamId,
    caseId: args.caseId,
    personId: args.personId,
    text: "UK Charities Act 2022 moral-obligation power took effect Nov 2025 but excludes the British Museum.",
    kind: "fact",
    origin: "research",
    originRef: "Museums Association · The Art Newspaper",
    ideaKey: "case9-charities-act-exclusion",
    citationIds: ["cite:ma", "cite:artnewspaper"],
  });

  // Peer decision from Team 1 on the Louvre idea
  await updateStore((s) => {
    const inspired = s.proposals.find(
      (x) =>
        x.team_id === args.teamId &&
        x.idea_key === "case9-louvre-2009-goodwill",
    );
    if (!inspired) return;
    const peerId = randomUUID();
    const peerProposal = {
      ...inspired,
      id: peerId,
      team_id: SEED_TEAM_IDS.team1,
      status: "accepted" as const,
      socratic_answered: true,
    };
    if (
      !s.proposals.some(
        (p) =>
          p.team_id === SEED_TEAM_IDS.team1 &&
          p.idea_key === inspired.idea_key,
      )
    ) {
      s.proposals.push(peerProposal);
      s.decisions.push({
        id: randomUUID(),
        proposal_id: peerId,
        person_id: SEED_PERSON_IDS.Ivan,
        team_id: SEED_TEAM_IDS.team1,
        verdict: "accept",
        reason: "use it in Q&A only",
        edited_text: null,
        created_at: new Date().toISOString(),
        created_by: SEED_PERSON_IDS.Ivan,
      });
    }
  });
}
