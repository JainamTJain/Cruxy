import "server-only";
import {
  listNotifications,
} from "@/lib/db/supabase/auth-extra";
import {
  listPendingDigest,
  listPeopleWithEmail,
  markDigestSent,
} from "@/lib/db/supabase/notify-extra";
import { getPersonById } from "@/lib/db/repository";
import { KIND_LABELS, type NotifyKind } from "@/lib/notify/kinds";
import { sendOpsEmail } from "@/lib/ops/email";

/**
 * Send one daily digest per person with queued items.
 * Mentions and other "digest" channels land here; quiet-hours instant
 * items are also queued and go out with the digest.
 */
export async function sendDailyNotificationDigests(): Promise<{
  people: number;
  emails: number;
  stubbed: number;
}> {
  const pending = await listPendingDigest();
  const byPerson = new Map<string, typeof pending>();
  for (const row of pending) {
    const list = byPerson.get(row.person_id) ?? [];
    list.push(row);
    byPerson.set(row.person_id, list);
  }

  let emails = 0;
  let stubbed = 0;

  for (const [personId, rows] of byPerson) {
    const person = await getPersonById(personId);
    if (!person) {
      await markDigestSent(rows.map((r) => r.id));
      continue;
    }
    const email = person.email?.trim();
    if (!email || !email.includes("@")) {
      await markDigestSent(rows.map((r) => r.id));
      continue;
    }
    if (person.email_reminders_opt_in === false) {
      await markDigestSent(rows.map((r) => r.id));
      continue;
    }

    const notes = await listNotifications(personId);
    const byId = new Map(notes.map((n) => [n.id, n]));
    const lines: string[] = [
      `Hi ${person.name.split(" ")[0] ?? person.name},`,
      "",
      "Here is what waited for you in Crux:",
      "",
    ];
    for (const row of rows) {
      const note = byId.get(row.notification_id);
      const label =
        KIND_LABELS[row.kind as NotifyKind] ?? row.kind.replace(/_/g, " ");
      if (note) {
        lines.push(`- [${label}] ${note.title}`);
        if (note.body) lines.push(`  ${note.body}`);
      } else {
        lines.push(`- [${label}] (open Crux to read)`);
      }
    }
    lines.push("", "Open Crux to catch up: /notifications");

    const result = await sendOpsEmail({
      to: email,
      subject: `Crux digest: ${rows.length} update${rows.length === 1 ? "" : "s"}`,
      text: lines.join("\n"),
      action: "notify_digest",
      meta: { person_id: personId, count: rows.length },
    });
    await markDigestSent(rows.map((r) => r.id));
    if (result.ok && result.stub) stubbed += 1;
    else if (result.ok) emails += 1;
  }

  return { people: byPerson.size, emails, stubbed };
}

/** Warm helper so unused import stays meaningful for typecheck in tests. */
export async function countPeopleWithEmail(): Promise<number> {
  return (await listPeopleWithEmail()).length;
}
