// Wave 9 E: 390 + 1280 shots for /prepare surfaces.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = ".shots";
const STARTER = "482913";
const MEMBER_PASS = "159753";

mkdirSync(OUT, { recursive: true });
mkdirSync("/opt/cursor/artifacts", { recursive: true });

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
  // Learning profile if required
  try {
    const lp = await ctx.request.get(`${BASE}/api/learning-profile`);
    if (lp.ok()) {
      const body = await lp.json();
      if (body?.required && !body?.completed) {
        await ctx.request.post(`${BASE}/api/learning-profile`, {
          data: {
            answers: body.questions?.map(() => "ok") ?? ["ok"],
          },
          headers,
        });
      }
    }
  } catch {
    // ignore
  }
}

async function signInKatie(ctx) {
  await ctx.clearCookies();
  const people = (await (await ctx.request.get(`${BASE}/api/auth/people`)).json())
    .people;
  const katie = people.find((p) => p.name.startsWith("Katie"));
  if (!katie) throw new Error("Katie not in people list");
  const j = { "content-type": "application/json" };
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

const routes = ["/prepare", "/prepare/mock", "/team"];
const browser = await chromium.launch();

for (const [w, h, tag] of [
  [1280, 800, "1280"],
  [390, 844, "390"],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await signInKatie(ctx);
  for (const route of routes) {
    const name = route.replace(/\//g, "_").replace(/^_/, "") || "root";
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(800);
      const file = `${tag}-${name}.png`;
      await page.screenshot({
        path: join(OUT, file),
        fullPage: true,
      });
      await page.screenshot({
        path: join("/opt/cursor/artifacts", `solo-async-${file}`),
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
console.log("done");
