/** Reading room shots at 390x844 and 1300x900 in sample mode. */
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

function longReadingText() {
  const para = (n) =>
    `Paragraph ${n}. Privacy claims need a clear public interest test before they override consent. Teams should weigh who is harmed, who benefits, and what a judge would ask next. The strongest answers name the stakeholders, state the tradeoff in one sentence, and keep a reply ready for the hard case. Courts, journalists and ethicists often disagree on where the line sits, so quote carefully and cite the source. A short example from the case set helps the panel see the stakes without wandering.`;
  // Enough words to split into several Part N passages (~600 words each).
  return Array.from({ length: 28 }, (_, i) => para(i + 1)).join("\n\n");
}

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
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json()).people;
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
  const skip = page.getByRole("button", { name: "Skip tour" });
  try {
    await skip.waitFor({ timeout: 3000 });
    await skip.click();
    await page.waitForTimeout(300);
  } catch {
    // Tour already done for this person.
  }
}

async function seedReading(ctx) {
  const res = await ctx.request.post(`${BASE}/api/case/extra-reading/import`, {
    multipart: {
      caseId: CASE9,
      teamId: TEAM3,
      title: "Public interest and consent, a deeper look",
      text: longReadingText(),
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`import ${res.status()} ${body}`);
  }
  const json = await res.json();
  const importId = json.importId;
  if (!importId) throw new Error("import missing importId");

  // Seed a highlight so Part N shows in the notes list.
  const ann = await ctx.request.post(`${BASE}/api/case/reading`, {
    data: {
      action: "add",
      caseId: CASE9,
      kind: "import",
      id: importId,
      annotationKind: "highlight",
      quote: "Privacy claims need a clear public interest test before they override consent.",
      passageOrd: 0,
    },
    headers: { "content-type": "application/json" },
  });
  if (!ann.ok()) {
    const body = await ann.text();
    throw new Error(`annotate ${ann.status()} ${body}`);
  }
  return importId;
}

const browser = await chromium.launch({ headless: true });

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await signInKatie(ctx);
  const importId = await seedReading(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/case-brain/${CASE9}/read/import/${importId}`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page.getByText("Jump to").waitFor({ timeout: 60_000 });
  await dismissTour(page);
  await page.getByRole("link", { name: "Part 1" }).first().waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /Notes \(/ }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(OUT, "reading-room-390.png"),
    fullPage: true,
  });
  console.log("wrote reading-room-390.png");

  await page.getByRole("button", { name: /Notes \(/ }).click({ force: true });
  await page.getByRole("heading", { name: "Sticky notes" }).waitFor({ timeout: 10_000 });
  await page.getByText("Part 1").first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: join(OUT, "reading-room-notes-390.png"),
    fullPage: false,
  });
  console.log("wrote reading-room-notes-390.png");
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await signInKatie(ctx);
  const importId = await seedReading(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/case-brain/${CASE9}/read/import/${importId}`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page.getByText("Jump to").waitFor({ timeout: 60_000 });
  await dismissTour(page);
  await page.getByRole("heading", { name: "Sticky notes" }).waitFor({ timeout: 10_000 });
  await page.getByRole("link", { name: "Part 1" }).first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(OUT, "reading-room-1300.png"),
    fullPage: true,
  });
  console.log("wrote reading-room-1300.png");
  await ctx.close();
}

await browser.close();
console.log("reading room shots done");
