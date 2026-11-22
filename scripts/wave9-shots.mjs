import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/opt/cursor/artifacts";
const STARTER = "482913";
const MEMBER_PASS = "159753";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const j = { "content-type": "application/json" };

async function finishOnboarding(ctx) {
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (!me.authenticated) throw new Error("not authenticated");
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
      headers: j,
    });
  }
}

async function signIn(ctx) {
  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  // Jainam is tech admin + often a lead; Katie is member
  const katie = people.find((p) => p.name.startsWith("Katie"));
  let r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: katie.id, code: MEMBER_PASS },
    headers: j,
  });
  if (!r.ok()) {
    r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: katie.id, code: STARTER },
      headers: j,
    });
  }
  if (!r.ok()) throw new Error(`sign-in failed ${r.status()}`);
  await finishOnboarding(ctx);

  // Seed a poll/event if Katie is lead; otherwise still fine
  const starts = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16);
  const starts2 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16);
  await ctx.request.post(`${BASE}/api/team/calendar`, {
    data: {
      action: "create_poll",
      title: "Practice this week",
      slots: [
        { startsAt: new Date(starts).toISOString() },
        { startsAt: new Date(starts2).toISOString() },
      ],
    },
    headers: j,
  });
  await ctx.request.post(`${BASE}/api/team/kudos`, {
    data: {
      toPersonId: people.find((p) => p.name === "Nick")?.id,
      note: "Clear opening on Case 9. Keep that pace.",
    },
    headers: j,
  });
}

const pages = [
  ["/team/calendar", "wave9-calendar"],
  ["/team/roles", "wave9-roles-workload"],
  ["/team/kudos", "wave9-kudos"],
  ["/progress", "wave9-progress"],
];

for (const w of [390, 1280]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w === 390 ? 844 : 900 },
  });
  await signIn(ctx);
  const page = await ctx.newPage();
  for (const [path, name] of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: `${OUT}/${name}-${w}.png`,
      fullPage: true,
    });
    console.log("wrote", `${name}-${w}.png`);
  }
  await ctx.close();
}

await browser.close();
