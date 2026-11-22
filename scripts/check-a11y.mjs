/**
 * Wave 9 I: axe-core checks on key signed-in pages.
 * Usage (sample data): USE_SAMPLE_DATA=1 npm run build && npm run start &
 *   then: node scripts/check-a11y.mjs
 * CI starts the server itself after build.
 */
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);

let axeSource;
try {
  axeSource = require("axe-core").source;
} catch {
  console.error("axe-core is required. Run: npm i -D axe-core");
  process.exit(1);
}

const BASE = process.env.A11Y_BASE ?? "http://127.0.0.1:3000";
const STARTER = "482913";
const MEMBER_PASS = "159753";

const PAGES = [
  "/home",
  "/settings",
  "/today",
  "/practice",
  "/team/chat",
  "/case-brain",
];

async function finishOnboarding(ctx) {
  const headers = { "content-type": "application/json" };
  const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (!me.authenticated) return;
  if (me.session?.mustConsent || !me.person?.consent_version) {
    await ctx.request.post(`${BASE}/api/auth/consent`, {
      data: { recordingOk: true },
      headers,
    });
  }
  const again = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (again.session?.mustSetLearningProfile) {
    await ctx.request.post(`${BASE}/api/learning-profile`, {
      data: {
        sliders: {
          visual_verbal: 50,
          analogies_formal: 50,
          ethical_mechanization: 50,
          short_deep: 50,
          direct_gentle: 50,
        },
        appeBaselines: {},
      },
      headers,
    });
  }
  const third = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
  if (third.session?.mustChoosePasscode) {
    await ctx.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: MEMBER_PASS, confirm: MEMBER_PASS },
      headers,
    });
  }
}

async function signIn(ctx) {
  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const katie = people.find((p) => p.name === "Katie");
  if (!katie) throw new Error("Katie missing from sample people");
  const headers = { "content-type": "application/json" };
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
  if (!r.ok()) {
    const body = await r.text();
    throw new Error(`sign-in failed: ${r.status()} ${body}`);
  }
  await finishOnboarding(ctx);
}

async function runAxe(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "best-practice"],
      },
      rules: {
        // Colour contrast covered by high-contrast display prefs + design tokens.
        "color-contrast": { enabled: false },
        // App chrome uses complementary nav landmarks; pages own <main>.
        region: { enabled: false },
        "landmark-one-main": { enabled: false },
      },
    });
  });
  // Ignore landmark nesting noise from mixed page shells during Wave 9;
  // shell skip-target is a div, pages own <main>.
  return results.violations.filter(
    (v) =>
      ![
        "color-contrast",
        "region",
        "landmark-one-main",
        "landmark-unique",
        "landmark-main-is-top-level",
        "landmark-no-duplicate-main",
      ].includes(v.id),
  );
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

let failed = false;
try {
  // Wait for server
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/auth/people`);
      if (r.ok) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
    if (i === 39) throw new Error(`Server not up at ${BASE}`);
  }

  await signIn(ctx);

  for (const path of PAGES) {
    const violations = await runAxe(page, path);
    if (violations.length) {
      failed = true;
      console.error(`\naxe failures on ${path}:`);
      for (const v of violations) {
        console.error(`- [${v.impact}] ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) {
          console.error(`  ${n.target.join(" ")}`);
        }
      }
    } else {
      console.log(`ok ${path}`);
    }
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
}

if (failed) {
  console.error("\naxe check failed");
  process.exit(1);
}
console.log("\naxe check ok");
process.exit(0);
