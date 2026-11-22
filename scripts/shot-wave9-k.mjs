/**
 * Wave 9 K shots: sign-in Forgot, Settings devices, Coach team (390 + 1280).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = join(".shots", "wave9-k");
const STARTER = "482913";
const COACH_STARTER = "719304";
const MEMBER_PASS = "159753";
const TEAM3 = "33333333-3333-3333-3333-333333333333";

mkdirSync(OUT, { recursive: true });

async function finishOnboarding(ctx, headers) {
  let me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (!me.authenticated) throw new Error("not authenticated after sign-in");
  if (me.session?.mustConsent || !me.person?.consent_version) {
    const r = await ctx.request.post(`${BASE}/api/auth/consent`, {
      data: { recordingOk: true },
      headers,
    });
    if (!r.ok()) throw new Error(`consent ${r.status()}`);
  }
  me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (me.session?.mustChoosePasscode) {
    const r = await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: MEMBER_PASS, confirm: MEMBER_PASS },
      headers,
    });
    if (!r.ok()) {
      // Already chosen
      const t = await r.text();
      if (!/already|match|passcode/i.test(t)) console.log("choose", t);
    }
  }
  me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (me.session?.mustSetLearningProfile) {
    const r = await ctx.request.post(`${BASE}/api/learning-profile`, {
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
    if (!r.ok()) console.log("learning-profile", r.status(), await r.text());
  }
  me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (
    me.session?.mustConsent ||
    me.session?.mustChoosePasscode ||
    me.session?.mustSetLearningProfile
  ) {
    console.log("still gated", me.session);
  }
}

async function signIn(ctx, mode) {
  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const headers = { "content-type": "application/json" };

  if (mode === "drb") {
    const drb = people.find((p) => p.name === "Dr. B" || p.name.startsWith("Dr"));
    if (!drb) throw new Error("Dr. B missing");
    // Prefer personal passcode if already chosen
    let r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: drb.id, code: MEMBER_PASS },
      headers,
    });
    if (!r.ok()) {
      r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
        data: { personId: drb.id, code: COACH_STARTER },
        headers,
      });
    }
    if (!r.ok()) throw new Error(`Dr. B sign-in failed ${r.status()}`);
    await finishOnboarding(ctx, headers);
    return;
  }

  const katie = people.find((p) => p.name === "Katie");
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
  if (!r.ok()) throw new Error(`Katie sign-in failed ${r.status()}`);
  await finishOnboarding(ctx, headers);
}

const browser = await chromium.launch();
for (const [w, h, tag] of [
  [1280, 800, "1280"],
  [390, 844, "390"],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();

  await ctx.clearCookies();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  try {
    await page.getByRole("button", { name: "Katie" }).click({ timeout: 4000 });
  } catch {
    /* optional */
  }
  await page.screenshot({
    path: join(OUT, `${tag}-sign-in-forgot.png`),
    fullPage: true,
  });
  console.log("ok", tag, "sign-in");

  await signIn(ctx, "katie");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  console.log(tag, "settings url", page.url());
  await page.screenshot({
    path: join(OUT, `${tag}-settings-devices.png`),
    fullPage: true,
  });
  console.log("ok", tag, "settings");

  await signIn(ctx, "drb");
  await page.goto(`${BASE}/coach/${TEAM3}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  console.log(tag, "coach url", page.url());
  await page.screenshot({
    path: join(OUT, `${tag}-coach-team3.png`),
    fullPage: true,
  });
  console.log("ok", tag, "coach");

  await ctx.close();
}
await browser.close();
console.log("wrote", OUT);
