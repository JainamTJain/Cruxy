/** 390 + 1280 shots: Prep notes from Drive on case Reading tab. */
import { chromium } from "playwright";
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
const LOCAL = join(process.cwd(), ".shots", "case-readings");
const MEMBER_PASS = "159753";
const STARTER = "482913";
const CASE9 = "c0000000-0000-4000-8000-000000000009";
mkdirSync(OUT, { recursive: true });
mkdirSync(LOCAL, { recursive: true });

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


async function dismissTour(page) {
  const skip = page.getByRole("button", { name: /Skip tour/i });
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(300);
  }
}

async function shoot(page, name) {
  await page.waitForTimeout(800);
  const art = join(OUT, name);
  const loc = join(LOCAL, name);
  await page.screenshot({ path: art, fullPage: true });
  copyFileSync(art, loc);
  console.log("wrote", name);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await signInKatie(ctx);
const page = await ctx.newPage();

await page.goto(`${BASE}/case-brain/${CASE9}?tab=reading`, {
  waitUntil: "networkidle",
  timeout: 90_000,
});
await dismissTour(page);
// CaseReadings mounts after the case text paints (readingExtrasReady).
await page.waitForTimeout(2500);
const heading = page.getByRole("heading", { name: /Prep notes from Drive/i });
try {
  await heading.waitFor({ timeout: 60_000 });
} catch (e) {
  const html = await page.content();
  console.log("PAGE TITLE", await page.title());
  console.log("BODY SNIP", html.slice(0, 2000));
  await page.screenshot({ path: join(OUT, "case-readings-debug.png"), fullPage: true });
  throw e;
}
await heading.scrollIntoViewIfNeeded();
await shoot(page, "case-readings-desktop-1280.png");

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await shoot(page, "case-readings-phone-390.png");

// Open edit on first key point if present.
const editBtn = page.getByRole("button", { name: /Edit key point/i }).first();
if (await editBtn.isVisible().catch(() => false)) {
  await editBtn.click();
  await page.waitForTimeout(400);
  await shoot(page, "case-readings-edit-390.png");
  await page.getByRole("button", { name: /^Cancel$/i }).click();
}

await browser.close();
console.log("case readings shots done");
