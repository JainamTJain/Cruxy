/** Phone + desktop shots of /regional (solo-first tabs). */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = "/opt/cursor/artifacts";
const MEMBER_PASS = "159753";
const STARTER = "482913";
mkdirSync(OUT, { recursive: true });

async function finishOnboarding(ctx, headers) {
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (!me.authenticated) return;
  if (me.session?.mustConsent || !me.person?.consent_version) {
    await ctx.request.post(`${BASE}/api/auth/consent`, {
      data: { recordingOk: true },
      headers,
    });
  }
  const again = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (again.session?.mustChoosePasscode) {
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: MEMBER_PASS, confirm: MEMBER_PASS },
      headers,
    });
  }
  const after = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (after.session?.mustSetLearningProfile) {
    await ctx.request.post(`${BASE}/api/learning-profile`, {
      data: {
        sliders: {
          visual_verbal: 50,
          analogies_formal: 50,
          ethical_mechanization: 50,
          short_deep: 50,
          direct_gentle: 50,
        },
        appeBaselines: {
          presentation_a: 5,
          presentation_b: 5,
          presentation_c: 5,
          commentary: 5,
          response_to_commentary: 5,
          response_to_judges: 5,
        },
      },
      headers,
    });
  }
}

async function signInKatie(ctx) {
  await ctx.clearCookies();
  const headers = { "content-type": "application/json" };
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const katie = people.find((p) => p.name.startsWith("Katie"));
  if (!katie) throw new Error("Katie missing");
  let r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: katie.id, code: MEMBER_PASS },
    headers,
  });
  if (!r.ok()) {
    r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: katie.id, code: STARTER },
      headers,
    });
  }
  if (!r.ok()) throw new Error(`sign-in ${r.status()}`);
  await finishOnboarding(ctx, headers);
}

const browser = await chromium.launch({ headless: true });

for (const [name, width, height, tab] of [
  ["regional-round-390", 390, 844, "Round day"],
  ["regional-timer-390", 390, 844, "APPE timer"],
  ["regional-log-390", 390, 844, "Real-round log"],
  ["regional-debrief-390", 390, 844, "Debrief"],
  ["regional-dayinfo-1280", 1280, 800, "Day info"],
  ["regional-round-1280", 1280, 800, "Round day"],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
  });
  await signInKatie(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/regional`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Competition Day" }).waitFor({
    timeout: 20000,
  });
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.waitForTimeout(600);
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
  await context.close();
}

await browser.close();
