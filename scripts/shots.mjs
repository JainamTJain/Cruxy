// Screenshot every Crux route next to its design reference.
// Usage: npm run dev (sample data) in one terminal, then: npm run shots
// Needs: npm i -D playwright && npx playwright install chromium
import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = ".shots";
const STARTER = "482913"; // sample-data starter only
// Case 9 (GEM in the Rough) — CaseBrain.html / OnePager.html reference
const CASE9 = "c0000000-0000-4000-8000-000000000009";
const TEAM3 = "33333333-3333-3333-3333-333333333333";
const CASE1 = "c0000000-0000-4000-8000-000000000001";
const PAIRS = [
  ["/sign-in", "Main.html", false],
  ["/home", "Home.html", true],
  ["/revision/roadmap", "Roadmap.html", true],
  [`/case-brain/${CASE9}`, "CaseBrain.html", true],
  [`/revision/one-pagers?caseId=${CASE9}&teamId=${TEAM3}`, "OnePager.html", true],
  ["/revision/questions", "Roadmap.html", true],
  ["/library", "Reading.html", true], // resolved to a file id after bootstrap
  ["/practice", "Practice.html", true],
  ["/practice/admin", "Session.html", true],
  ["/team", "TeamBoard.html", true],
  ["/admin", "Admin.html", true],
  ["/revision/flashcards", "FlashPhone.html", true],
  ["/judging", "JudgePhone.html", false],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function signIn(ctx) {
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json()).people;
  const katie = people.find((p) => p.name.startsWith("Katie"));
  const j = { "content-type": "application/json" };
  const r = await ctx.request.post(`${BASE}/api/auth/sign-in`, { data: { personId: katie.id, code: STARTER }, headers: j });
  if (r.ok()) {
    await ctx.request.post(`${BASE}/api/auth/consent`, { data: { recordingOk: false }, headers: j });
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, { data: { code: "159753", confirm: "159753" }, headers: j });
  } else {
    await ctx.request.post(`${BASE}/api/auth/sign-in`, { data: { personId: katie.id, code: "159753" }, headers: j });
  }
}

async function readingRoomRoute(ctx) {
  const res = await ctx.request.get(`${BASE}/api/library/files`);
  if (!res.ok()) return "/library";
  const data = await res.json();
  const files = data.files ?? [];
  const hit =
    files.find((f) => (f.case_numbers ?? []).includes(9)) ||
    files.find((f) => /GEM|case set|Rosetta/i.test(f.name || "")) ||
    files[0];
  return hit ? `/library/${hit.id}` : "/library";
}

for (const [w, h, tag] of [[1440, 1000, "desktop"], [390, 844, "phone"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.route("**/cruxy/*.png", (route) => {
    const f = join("public", new URL(route.request().url()).pathname);
    return existsSync(f) ? route.fulfill({ path: f }) : route.continue();
  });
  for (const [route0, ref, needsAuth] of PAIRS) {
    if (needsAuth && !(await ctx.cookies()).length) await signIn(ctx);
    let route = route0;
    if (route0 === "/library") {
      route = await readingRoomRoute(ctx);
    }
    const name =
      route0 === "/library"
        ? "library_reading"
        : route.replace(/\//g, "_").replace(/^_/, "").replace(/[?&=]/g, "_") || "root";
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
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
      await page.screenshot({ path: join(OUT, `${tag}-${name}-app.png`), fullPage: true });
      const html = readFileSync(join("docs/design/screens", ref), "utf8");
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.screenshot({ path: join(OUT, `${tag}-${name}-ref.png`), fullPage: true });
      console.log("ok", tag, route);
    } catch (e) {
      console.log("ERR", tag, route, String(e).slice(0, 120));
    }
  }
  await ctx.close();
}
await browser.close();
