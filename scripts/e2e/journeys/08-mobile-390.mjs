/** Same key screens at 390px wide. */
import {
  BASE,
  CASE9,
  ROUND_REPORT,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "mobile-390";

const ROUTES = [
  "/today",
  `/case-brain/${CASE9}?tab=working`,
  `/case-brain/${CASE9}?tab=one_pager`,
  "/revision/flashcards",
  "/revision/roadmap",
  "/practice",
  `/practice/rounds/${ROUND_REPORT}/report`,
  "/team",
  "/admin",
  "/coach",
  "/judging?demo=1",
];

export async function run(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  // Member screens as Katie; admin/coach re-auth as needed.
  await signIn(ctx, "katie");

  for (const route of ROUTES) {
    if (route === "/admin" || route === "/coach") {
      await signIn(ctx, route === "/admin" ? "jainam-admin" : "drb-admin");
    } else if (route.startsWith("/judging")) {
      // guest / demo: clear session so portal stands alone
      await ctx.clearCookies();
    } else if (
      route === "/today" ||
      route.startsWith("/case-brain") ||
      route.startsWith("/revision") ||
      route.startsWith("/practice") ||
      route === "/team"
    ) {
      // ensure member session after admin hops
      const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
      if (!me.authenticated || me.person?.name !== "Katie") {
        await signIn(ctx, "katie");
      }
    }

    log(route);
    const res = await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    assert(res && res.status() < 500, `${route} returned ${res?.status()}`);
    await page.waitForTimeout(600);
    await dismissTourIfOpen(page);
    await expectNoCrash(page, route);

    // Phone shell: bottom tabs or content, not a blank body.
    const text = (await page.locator("body").innerText()).trim();
    assert(text.length > 20, `${route} rendered almost empty at 390px`);
  }

  await ctx.close();
}
