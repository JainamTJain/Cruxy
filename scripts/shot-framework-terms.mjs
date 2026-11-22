/**
 * Wave 9 I follow-up: in-place framework underlines at 390 and 1280.
 * Usage: USE_SAMPLE_DATA=1 npm run start, then node scripts/shot-framework-terms.mjs
 */
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
        skip: true,
        dailyMinutes: 20,
        focusAreas: ["frameworks"],
        explanationStyle: "example_first",
        feedbackTone: "gentle",
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
  if (!r.ok()) throw new Error(`sign-in ${r.status()}`);
  await finishOnboarding(ctx);
}

async function dismissChrome(page) {
  // Skip first-run coach card
  const skip = page.getByRole("button", { name: /^skip$/i }).first();
  if (await skip.count()) await skip.click().catch(() => undefined);
  const closeChat = page.getByRole("button", { name: /close|back to the lamp/i }).first();
  if (await closeChat.count()) await closeChat.click().catch(() => undefined);
  // Click away floating Cruxy chat if open
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();
for (const [width, height] of [
  [390, 844],
  [1280, 800],
]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await signIn(ctx);
  const cases = await (await ctx.request.get(`${BASE}/api/case-brain/cases`)).json();
  const caseId = (cases.cases ?? [])[0]?.id;
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  const tid = me.person?.team_id ?? cases.myTeamId;
  const page = await ctx.newPage();

  await page.goto(
    `${BASE}/case-brain/${caseId}?teamId=${encodeURIComponent(tid)}`,
    { waitUntil: "networkidle" },
  );
  await dismissChrome(page);

  // Reading: open card with accountability / privacy underlines
  const reading = page.getByRole("tab", { name: /^reading$/i }).first();
  if (await reading.count()) {
    await reading.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }

  let mark = page
    .locator("button")
    .filter({ hasText: /accountability|privacy|stakeholder|kant|virtue/i })
    .first();
  if (await mark.count()) {
    await mark.scrollIntoViewIfNeeded().catch(() => undefined);
    await mark.click();
    await page.waitForTimeout(700);
  }
  await page.screenshot({
    path: join(OUT, `wave9-framework-case-${width}.png`),
    fullPage: false,
  });
  console.log("wrote case", width);

  // One pager: Kant / Virtue ethics strip
  const one = page.getByRole("tab", { name: /one pager/i }).first();
  if (await one.count()) {
    await one.click();
    await page.waitForTimeout(900);
    await dismissChrome(page);
    mark = page
      .locator("button")
      .filter({ hasText: /Kant|Virtue ethics|utilitarian|care ethics/i })
      .first();
    if (await mark.count()) {
      await mark.scrollIntoViewIfNeeded().catch(() => undefined);
      await mark.click();
      await page.waitForTimeout(900);
    } else {
      // Scroll down to framework strip area
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(400);
      mark = page
        .locator("button")
        .filter({ hasText: /Kant|Virtue|rights|privacy/i })
        .first();
      if (await mark.count()) {
        await mark.click();
        await page.waitForTimeout(900);
      }
    }
    await page.screenshot({
      path: join(OUT, `wave9-framework-onepager-${width}.png`),
      fullPage: false,
    });
    console.log("wrote onepager", width);
  }

  await ctx.close();
}
await browser.close();
