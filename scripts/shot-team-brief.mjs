/**
 * Phone + desktop shots of Team Brief (Case 9).
 * Expects npm run dev on :3000 with sample data.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = "/opt/cursor/artifacts";
const MEMBER_PASS = "159753";
const STARTER = "482913";
const CASE9 = "c0000000-0000-4000-8000-000000000009";

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
}

async function signInKatie(ctx) {
  await ctx.clearCookies();
  const headers = { "content-type": "application/json" };
  const peopleRes = await ctx.request.get(`${BASE}/api/auth/people`);
  const people = (await peopleRes.json()).people ?? [];
  const katie = people.find((p) => p.name.startsWith("Katie"));
  if (!katie) throw new Error("Katie not in people list");
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
  if (!r.ok()) throw new Error(`Katie sign-in failed: ${r.status()}`);
  await finishOnboarding(ctx, headers);
}

const browser = await chromium.launch({ headless: true });

for (const [name, width, height] of [
  ["team-brief-390", 390, 844],
  ["team-brief-1280", 1280, 800],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await signInKatie(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/case-brain/${CASE9}`, { waitUntil: "networkidle" });
  const briefTab = page.getByRole("button", { name: "Team Brief" });
  if (await briefTab.count()) await briefTab.first().click();
  await page.getByText("Agreed stance").first().waitFor({ timeout: 20000 });
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
  await context.close();
}

await browser.close();
