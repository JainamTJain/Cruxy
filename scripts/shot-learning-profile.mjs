/**
 * Learning profile v2 screenshots at 390px and 1280px.
 * First-run form + Settings My profile.
 * Usage: USE_SAMPLE_DATA=1 npm run dev, then:
 *   node scripts/shot-learning-profile.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://127.0.0.1:3000";
const OUT = join(".shots", "learning-profile");
const STARTER = "482913";
const MEMBER = "159753";

mkdirSync(OUT, { recursive: true });

async function dismissCruxy(page) {
  const skip = page.getByText("Skip", { exact: true });
  if ((await skip.count()) > 0) {
    await skip.first().click().catch(() => {});
    await page.waitForTimeout(150);
  }
  const back = page.getByText("Back to the lamp");
  if ((await back.count()) > 0) {
    await back.first().click().catch(() => {});
    await page.waitForTimeout(150);
  }
}

async function signInFresh(ctx, nameHint = "Quixote") {
  const j = { "content-type": "application/json" };
  await ctx.request.post(`${BASE}/api/auth/sign-out`).catch(() => undefined);
  const people = (
    await (await ctx.request.get(`${BASE}/api/auth/people`)).json()
  ).people;
  const person =
    people.find((p) => p.name === nameHint || p.name.startsWith(nameHint)) ??
    people[0];
  if (!person) throw new Error("person missing");
  let sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: person.id, code: STARTER },
    headers: j,
  });
  if (!sign.ok()) {
    sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: person.id, code: MEMBER },
      headers: j,
    });
  }
  if (!sign.ok()) {
    throw new Error(`sign-in failed: ${sign.status()} ${await sign.text()}`);
  }
  return person;
}

async function shootFirstRun(width, height, name) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width <= 500 ? 2 : 1,
    isMobile: width <= 500,
    hasTouch: width <= 500,
  });
  const page = await ctx.newPage();
  await signInFresh(ctx, "Quixote");

  await page.goto(`${BASE}/learning-profile`, { waitUntil: "networkidle" });
  if (page.url().includes("/consent")) {
    await page.getByRole("button", { name: /Not now: text only/i }).click();
    await page.waitForTimeout(800);
    await page.goto(`${BASE}/learning-profile`, { waitUntil: "networkidle" });
  }

  await page.getByRole("heading", { name: /How Cruxy should help you/i }).waitFor({
    timeout: 20000,
  });
  await page.getByText("On a normal weekday until Dec 5").waitFor({
    state: "attached",
    timeout: 10000,
  });
  await dismissCruxy(page);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT, `learning-profile-${name}.png`),
    fullPage: true,
  });

  console.log(
    JSON.stringify({
      tag: name,
      firstRun: join(OUT, `learning-profile-${name}.png`),
    }),
  );
  await browser.close();
}

async function shootSettings(width, height, name) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width <= 500 ? 2 : 1,
    isMobile: width <= 500,
    hasTouch: width <= 500,
  });
  const page = await ctx.newPage();
  const j = { "content-type": "application/json" };
  const person = await signInFresh(ctx, "Bethany");

  // Clear gates so Settings loads.
  await ctx.request.post(`${BASE}/api/auth/consent`, {
    data: { recordingOk: true },
    headers: j,
  });
  await ctx.request.post(`${BASE}/api/learning-profile`, {
    data: {
      dailyMinutes: 20,
      focusAreas: ["answering_judges"],
      explanationStyle: "example_first",
      feedbackTone: "gentle",
    },
    headers: j,
  });
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (me.session?.mustChoosePasscode) {
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: MEMBER, confirm: MEMBER },
      headers: j,
    });
  }
  // Re-sign with personal code so the page cookie matches.
  await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: person.id, code: MEMBER },
    headers: j,
  });

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  for (let i = 0; i < 4; i++) {
    const url = page.url();
    if (url.includes("/sign-in")) {
      await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
      break;
    }
    if (url.includes("/consent")) {
      await page.getByRole("button", { name: /Not now: text only|I agree/i }).first().click();
      await page.waitForTimeout(500);
    } else if (url.includes("/learning-profile")) {
      await page.getByRole("button", { name: /Skip for now|Save and continue/i }).first().click();
      await page.waitForTimeout(800);
    } else if (url.includes("/choose-passcode")) {
      break;
    } else break;
  }
  if (!page.url().includes("/settings")) {
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  }
  await page.getByRole("heading", { name: "My profile" }).waitFor({
    timeout: 20000,
  });
  await dismissCruxy(page);
  await page.locator("#my-profile").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT, `settings-profile-${name}.png`),
    fullPage: true,
  });

  console.log(
    JSON.stringify({
      tag: name,
      person: person.name,
      url: page.url(),
      settings: join(OUT, `settings-profile-${name}.png`),
    }),
  );
  await browser.close();
}

await shootFirstRun(390, 844, "390");
await shootFirstRun(1280, 800, "1280");
await shootSettings(390, 844, "390");
await shootSettings(1280, 800, "1280");
