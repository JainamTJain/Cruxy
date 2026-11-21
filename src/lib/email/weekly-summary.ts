import { buildWeeklyEmailPreview, logActivity } from "@/lib/db/repository";
import type { WeeklyEmailPreview } from "@/lib/types";

export type WeeklySendResult = {
  sent: boolean;
  stub: boolean;
  recipientCount: number;
  skippedReason?: string;
  preview: WeeklyEmailPreview;
};

function formatBody(preview: WeeklyEmailPreview, includeSpend: boolean): string {
  const lines: string[] = [
    "Crux weekly summary",
    "",
    "Attendance",
    ...preview.attendance.map(
      (a) => `- ${a.name}: ${a.present}/${a.sessions} sessions`,
    ),
    "",
    "Scores by team",
    ...preview.scoresByTeam.map(
      (s) => `- ${s.team}: ${s.rounds} rounds, avg ${s.avg}/60`,
    ),
    "",
    "Biggest improvements",
    ...preview.biggestImprovements.map((x) => `- ${x}`),
    "",
    "Cases at risk",
    ...(preview.casesAtRisk.length
      ? preview.casesAtRisk.map((x) => `- ${x}`)
      : ["- None this week"]),
    "",
    "Open disagreements",
    ...preview.openDisagreements.map((x) => `- ${x}`),
    "",
    "Things to take care of",
    ...preview.thingsToCare.map((x) => `- ${x}`),
  ];
  if (includeSpend) {
    lines.push("", "Spend", `- ${preview.spendLine ?? "n/a"}`);
    if (preview.errors.length) {
      lines.push("", "Errors", ...preview.errors.map((e) => `- ${e}`));
    }
  }
  lines.push("", "Open Crux: each line links into the app.");
  return lines.join("\n");
}

/**
 * Sends the Sunday weekly summary only to admins with digest_opt_in + email.
 * Stubs when EMAIL_API_KEY is missing (sample / pre-production).
 */
export async function sendWeeklySummaryEmail(opts?: {
  force?: boolean;
}): Promise<WeeklySendResult> {
  const preview = await buildWeeklyEmailPreview();
  const recipients = preview.recipients;

  if (!recipients.length) {
    await logActivity({
      person_id: null,
      action: "weekly_email_skipped",
      target: "digest",
      meta: { reason: "no_opted_in_admins" },
    });
    return {
      sent: false,
      stub: true,
      recipientCount: 0,
      skippedReason: "No opted-in admins with an email address.",
      preview,
    };
  }

  const apiKey = process.env.EMAIL_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || "Crux <onboarding@resend.dev>";

  if (!apiKey) {
    await logActivity({
      person_id: null,
      action: "weekly_email_stubbed",
      target: "digest",
      meta: {
        recipients: recipients.map((r) => r.name),
        force: Boolean(opts?.force),
      },
    });
    return {
      sent: true,
      stub: true,
      recipientCount: recipients.length,
      preview,
    };
  }

  // Resend-compatible API when key is present
  for (const r of recipients) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [r.email],
        subject: "Crux weekly summary",
        text: formatBody(preview, r.includeSpend),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      await logActivity({
        person_id: null,
        action: "weekly_email_error",
        target: r.email,
        meta: { status: res.status, body: text.slice(0, 200) },
      });
      throw new Error(`Email send failed for ${r.name}`);
    }
  }

  await logActivity({
    person_id: null,
    action: "weekly_email_sent",
    target: "digest",
    meta: { recipients: recipients.map((r) => r.name) },
  });

  return {
    sent: true,
    stub: false,
    recipientCount: recipients.length,
    preview,
  };
}

export { formatBody };
