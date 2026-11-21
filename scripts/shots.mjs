// Screenshot every Crux route next to its design reference.
// Usage: npm run dev (sample data) in one terminal, then: npm run shots
// Needs: npm i -D playwright && npx playwright install chromium
import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = ".shots";
const STARTER = "482913"; // sample-data starter only
// Case 1 stable sample-data id (Workstream B seed)
const CASE1 = "c0000000-0000-4000-8000-000000000001";

function seedUuid(key) {
  const h = createHash("sha256").update(`crux-seed-v1:${key}`).digest();
  const bytes = Buffer.from(h.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const SESSION = seedUuid("practice:session:nov24");
const ROUND_LIVE = seedUuid("practice:round:case9:live");
const ROUND_REPORT = seedUuid("practice:round:case9:report");

const PAIRS = [
  ["/sign-in", "Main.html", false],
  ["/home", "Home.html", true],
  ["/revision/roadmap", "Roadmap.html", true],
  [`/case-brain/${CASE1}`, "CaseBrain.html", true],
  ["/revision/one-pagers", "OnePager.html", true],
  ["/revision/questions", "Roadmap.html", true],
  ["/library", "Reading.html", true],
  [`/practice/sessions/${SESSION}`, "Session.html", true, "jainam-admin"],
  [`/practice/rounds/${ROUND_LIVE}`, "Practice.html", true],
  [`/practice/rounds/${ROUND_REPORT}/report`, "Feedback.html", true],
  ["/practice/drills/thesis", "DrillPhone.html", true],
  ["/team", "TeamBoard.html", true],
  ["/admin", "Admin.html", true],
  ["/revision/flashcards", "FlashPhone.html", true],
  ["/judging?demo=1", "JudgePhone.html", false],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function signIn(ctx, mode = "katie") {
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json()).people;
  const person =
    mode === "jainam-admin"
      ? people.find((p) => p.name.startsWith("Jainam"))
      : people.find((p) => p.name.startsWith("Katie"));
  const j = { "content-type": "application/json" };
  const r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: person.id, code: STARTER },
    headers: j,
  });
  if (r.ok()) {
    await ctx.request.post(`${BASE}/api/auth/consent`, {
      data: { recordingOk: true },
      headers: j,
    });
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: "159753", confirm: "159753" },
      headers: j,
    });
  } else {
    await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: person.id, code: "159753" },
      headers: j,
    });
  }
  if (mode === "jainam-admin") {
    await ctx.request.post(`${BASE}/api/auth/admin-view`, {
      data: { adminView: true },
      headers: j,
    });
  }
}

for (const [w, h, tag] of [
  [1440, 1000, "desktop"],
  [390, 844, "phone"],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.route("**/cruxy/*.png", (route) => {
    const f = join("public", new URL(route.request().url()).pathname);
    return existsSync(f) ? route.fulfill({ path: f }) : route.continue();
  });
  for (const [route, ref, needsAuth, authMode] of PAIRS) {
    if (needsAuth) {
      await ctx.clearCookies();
      await signIn(ctx, authMode ?? "katie");
    }
    const name = route
      .replace(/\?.*/, "")
      .replace(/\//g, "_")
      .replace(/^_/, "") || "root";
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
      // One pagers default to Team 1; seeded content is Team 3.
      if (route.includes("one-pagers")) {
        const teamSelect = page.locator("select").first();
        if (await teamSelect.count()) {
          await teamSelect.selectOption({ label: "Team 3" });
          await page.waitForTimeout(500);
        }
      }
      if (route.includes("questions") || route.includes("flashcards")) {
        const caseSelect = page.locator("select").first();
        if (await caseSelect.count()) {
          const opts = await caseSelect.locator("option").allTextContents();
          const hit = opts.find((t) => /01\s|CTRL/i.test(t));
          if (hit) {
            await caseSelect.selectOption({ label: hit.trim() });
            await page.waitForTimeout(500);
          }
        }
      }
      if (route.includes("judging")) {
        await page.waitForTimeout(800);
      }
      await page.screenshot({
        path: join(OUT, `${tag}-${name}-app.png`),
        fullPage: true,
      });
      const html = readFileSync(join("docs/design/screens", ref), "utf8");
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.screenshot({
        path: join(OUT, `${tag}-${name}-ref.png`),
        fullPage: true,
      });
      console.log("ok", tag, route);
    } catch (e) {
      console.log("ERR", tag, route, String(e).slice(0, 160));
    }
  }
  await ctx.close();
}
await browser.close();
