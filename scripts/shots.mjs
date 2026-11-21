// Screenshot every Crux route next to its design reference.
// Usage: npm run dev (sample data) in one terminal, then: npm run shots
// Needs: npm i -D playwright && npx playwright install chromium
import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = ".shots";
const MEMBER_STARTER = "482913";
const COACH_STARTER = "719304";
const PERSONAL = "159753";
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
  ["/home", "Home.html", true, "katie"],
  ["/revision/roadmap", "Roadmap.html", true, "katie"],
  [`/case-brain/${CASE1}`, "CaseBrain.html", true, "katie"],
  ["/revision/one-pagers", "OnePager.html", true, "katie"],
  ["/revision/questions", "Roadmap.html", true, "katie"],
  ["/library", "Reading.html", true, "katie"],
  [`/practice/sessions/${SESSION}`, "Session.html", true, "drb-admin"],
  [`/practice/rounds/${ROUND_LIVE}`, "Practice.html", true, "katie"],
  [`/practice/rounds/${ROUND_REPORT}/report`, "Feedback.html", true, "katie"],
  ["/practice/drills/thesis", "DrillPhone.html", true, "katie"],
  ["/team", "TeamBoard.html", true, "katie"],
  ["/admin", "Admin.html", true, "drb-admin"],
  ["/revision/flashcards", "FlashPhone.html", true, "katie"],
  ["/judging?demo=1", "JudgePhone.html", false],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function ensureSignedIn(ctx, mode = "katie") {
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  const wantAdmin = mode === "drb-admin";
  const wantName = mode === "drb-admin" ? "Dr. B" : "Katie";
  if (
    me.authenticated &&
    me.session?.name?.startsWith(wantName.split(" ")[0]) &&
    Boolean(me.session?.adminView) === wantAdmin
  ) {
    return;
  }

  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const person =
    mode === "drb-admin"
      ? people.find((p) => p.name === "Dr. B" || p.name.startsWith("Dr"))
      : people.find((p) => p.name.startsWith("Katie"));
  if (!person) throw new Error(`No person for mode ${mode}`);

  const j = { "content-type": "application/json" };
  const starter = mode === "drb-admin" ? COACH_STARTER : MEMBER_STARTER;

  let r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId: person.id, code: PERSONAL },
    headers: j,
  });
  if (!r.ok()) {
    r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: person.id, code: starter },
      headers: j,
    });
    if (!r.ok()) {
      const err = await r.text();
      throw new Error(`sign-in failed for ${person.name}: ${err}`);
    }
    const body = await r.json();
    if (body.mustConsent) {
      await ctx.request.post(`${BASE}/api/auth/consent`, {
        data: { recordingOk: true },
        headers: j,
      });
    }
    if (body.mustChoosePasscode) {
      await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
        data: { code: PERSONAL, confirm: PERSONAL },
        headers: j,
      });
    }
  }

  if (wantAdmin) {
    const av = await ctx.request.post(`${BASE}/api/auth/admin-view`, {
      data: { adminView: true },
      headers: j,
    });
    if (!av.ok()) {
      throw new Error(`admin-view failed: ${await av.text()}`);
    }
  }

  const check = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (!check.authenticated) {
    throw new Error(`still unauthenticated after sign-in (${mode})`);
  }
  console.log("signed in", check.session?.name, "admin", check.session?.adminView);
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

  let lastAuth = null;
  for (const [route, ref, needsAuth, authMode] of PAIRS) {
    if (needsAuth) {
      if (lastAuth !== authMode) {
        await ensureSignedIn(ctx, authMode ?? "katie");
        lastAuth = authMode ?? "katie";
      }
    }
    const name =
      route.replace(/\?.*/, "").replace(/\//g, "_").replace(/^_/, "") || "root";
    try {
      await page.goto(BASE + route, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      // Wait past client redirects to sign-in
      await page.waitForTimeout(400);
      if (page.url().includes("/sign-in") && needsAuth) {
        await ensureSignedIn(ctx, authMode ?? "katie");
        lastAuth = authMode ?? "katie";
        await page.goto(BASE + route, {
          waitUntil: "networkidle",
          timeout: 60000,
        });
      }
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
      if (route.includes("judging") || route.includes("practice")) {
        await page.waitForTimeout(600);
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
      console.log("ok", tag, route, "→", page.url().replace(BASE, ""));
    } catch (e) {
      console.log("ERR", tag, route, String(e).slice(0, 200));
    }
  }
  await ctx.close();
}
await browser.close();
