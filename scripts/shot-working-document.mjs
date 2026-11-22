/** 390 + 1280 shots of Working document (empty + started). */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = "/opt/cursor/artifacts";
const MEMBER_PASS = "159753";
const STARTER = "482913";
const CASE9 = "c0000000-0000-4000-8000-000000000009";
const TEAM3 = "33333333-3333-3333-3333-333333333333";
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
  return headers;
}

const browser = await chromium.launch({ headless: true });
const path = `/case-brain/${CASE9}/working?team=${TEAM3}`;

// Empty choice (may already be started in sample if prior run — still useful)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await signInKatie(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: join(OUT, "working-doc-empty-390.png"),
    fullPage: true,
  });
  console.log("wrote working-doc-empty-390.png");
  await ctx.close();
}

// Start Crux path then shoot sections
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const headers = await signInKatie(ctx);
  await ctx.request.post(`${BASE}/api/case/working-document`, {
    data: { action: "start_crux", caseId: CASE9, teamId: TEAM3 },
    headers,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Working document" }).first().waitFor({
    timeout: 20000,
  });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(OUT, "working-doc-crux-390.png"),
    fullPage: true,
  });
  console.log("wrote working-doc-crux-390.png");
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await signInKatie(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(OUT, "working-doc-crux-1280.png"),
    fullPage: true,
  });
  console.log("wrote working-doc-crux-1280.png");
  await ctx.close();
}

await browser.close();
