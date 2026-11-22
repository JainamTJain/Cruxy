/** Wave 9 I: settings display shots at 390 and 1280. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
const STARTER = "482913";
const MEMBER_PASS = "159753";

mkdirSync(OUT, { recursive: true });

async function finishOnboarding(ctx) {
  const headers = { "content-type": "application/json" };
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (!me.authenticated) return;
  if (me.session?.mustConsent || !me.person?.consent_version) {
    await ctx.request.post(`${BASE}/api/auth/consent`, {
      data: { recordingOk: true },
      headers,
    });
  }
  const again = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (again.session?.mustSetLearningProfile) {
    await ctx.request.post(`${BASE}/api/learning-profile`, {
      data: {
        sliders: {
          visual_verbal: 50,
          analogies_formal: 50,
          ethical_mechanization: 50,
          short_deep: 50,
          direct_gentle: 50,
        },
        appeBaselines: {},
      },
      headers,
    });
  }
  const third = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (third.session?.mustChoosePasscode) {
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: MEMBER_PASS, confirm: MEMBER_PASS },
      headers,
    });
  }
}

async function signIn(ctx) {
  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const katie = people.find((p) => p.name === "Katie");
  const headers = { "content-type": "application/json" };
  let r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: katie.id, code: STARTER },
    headers,
  });
  if (!r.ok()) {
    r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: katie.id, code: MEMBER_PASS },
      headers,
    });
  }
  await finishOnboarding(ctx);
}

const browser = await chromium.launch();
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 800 },
  });
  await signIn(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const path = join(OUT, `wave9-access-settings-${width}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
  await ctx.close();
}
await browser.close();
