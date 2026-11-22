/**
 * Phone-width screenshots for guided consent voice enrollment.
 * Usage: USE_SAMPLE_DATA=1 npm run dev, then:
 *   node scripts/shot-consent-voice-390.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://127.0.0.1:3000";
const OUT = join(".shots", "consent-voice");
const STARTER = "482913";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const j = { "content-type": "application/json" };

const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
  .people;
const nick = people.find((p) => p.name === "Nick" || p.name.startsWith("Nick"));
if (!nick) throw new Error("Nick missing from sample people");

// Fresh sample person for consent: reset via sign-out then starter sign-in.
await ctx.request.post(`${BASE}/api/auth/sign-out`).catch(() => undefined);
let sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
  data: { personId: nick.id, code: STARTER },
  headers: j,
});
if (!sign.ok()) {
  // Already has a personal code in this sample store; try common member pass.
  sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: nick.id, code: "159753" },
    headers: j,
  });
}
if (!sign.ok()) {
  throw new Error(`Nick sign-in failed: ${sign.status()} ${await sign.text()}`);
}

await page.goto(`${BASE}/consent`, { waitUntil: "networkidle" });
// If already consented, force the page by clearing is not possible via API easily;
// sample store may redirect. Stay if we landed elsewhere.
if (!page.url().includes("/consent")) {
  // Create a disposable path: open consent UI by posting mustConsent isn't available.
  // Fall back to loading consent directly after sign-out of a never-consented seed.
  console.log(
    JSON.stringify({
      note: "Not on /consent after sign-in; person may already have consent in sample store",
      url: page.url(),
    }),
  );
}

await page.waitForSelector("text=Meet Cruxy", { timeout: 15000 });
const back = page.getByText("Back to the lamp");
if ((await back.count()) > 0) {
  await back.first().click().catch(() => {});
  await page.waitForTimeout(200);
}
await page.screenshot({
  path: join(OUT, "consent-intro-390.png"),
  fullPage: true,
});

const agree = page.getByRole("button", {
  name: /I agree: record my voice sample/i,
});
if ((await agree.count()) > 0) {
  await agree.click();
  await page.waitForSelector("text=Voice sample", { timeout: 10000 });
  await page.waitForSelector("text=Start recording", { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT, "consent-enroll-390.png"),
    fullPage: true,
  });
}

const hasMeterLabel = (await page.getByText(/Voice profile:/).count()) > 0;
const hasPassage = (await page.getByText(/Passage 1 of/).count()) > 0;
const hasStart = (await page.getByRole("button", { name: "Start recording" }).count()) > 0;
const hasTextOnly =
  (await page.getByText(/Not now: text only/).count()) > 0;

console.log(
  JSON.stringify({
    screenshots: {
      intro: join(OUT, "consent-intro-390.png"),
      enroll: join(OUT, "consent-enroll-390.png"),
    },
    hasMeterLabel,
    hasPassage,
    hasStart,
    hasTextOnly,
    url: page.url(),
  }),
);

await browser.close();
