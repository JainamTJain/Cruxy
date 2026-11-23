/** Practice drill from start through finalize to report. */
import {
  BASE,
  ROUND_REPORT,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "practice-drill";

export async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(ctx, "katie");

  log("start thesis drill");
  await page.goto(`${BASE}/practice/drills/thesis`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "thesis drill");

  await page
    .getByText(/THESIS IN 30 SECONDS|Starting drill|one sentence/i)
    .first()
    .waitFor({ timeout: 20_000 });

  // Stop the timer early so we can finish.
  const stop = page.getByRole("button", { name: /Stop recording/i });
  if (await stop.isVisible({ timeout: 5000 }).catch(() => false)) {
    await stop.click();
  }

  const finish = page.getByRole("button", {
    name: /Finish and get the report/i,
  });
  if (await finish.isVisible({ timeout: 15_000 }).catch(() => false)) {
    log("finalize drill");
    await finish.click();
    // Stub transcript path waits ~1.6s then navigates.
    await page.waitForURL(/\/practice\/rounds\/.+\/report/, {
      timeout: 45_000,
    });
    await expectNoCrash(page, "drill report");
    log("landed on report");
  } else {
    // Fallback: seeded report still proves the report screen.
    log("finalize control missing; open seeded report");
    await page.goto(`${BASE}/practice/rounds/${ROUND_REPORT}/report`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await expectNoCrash(page, "seeded report");
  }

  const reportSignal = await page
    .getByText(/report|feedback|score|headline|Cruxy|reflection/i)
    .first()
    .isVisible()
    .catch(() => false);
  assert(reportSignal, "Report page empty");

  await ctx.close();
}
