/**
 * Shared helpers for Crux end-to-end journeys (sample mode).
 * Never logs passcodes or student speech.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3000";
export const STARTER = "482913";
export const COACH_STARTER = "719304";
export const ADMIN_STARTER = "135790";
export const MEMBER_PASS = "159753";
export const FIRST_RUN_PASS = "258014";
export const CASE9 = "c0000000-0000-4000-8000-000000000009";
export const TEAM3 = "33333333-3333-3333-3333-333333333333";
export const SESSION =
  process.env.E2E_SESSION_ID ?? "fe4b6f86-aaa4-4291-a98f-284e6d2a87f6";
export const ROUND_REPORT =
  process.env.E2E_ROUND_REPORT ?? "25dac835-5030-4a01-932c-9e71d513c724";
export const PRACTICE_CODE = "482913";

const STORE = join(process.cwd(), ".data", "store.json");
const JSON_HEADERS = { "content-type": "application/json" };

export function log(step, detail = "") {
  const extra = detail ? ` ${detail}` : "";
  console.log(`  · ${step}${extra}`);
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export async function waitForServer(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/auth/people`);
      if (r.ok) return;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready at ${BASE} after ${timeoutMs}ms`);
}

/** Tap 6 digits on the on-screen keypad, then Enter. */
export async function enterKeypad(page, code) {
  for (const d of String(code)) {
    await page.getByRole("button", { name: d, exact: true }).click();
  }
  await page.getByRole("button", { name: "Enter", exact: true }).click();
}

export async function finishOnboarding(ctx) {
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (!me.authenticated) return;
  if (me.session?.mustConsent || !me.person?.consent_version) {
    await ctx.request.post(`${BASE}/api/auth/consent`, {
      data: { recordingOk: true },
      headers: JSON_HEADERS,
    });
  }
  const again = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (again.session?.mustSetLearningProfile) {
    await ctx.request.post(`${BASE}/api/learning-profile`, {
      data: { skip: true },
      headers: JSON_HEADERS,
    });
  }
  const third = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (third.session?.mustChoosePasscode) {
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: MEMBER_PASS, confirm: MEMBER_PASS },
      headers: JSON_HEADERS,
    });
  }
}

/** Clear lockouts / failed attempts in the sample store (dev e2e only). */
export function clearAuthLocks(names = []) {
  if (!existsSync(STORE)) return;
  const store = JSON.parse(readFileSync(STORE, "utf8"));
  let changed = false;
  for (const p of store.people ?? []) {
    if (names.length && !names.includes(p.name)) continue;
    if (p.failed_attempts || p.locked_until) {
      p.failed_attempts = 0;
      p.locked_until = null;
      changed = true;
    }
  }
  if (changed) writeFileSync(STORE, JSON.stringify(store, null, 2));
}

/**
 * API sign-in. Modes: katie | jainam-admin | drb-admin | name string.
 */
export async function signIn(ctx, mode = "katie") {
  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  assert(Array.isArray(people) && people.length > 0, "No people from sample store");

  let person;
  let codes;
  let adminView = false;

  if (mode === "jainam-admin") {
    person = people.find((p) => p.name === "Jainam");
    // Tech admin uses the admin starter (sample 135790), then a chosen passcode.
    codes = [MEMBER_PASS, ADMIN_STARTER];
    adminView = true;
    clearAuthLocks(["Jainam"]);
  } else if (mode === "drb-admin") {
    person = people.find((p) => p.name === "Dr. B" || p.name.startsWith("Dr"));
    codes = [MEMBER_PASS, COACH_STARTER];
    adminView = true;
    clearAuthLocks(["Dr. B"]);
  } else if (mode === "katie" || !mode) {
    person = people.find((p) => p.name === "Katie" || p.name.startsWith("Katie"));
    codes = [MEMBER_PASS, STARTER];
  } else {
    person = people.find((p) => p.name === mode || p.name.startsWith(mode));
    codes = [MEMBER_PASS, STARTER, FIRST_RUN_PASS];
  }

  assert(person, `Person not found for mode ${mode}`);

  let lastStatus = 0;
  let lastBody = "";
  for (const code of codes) {
    const r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: person.id, code },
      headers: JSON_HEADERS,
    });
    lastStatus = r.status();
    if (r.ok()) {
      await finishOnboarding(ctx);
      if (adminView) {
        await ctx.request.post(`${BASE}/api/auth/admin-view`, {
          data: { adminView: true },
          headers: JSON_HEADERS,
        });
      }
      return person;
    }
    lastBody = await r.text().catch(() => "");
  }
  throw new Error(
    `Sign-in failed for ${person.name}: ${lastStatus} ${lastBody.slice(0, 120)}`,
  );
}

/**
 * Reset a roster person so the UI first-sign-in path runs again.
 * Sample store only. Safe between journeys once the file exists.
 */
export function resetFirstRunPerson(name = "Tri") {
  if (!existsSync(STORE)) {
    mkdirSync(join(process.cwd(), ".data"), { recursive: true });
    return false;
  }
  const store = JSON.parse(readFileSync(STORE, "utf8"));
  const person = (store.people ?? []).find((p) => p.name === name);
  if (!person) return false;

  person.consent_version = null;
  person.consent_at = null;
  person.recording_ok = false;
  person.first_run_checklist = {
    confirm_cases: false,
    open_reading: false,
    review_flashcards: false,
    answer_aloud: false,
    see_roadmap: false,
  };
  person.failed_attempts = 0;
  person.locked_until = null;

  store.auth_codes = (store.auth_codes ?? []).filter(
    (c) => !(c.person_id === person.id && c.kind === "personal"),
  );
  store.learning_profiles = (store.learning_profiles ?? []).filter(
    (p) => p.person_id !== person.id,
  );
  store.activity_log = (store.activity_log ?? []).filter(
    (e) =>
      !(
        e.person_id === person.id &&
        ["tour_finished", "tour_skipped", "sign_in", "consent", "choose_passcode"].includes(
          e.action,
        )
      ),
  );

  writeFileSync(STORE, JSON.stringify(store, null, 2));
  return true;
}

/** Dismiss the guided tour if it is open (Skip or finish). */
export async function dismissTourIfOpen(page) {
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(300);
  }
}

export async function completeTour(page) {
  const dialog = page.getByRole("dialog", { name: /Welcome to Crux|Tour/i });
  // Auto-tour may take up to ~1s after shell paint.
  const welcome = page.getByRole("heading", { name: "Welcome to Crux" });
  await welcome.waitFor({ timeout: 15_000 });
  assert(await welcome.isVisible(), "Guided tour did not open");
  // Walk through every step.
  for (let i = 0; i < 14; i++) {
    const goToday = page.getByRole("button", { name: "Go to Today" });
    if (await goToday.isVisible().catch(() => false)) {
      await goToday.click();
      break;
    }
    const next = page.getByRole("button", { name: /Show me around|Next/ });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(200);
      continue;
    }
    break;
  }
  await page.waitForTimeout(400);
  void dialog;
}

export async function expectNoCrash(page, label) {
  const body = await page.locator("body").innerText().catch(() => "");
  assert(
    !/Application error|Internal Server Error|Unhandled Runtime Error/i.test(body),
    `${label}: page crashed`,
  );
}
