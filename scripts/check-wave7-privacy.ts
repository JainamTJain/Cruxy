/**
 * Quick asserts for Wave 7 privacy helpers.
 * Run: npx tsx scripts/check-wave7-privacy.ts
 */
import {
  assertMoodEventHasNoPersonalData,
  canStoreFullText,
  canViewMaterialRequests,
  clipClosedQuote,
  isOpenOrPublicDomainLicence,
  researchStoragePlan,
  roleChangeNotifyPersonIds,
} from "../src/lib/ops/privacy-licence";
import type { Person, SessionPayload } from "../src/lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(isOpenOrPublicDomainLicence("CC-BY-4.0"), "cc-by open");
assert(isOpenOrPublicDomainLicence("public domain"), "pd open");
assert(!isOpenOrPublicDomainLicence("all rights reserved"), "closed");
assert(!canStoreFullText({ licence: "cc-by", isPaywalled: true }), "paywall");
assert(
  !canStoreFullText({ licence: "cc-by", fetchedPastPaywall: true }),
  "past paywall",
);

const plan = researchStoragePlan({
  licence: "subscription",
  isPaywalled: true,
  excerpt: "One two three four five",
});
assert(!plan.storeFullText, "no full text closed");
assert(plan.needsMaterialRequest, "material request when paywalled");

const quote = clipClosedQuote(Array.from({ length: 50 }, (_, i) => `w${i}`).join(" "));
assert(quote.split(/\s+/).length === 40 || quote.endsWith("..."), "quote clip");

const notify = roleChangeNotifyPersonIds({
  actorId: "a",
  previousPersonId: "b",
  nextPersonId: "c",
});
assert(notify.includes("b") && notify.includes("c"), "notify both");
assert(!notify.includes("a"), "skip actor");

assert(assertMoodEventHasNoPersonalData("feedback.improved").ok, "mood key");
assert(
  !assertMoodEventHasNoPersonalData({ personId: "x", score: 9 }).ok,
  "mood pii blocked",
);

const tech: Person = {
  id: "j",
  name: "Jainam",
  team_id: null,
  role: "tech_admin",
  email: null,
  email_reminders_opt_in: false,
  digest_opt_in: false,
  consent_version: null,
  consent_at: null,
  recording_ok: false,
  voice_sample_path: null,
  pronunciation_note: null,
  first_run_checklist: {},
  failed_attempts: 0,
  locked_until: null,
  last_sign_in_at: null,
  created_at: "",
  created_by: null,
};
const session: SessionPayload = {
  personId: "j",
  role: "tech_admin",
  name: "Jainam",
  teamId: null,
  adminView: true,
  mustConsent: false,
  mustSetLearningProfile: false,
  mustChoosePasscode: false,
  sessionVersion: 0,
};
assert(canViewMaterialRequests(tech, session), "jainam sees material queue");
session.adminView = false;
assert(!canViewMaterialRequests(tech, session), "member view hides queue");

console.log("wave7 privacy checks ok");
