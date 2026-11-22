/**
 * Learning profile screenshots at 390px and 1280px.
 * Usage: USE_SAMPLE_DATA=1 npm run dev, then:
 *   node scripts/shot-learning-profile.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://127.0.0.1:3000";
const OUT = join(".shots", "learning-profile");
const STARTER = "482913";

mkdirSync(OUT, { recursive: true });

async function dismissCruxy(page) {
  const back = page.getByText("Back to the lamp");
  if ((await back.count()) > 0) {
    await back.first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function signInFresh(ctx) {
  const j = { "content-type": "application/json" };
  await ctx.request.post(`${BASE}/api/auth/sign-out`).catch(() => undefined);
  const people = (
    await (await ctx.request.get(`${BASE}/api/auth/people`)).json()
  ).people;
  const person = people.find(
    (p) => p.name === "Quixote" || p.name.startsWith("Quixote"),
  );
  if (!person) throw new Error("Quixote missing");
  let sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: person.id, code: STARTER },
    headers: j,
  });
  if (!sign.ok()) {
    sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: person.id, code: "159753" },
      headers: j,
    });
  }
  if (!sign.ok()) {
    throw new Error(`sign-in failed: ${sign.status()} ${await sign.text()}`);
  }
  return person;
}

async function shoot(width, height, name) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width <= 500 ? 2 : 1,
    isMobile: width <= 500,
    hasTouch: width <= 500,
  });
  const page = await ctx.newPage();
  await signInFresh(ctx);

  // Skip consent if needed so we can reach learning profile.
  await page.goto(`${BASE}/learning-profile`, { waitUntil: "networkidle" });
  if (page.url().includes("/consent")) {
    await page.getByRole("button", { name: /Not now: text only/i }).click();
    await page.waitForURL(/learning-profile|choose-passcode|home/, {
      timeout: 15000,
    });
    if (!page.url().includes("/learning-profile")) {
      await page.goto(`${BASE}/learning-profile`, { waitUntil: "networkidle" });
    }
  }

  await page.waitForSelector("text=How you learn", { timeout: 15000 });
  await dismissCruxy(page);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT, `learning-profile-${name}.png`),
    fullPage: true,
  });

  const hasSliders =
    (await page.getByText("Visual").count()) > 0 &&
    (await page.getByText("Verbal").count()) > 0;
  const hasAppe = (await page.getByText("Your APPE baselines").count()) > 0;

  // Settings (may need passcode/consent done). Save profile first with defaults.
  await page.getByRole("button", { name: /Save and continue|Save learning profile/i }).click();
  await page.waitForTimeout(800);

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  if (page.url().includes("/choose-passcode")) {
    // Pick a valid personal code for sample.
    for (const digit of "246810") {
      await page.getByRole("button", { name: digit }).click().catch(() => {});
    }
    // Keypad may use different UI; skip settings shot if gated.
  }
  if (page.url().includes("/settings")) {
    await dismissCruxy(page);
    await page.waitForSelector("text=Learning profile", { timeout: 10000 });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(OUT, `settings-profile-${name}.png`),
      fullPage: true,
    });
  }

  console.log(
    JSON.stringify({
      width,
      hasSliders,
      hasAppe,
      firstRunShot: join(OUT, `learning-profile-${name}.png`),
      url: page.url(),
    }),
  );
  await browser.close();
}

// Fresh store expected from caller.
await shoot(390, 844, "390");
await shoot(1280, 800, "1280");
