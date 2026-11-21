/**
 * Phone-width screenshot for Wave 6 required score predictions.
 * Usage: USE_SAMPLE_DATA=1 npm run dev, then: node scripts/shot-predictions-phone.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://127.0.0.1:3000";
const OUT = join(".shots", "wave6");
const STARTER = "482913";
const MEMBER_PASS = "159753";

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

async function finishOnboarding() {
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (!me.authenticated) return;
  if (me.session?.mustConsent || !me.person?.consent_version) {
    await ctx.request.post(`${BASE}/api/auth/consent`, {
      data: { recordingOk: true },
      headers: j,
    });
  }
  const again = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (again.session?.mustChoosePasscode) {
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: MEMBER_PASS, confirm: MEMBER_PASS },
      headers: j,
    });
  }
}

const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
  .people;
const katie = people.find((p) => p.name === "Katie" || p.name.startsWith("Katie"));
if (!katie) throw new Error("Katie missing from sample people");

let sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
  data: { personId: katie.id, code: MEMBER_PASS },
  headers: j,
});
if (!sign.ok()) {
  sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: katie.id, code: STARTER },
    headers: j,
  });
}
if (!sign.ok()) {
  throw new Error(`Katie sign-in failed: ${sign.status()} ${await sign.text()}`);
}
await finishOnboarding();

const sessionsRes = await ctx.request.get(`${BASE}/api/practice/sessions`);
if (!sessionsRes.ok()) {
  throw new Error(`sessions list failed: ${sessionsRes.status()}`);
}
const cases = (await sessionsRes.json()).cases;
const active = (cases ?? []).find((c) => c.active) ?? cases?.[0];
const createdRes = await ctx.request.post(`${BASE}/api/practice/sessions`, {
  data: {
    kind: "member_practice",
    title: "Wave 6 prediction check",
    mode: "solo_speech",
    rounds: [
      {
        caseId: active?.id ?? null,
        caseNumber: active?.number ?? 1,
        teamIds: katie.team_id ? [katie.team_id] : [],
        sides: { presenting: katie.team_id ?? null, commenting: null },
        moderator: "cruxy",
        judges: { humans: [], cruxy: true },
        mode: "solo_speech",
      },
    ],
  },
  headers: j,
});
const created = await createdRes.json();
if (!createdRes.ok()) {
  throw new Error(`create session failed: ${JSON.stringify(created)}`);
}

const roundId = created.rounds?.[0]?.id ?? created.session?.rounds?.[0]?.id;
if (!roundId) throw new Error(`No round id: ${JSON.stringify(created)}`);

await page.goto(`${BASE}/practice/rounds/${roundId}`, {
  waitUntil: "networkidle",
});
await page.waitForSelector("text=Predict your scores", { timeout: 15000 });
await page.waitForTimeout(400);
await page.screenshot({
  path: join(OUT, "predictions-setup-390.png"),
  fullPage: true,
});

const hasPredict = await page.getByText("Predict your scores").count();
const hasWaiting = await page
  .getByText(/Waiting on predictions|Ready to start|Lock my prediction/)
  .count();
console.log(
  JSON.stringify({
    roundId,
    screenshot: join(OUT, "predictions-setup-390.png"),
    hasPredictHeading: hasPredict > 0,
    hasGateCopy: hasWaiting > 0,
  }),
);

await browser.close();
