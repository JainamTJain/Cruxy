import {
  getProgramTotals,
  listPeopleFull,
  listReadiness,
  listTeams,
  listCases,
  sumMonthlySpendUsd,
  getSpendCaps,
  teamReadinessAverages,
} from "@/lib/db/repository";
import { callCruxy } from "@/lib/cruxy/callCruxy";

/**
 * Cruxy admin mode: answers program questions from live sample/store data
 * with links to the records used (cite-or-quiet).
 */
export async function answerAdminProgramQuestion(input: {
  question: string;
  personId: string;
}): Promise<{
  text: string;
  links: { label: string; href: string }[];
  stub: boolean;
}> {
  const [teams, cases, readiness, people, totals, spent, caps, avgs] =
    await Promise.all([
      listTeams(),
      listCases(),
      listReadiness(),
      listPeopleFull(),
      getProgramTotals(),
      sumMonthlySpendUsd(),
      getSpendCaps(),
      teamReadinessAverages(),
    ]);

  const active = cases.filter((c) => c.active);
  const low = readiness
    .filter((r) => r.readiness_pct < 40)
    .map((r) => {
      const team = teams.find((t) => t.id === r.team_id)?.name ?? "?";
      const cas = cases.find((c) => c.id === r.case_id);
      return `${team} Case ${cas?.number}: ${r.readiness_pct}% (${r.lead_names.join(", ")})`;
    });

  const noConsent = people.filter((p) => !p.consent_at).map((p) => p.name);
  const teamLines = avgs.map((a) => {
    const t = teams.find((x) => x.id === a.team_id);
    return `${t?.name ?? "?"}: ${a.avg}% (+${a.delta_week} this week)`;
  });

  const context = [
    `Program totals: ${JSON.stringify(totals)}`,
    `Team readiness: ${teamLines.join("; ")}`,
    `Active cases: ${active.length}`,
    `Low readiness cells: ${low.slice(0, 8).join(" | ") || "none"}`,
    `No consent yet: ${noConsent.join(", ") || "none"}`,
    `Spend: $${spent.toFixed(2)} / $${caps.monthly_usd}${caps.research_paused ? " (research paused)" : ""}`,
  ].join("\n");

  const result = await callCruxy({
    feature: "admin_program",
    tier: "small",
    personId: input.personId,
    messages: [
      {
        role: "system",
        content:
          "You are Cruxy in admin mode. Answer only from the program data provided. Cite records with links. Prefer short, honest answers. Never invent scores.",
      },
      {
        role: "user",
        content: `Program data:\n${context}\n\nQuestion: ${input.question}`,
      },
    ],
  });

  const links = [
    { label: "Program map", href: "/home" },
    { label: "Admin console", href: "/admin" },
    { label: "Spend", href: "/admin/spend" },
    { label: "Consent", href: "/admin#consent" },
  ];

  if (!result.ok) {
    return {
      text: result.reason,
      links,
      stub: true,
    };
  }

  // Enrich stub with a grounded one-liner from live data
  const grounded =
    low.length > 0
      ? `Lowest readiness right now: ${low[0]}. Full map: /home.`
      : `All tracked cells are above 40%. Teams: ${teamLines.join("; ")}.`;

  return {
    text: `${result.text}\n\n${grounded}`,
    links,
    stub: result.stub,
  };
}
