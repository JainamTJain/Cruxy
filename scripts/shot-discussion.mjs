/** 390 + 1280 shots: Discussion panel on case + Team chat Whole team. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = "/opt/cursor/artifacts";
const MEMBER_PASS = "159753";
const STARTER = "482913";
const CASE9 = "c0000000-0000-4000-8000-000000000009";
const TEAM3 = "33333333-3333-3333-3333-333333333333";
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

const browser = await chromium.launch({ headless: true });

// Seed a general discussion reply so the panel is not empty
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const headers = await signInKatie(ctx);
  const threads = await (
    await ctx.request.get(
      `${BASE}/api/discussion/threads?caseId=${CASE9}&teamId=${TEAM3}`,
    )
  ).json();
  let generalId = (threads.threads ?? []).find((t) => t.kind === "general")?.id;
  if (!generalId) {
    const created = await (
      await ctx.request.post(`${BASE}/api/discussion/threads`, {
        data: {
          caseId: CASE9,
          teamId: TEAM3,
          kind: "general",
          targetId: "general",
          title: "General",
        },
        headers,
      })
    ).json();
    generalId = created.thread?.id;
  }
  if (generalId) {
    await ctx.request.post(`${BASE}/api/discussion/threads/${generalId}`, {
      data: { body: "Shot note: we still need to settle claim 2." },
      headers,
    });
  }
  // Confirm Whole team chat exists
  const chat = await (await ctx.request.get(`${BASE}/api/team/chat`)).json();
  if (!(chat.conversations ?? []).some((c) => c.kind === "whole_team")) {
    throw new Error("Whole team conversation missing after ensure");
  }
  await ctx.close();
}

for (const [w, h, tag] of [
  [390, 844, "390"],
  [1280, 800, "1280"],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await signInKatie(ctx);
  const page = await ctx.newPage();

  await page.goto(
    `${BASE}/case-brain/${CASE9}?tab=reading&team=${TEAM3}&discussion=1`,
    { waitUntil: "networkidle" },
  );
  await page.waitForTimeout(800);
  await page.screenshot({
    path: join(OUT, `discussion-case-${tag}.png`),
    fullPage: true,
  });

  await page.goto(`${BASE}/team/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(OUT, `discussion-team-chat-${tag}.png`),
    fullPage: true,
  });

  await ctx.close();
}

await browser.close();
console.log("shot-discussion: wrote discussion-* artifacts");
