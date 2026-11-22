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
  if (!me.authenticated) throw new Error("not authenticated after sign-in");
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

async function signIn(ctx) {
  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const katie = people.find((p) => p.name.startsWith("Katie"));
  if (!katie) throw new Error("Katie missing");
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
}

const pages = [
  ["/revision/roadmap", "wave8-roadmap"],
  ["/team/roles", "wave8-roles"],
  ["/team/chat", "wave8-chat"],
];
const widths = [390, 1280];

for (const w of widths) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w === 390 ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  await signIn(ctx);
  const page = await ctx.newPage();
  for (const [path, name] of pages) {
    page.on("pageerror", (err) => console.error("pageerror", path, err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("console", path, msg.text());
    });
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (path.includes("roadmap")) {
      await page.getByRole("heading", { name: "My roadmap" }).waitFor({ timeout: 30000 });
    } else if (path.includes("roles")) {
      await page.getByRole("heading", { name: "Roles board" }).waitFor({ timeout: 30000 });
    } else if (path.includes("chat")) {
      await page.getByRole("heading", { name: "Team chat" }).waitFor({ timeout: 30000 });
      await page.getByText("Whole team").first().waitFor({ timeout: 30000 });
      // Wait until the thread has either messages or the empty state after load
      await page
        .locator("section")
        .filter({ hasText: "Whole team" })
        .last()
        .waitFor({ timeout: 30000 });
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(500);
    const file = `${OUT}/${name}-${w}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log("wrote", file);
  }
  await ctx.close();
}

await browser.close();
