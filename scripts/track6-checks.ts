import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Track 6 acceptance checks (sample-data path).
 * Run: npx tsx scripts/track6-checks.ts
 * Never prints secret env values.
 *
 * Checks from build spec:
 * - Dr. B cannot change codes or caps
 * - Weekly email sends only to opted-in admins
 * - Spend totals match ai_calls
 */
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  getPersonById,
  getSpendCaps,
  listAiCalls,
  setDigestOptIn,
  spendByFeature,
  sumMonthlySpendUsd,
  updateSpendCaps,
} from "../src/lib/db/repository";
import { canRead, canWrite } from "../src/lib/admin/permissions";
import { sendWeeklySummaryEmail } from "../src/lib/email/weekly-summary";
import { buildWeeklyEmailPreview } from "../src/lib/db/repository";

process.env.USE_SAMPLE_DATA = "1";
// Ensure email path stubs (no real send / no secrets required)
delete process.env.EMAIL_API_KEY;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const drB = store.people.find((p) => p.name === "Dr. B");
  const jainam = store.people.find((p) => p.name === "Jainam");
  const serena = store.people.find((p) => p.name === "Serena");
  assert(drB && jainam && serena, "seeded Dr. B, Jainam, Serena");

  // Permissions: Dr. B cannot change codes or caps
  assert(!canWrite(drB!.role, "passcodes"), "Dr. B cannot write passcodes");
  assert(!canWrite(drB!.role, "spend"), "Dr. B cannot write spend caps");
  assert(!canRead(drB!.role, "spend"), "Dr. B cannot read spend dashboard");
  assert(!canRead(drB!.role, "calibration"), "Dr. B cannot read calibration");
  assert(canWrite(jainam!.role, "passcodes"), "Jainam can write passcodes");
  assert(canWrite(jainam!.role, "spend"), "Jainam can write spend caps");
  assert(
    canRead(drB!.role, "activity_log") && !canWrite(drB!.role, "activity_log"),
    "Dr. B activity log is read-only",
  );

  // Attempting spend update as coach must be rejected by permission helper
  // (API also 403s — unit-check the gate used by the route)
  assert(
    !canWrite("coach_admin", "spend") && canWrite("tech_admin", "spend"),
    "spend write gate is tech_admin only",
  );

  // Jainam can update caps; verify research pause sticks
  const before = await getSpendCaps();
  assert(!before.research_paused, "research not paused initially");
  await updateSpendCaps({ research_paused: true }, jainam!.id);
  const after = await getSpendCaps();
  assert(after.research_paused, "tech admin can pause research");
  await updateSpendCaps({ research_paused: false }, jainam!.id);

  // Spend totals match ai_calls
  const spent = await sumMonthlySpendUsd();
  const byFeature = await spendByFeature();
  const ledger = byFeature.reduce((s, f) => s + f.cost_usd, 0);
  assert(
    Math.abs(spent - ledger) < 0.0001,
    `spend totals match ai_calls ($${spent.toFixed(4)} === $${ledger.toFixed(4)})`,
  );
  const calls = await listAiCalls();
  const callSum = calls
    .filter((c) => !c.refused)
    .reduce((s, c) => s + c.cost_usd, 0);
  assert(
    Math.abs(spent - callSum) < 0.0001,
    "sumMonthlySpendUsd equals raw ai_calls sum",
  );

  // Weekly email: only opted-in admins
  // Clear digest for everyone first
  for (const p of store.people) {
    if (p.role === "tech_admin" || p.role === "coach_admin") {
      await setDigestOptIn(p.id, false);
      const cleared = await getPersonById(p.id);
      if (cleared) {
        cleared.email = null;
        const { savePerson } = await import("../src/lib/db/repository");
        await savePerson(cleared);
      }
    }
  }

  let preview = await buildWeeklyEmailPreview();
  assert(
    preview.recipients.length === 0,
    "no recipients when admins are not opted in",
  );
  const skipped = await sendWeeklySummaryEmail();
  assert(
    !skipped.sent && skipped.skippedReason,
    "weekly email skips when nobody opted in",
  );

  // Opt in Dr. B only (with email)
  const drB2 = await getPersonById(drB!.id);
  assert(drB2, "Dr. B still exists");
  drB2!.email = "drb@example.edu";
  const { savePerson } = await import("../src/lib/db/repository");
  await savePerson(drB2!);
  await setDigestOptIn(drB!.id, true);

  // Member with email must never be a digest recipient
  const serena2 = await getPersonById(serena!.id);
  serena2!.email = "serena@example.edu";
  serena2!.digest_opt_in = true; // even if set, not admin
  await savePerson(serena2!);

  preview = await buildWeeklyEmailPreview();
  assert(
    preview.recipients.length === 1 && preview.recipients[0]!.name === "Dr. B",
    "weekly email recipients are only opted-in admins",
  );
  assert(
    !preview.recipients.some((r) => r.name === "Serena"),
    "members are never weekly digest recipients",
  );

  const sent = await sendWeeklySummaryEmail({ force: true });
  assert(sent.sent && sent.stub, "weekly email stubs without EMAIL_API_KEY");
  assert(sent.recipientCount === 1, "stub send goes to one opted-in admin");

  // Jainam gets spend line; Dr. B does not
  assert(
    preview.recipients[0]!.includeSpend === false,
    "Dr. B weekly email excludes spend/errors",
  );
  const j2 = await getPersonById(jainam!.id);
  j2!.email = "jainam@example.edu";
  await savePerson(j2!);
  await setDigestOptIn(jainam!.id, true);
  preview = await buildWeeklyEmailPreview();
  const jRec = preview.recipients.find((r) => r.name === "Jainam");
  assert(jRec?.includeSpend, "Jainam weekly email includes spend");

  console.log("\nAll Track 6 acceptance checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
