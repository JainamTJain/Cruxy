/**
 * Wave 9 D shots: my progress + privacy centre at 390 and 1280.
 * Usage: USE_SAMPLE_DATA=1 npm run dev, then node scripts/shot-wave9-growth.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://127.0.0.1:3000";
const OUT = join(".shots", "wave9-growth");
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

async function finishGates(ctx, page) {
  const j = { "content-type": "application/json" };
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (me.session?.mustConsent || !me.person?.consent_version) {
    await ctx.request.post(`${BASE}/api/auth/consent`, {
      data: { recordingOk: false },
      headers: j,
    });
  }
  // Learning profile
  await ctx.request.post(`${BASE}/api/learning-profile`, {
    data: {
      sliders: {
        visual_verbal: 55,
        analogies_formal: 40,
        ethical_mechanization: 35,
        short_deep: 60,
        direct_gentle: 45,
      },
      appeBaselines: {
        presentation_a: 6,
        presentation_b: 5,
        presentation_c: 5,
        commentary: 4,
        response_to_commentary: 5,
        response_to_judges: 4,
      },
    },
    headers: j,
  });
  const again = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (again.session?.mustChoosePasscode) {
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: MEMBER, confirm: MEMBER },
      headers: j,
    });
  }
  const existing = await (await ctx.request.get(`${BASE}/api/goals`)).json();
  const openCount = (existing.goals ?? []).filter((g) => g.status === "open")
    .length;
  if (openCount === 0) {
    await ctx.request.post(`${BASE}/api/goals`, {
      data: {
        title: "Answer judges in under 20 seconds",
        body: "Name the tension first, then the framework.",
        targetAppeItem: "response_to_judges",
      },
      headers: j,
    });
  }
}

async function shoot(width, height, tag) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width <= 500 ? 2 : 1,
    isMobile: width <= 500,
    hasTouch: width <= 500,
  });
  const page = await ctx.newPage();
  const j = { "content-type": "application/json" };

  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const person = people.find((p) => p.name.startsWith("Bethany")) ?? people[0];
  let sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: person.id, code: MEMBER },
    headers: j,
  });
  if (!sign.ok()) {
    sign = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: person.id, code: STARTER },
      headers: j,
    });
  }
  if (!sign.ok()) throw new Error(`sign-in failed ${sign.status()}`);
  await finishGates(ctx, page);

  await page.goto(`${BASE}/my-progress`, { waitUntil: "networkidle" });
  // Escape any leftover first-run gates.
  for (let i = 0; i < 3; i++) {
    const url = page.url();
    if (url.includes("/consent")) {
      await page.getByRole("button", { name: /Not now: text only/i }).click();
      await page.waitForTimeout(500);
    } else if (url.includes("/learning-profile")) {
      await page.getByRole("button", { name: /Save and continue/i }).click();
      await page.waitForTimeout(800);
    } else if (url.includes("/choose-passcode")) {
      break;
    } else break;
  }
  if (page.url().includes("/choose-passcode")) {
    // API should have cleared this; fallback navigate after cookie refresh.
    await page.goto(`${BASE}/my-progress`, { waitUntil: "networkidle" });
  }
  await page.getByRole("heading", { name: "My progress" }).waitFor({
    timeout: 20000,
  });
  await dismissCruxy(page);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT, `my-progress-${tag}.png`),
    fullPage: true,
  });

  await page.goto(`${BASE}/settings/privacy`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Privacy centre" }).waitFor({
    timeout: 15000,
  });
  await dismissCruxy(page);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT, `privacy-${tag}.png`),
    fullPage: true,
  });

  console.log(
    JSON.stringify({
      tag,
      width,
      url: page.url(),
      myProgress: join(OUT, `my-progress-${tag}.png`),
      privacy: join(OUT, `privacy-${tag}.png`),
      hasInventory: (await page.getByText("What we store").count()) > 0,
    }),
  );
  await browser.close();
}

await shoot(390, 844, "390");
await shoot(1280, 800, "1280");
