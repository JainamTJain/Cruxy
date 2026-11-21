// Screenshot every Crux route next to its design reference.
// Usage: npm run dev (sample data) in one terminal, then: npm run shots
// Needs: npm i -D playwright && npx playwright install chromium
import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = ".shots";
const STARTER = "482913"; // sample-data starter only
const ADMIN_STARTER = process.env.SHOTS_ADMIN_CODE ?? "135790"; // sample INITIAL_ADMIN_CODE
const COACH_STARTER = "719304";
const MEMBER_PASS = "159753";
// Case 9 (GEM in the Rough): CaseBrain.html / OnePager.html reference
const CASE9 = "c0000000-0000-4000-8000-000000000009";
const TEAM3 = "33333333-3333-3333-3333-333333333333";
const CASE1 = "c0000000-0000-4000-8000-000000000001";

// Workstream D fixture ids (must match src/lib/practice/fixture-ids.ts)
const SESSION = "fe4b6f86-aaa4-4291-a98f-284e6d2a87f6";
const ROUND_LIVE = "713aa01e-66bc-4661-aa14-4413b502df17";
const ROUND_REPORT = "25dac835-5030-4a01-932c-9e71d513c724";

const PAIRS = [
  ["/sign-in", "Main.html", false, null],
  ["/home", "Home.html", true, "katie"],
  ["/revision/roadmap", "Roadmap.html", true, "katie"],
  [`/case-brain/${CASE9}`, "CaseBrain.html", true, "katie"],
  [`/revision/one-pagers?caseId=${CASE9}&teamId=${TEAM3}`, "OnePager.html", true, "katie"],
  ["/revision/questions", "Roadmap.html", true, "katie"],
  ["/library", "Reading.html", true, "katie"],
  // Workstream D parity screens (seeded Case 9 day)
  [`/practice/sessions/${SESSION}`, "Session.html", true, "drb-admin"],
  [`/practice/rounds/${ROUND_LIVE}`, "Practice.html", true, "katie"],
  [`/practice/rounds/${ROUND_REPORT}/report`, "Feedback.html", true, "katie"],
  ["/practice/drills/thesis", "DrillPhone.html", true, "katie"],
  ["/team", "TeamBoard.html", true, "katie"],
  ["/admin", "Admin.html", true, "jainam-admin"],
  ["/revision/flashcards", "FlashPhone.html", true, "katie"],
  ["/judging?demo=1", "JudgePhone.html", false, null],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

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

async function signIn(ctx, mode = "katie") {
  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const j = { "content-type": "application/json" };

  if (mode === "jainam-admin") {
    const jainam = people.find((p) => p.name === "Jainam");
    if (!jainam) throw new Error("Jainam not in people list");
    let r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: jainam.id, code: ADMIN_STARTER },
      headers: j,
    });
    if (!r.ok()) {
      r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
        data: { personId: jainam.id, code: MEMBER_PASS },
        headers: j,
      });
    }
    if (!r.ok()) throw new Error(`Jainam sign-in failed: ${r.status()}`);
    await finishOnboarding(ctx, j);
    await ctx.request.post(`${BASE}/api/auth/admin-view`, {
      data: { adminView: true },
      headers: j,
    });
    return;
  }

  if (mode === "drb-admin") {
    const drb = people.find((p) => p.name === "Dr. B" || p.name.startsWith("Dr"));
    if (!drb) throw new Error("Dr. B not in people list");
    let r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
      data: { personId: drb.id, code: MEMBER_PASS },
      headers: j,
    });
    if (!r.ok()) {
      r = await ctx.request.post(`${BASE}/api/auth/sign-in`, {
        data: { personId: drb.id, code: COACH_STARTER },
        headers: j,
      });
    }
    if (!r.ok()) throw new Error(`Dr. B sign-in failed: ${r.status()}`);
    await finishOnboarding(ctx, j);
    await ctx.request.post(`${BASE}/api/auth/admin-view`, {
      data: { adminView: true },
      headers: j,
    });
    return;
  }

  const katie = people.find((p) => p.name.startsWith("Katie"));
  if (!katie) throw new Error("Katie not in people list");
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
  if (!r.ok()) throw new Error(`Katie sign-in failed: ${r.status()}`);
  await finishOnboarding(ctx, j);
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
  for (const [route0, ref, needsAuth, authMode] of PAIRS) {
    if (needsAuth && authMode && authMode !== lastAuth) {
      await signIn(ctx, authMode);
      lastAuth = authMode;
    } else if (needsAuth && !lastAuth) {
      await signIn(ctx, authMode || "katie");
      lastAuth = authMode || "katie";
    }

    let route = route0;
    if (route0 === "/library") {
      route = await readingRoomRoute(ctx);
    }
    const name =
      route0 === "/library"
        ? "library_reading"
        : route.replace(/\//g, "_").replace(/^_/, "").replace(/[?&=]/g, "_") ||
          "root";
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      if (route === "/admin") {
        await page.waitForSelector("text=Running the program", { timeout: 15000 });
        await page.waitForTimeout(800);
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
      console.log("ERR", tag, route, String(e).slice(0, 120));
    }
  }
  await ctx.close();
}
await browser.close();
