/**
 * Screenshots for three-part voice enrollment (390 + 1280).
 * Usage: production `npm run start` or `npm run dev` with USE_SAMPLE_DATA=1, then:
 *   node scripts/shot-voiceprint.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://127.0.0.1:3000";
const OUT = join(".shots", "voiceprint");
const STARTER = "482913";

mkdirSync(OUT, { recursive: true });

async function signInFresh(ctx) {
  const j = { "content-type": "application/json" };
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  // Prefer someone still on first-run consent when possible.
  const person =
    people.find((p) => p.name.startsWith("Bethany")) ||
    people.find((p) => p.name.startsWith("Quixote")) ||
    people[0];
  if (!person) throw new Error("No sample people");
  await ctx.request.post(`${BASE}/api/auth/sign-out`).catch(() => undefined);
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

async function shot(width, height, name) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width <= 400 ? 2 : 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
  });
  await signInFresh(ctx);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/consent`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: join(OUT, `${name}-consent-intro.png`),
    fullPage: true,
  });

  const agree = page.getByRole("button", {
    name: /I agree: record my voice sample/i,
  });
  if (await agree.count()) {
    await agree.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({
    path: join(OUT, `${name}-enroll-part1.png`),
    fullPage: true,
  });

  // Settings path for people past consent: open re-record if available.
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  if (page.url().includes("/settings")) {
    const reRecord = page.getByRole("button", { name: /Re-record my voice/i });
    if (await reRecord.count()) {
      await reRecord.click();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(OUT, `${name}-settings-rerecord.png`),
        fullPage: true,
      });
    }
  }

  await browser.close();
  console.log(JSON.stringify({ ok: true, width, out: OUT }));
}

await shot(390, 844, "390");
await shot(1280, 800, "1280");
