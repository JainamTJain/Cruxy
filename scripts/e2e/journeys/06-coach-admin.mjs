/** Coach admin views all teams and starts a practice session. */
import {
  BASE,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "coach-admin";

export async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await signIn(ctx, "drb-admin");

  log("coach view of all teams");
  await page.goto(`${BASE}/coach`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "coach index");
  await page.getByText(/Team 1|Team 2|Team 3|Coach view/i).first().waitFor({
    timeout: 20_000,
  });

  const teamLink = page.getByRole("link", { name: /Team 3/i }).first();
  if (await teamLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await teamLink.click();
    await page.waitForURL(/\/coach\//, { timeout: 15_000 });
    await expectNoCrash(page, "coach team");
  }

  log("start admin practice session");
  await page.goto(`${BASE}/practice/admin`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "practice admin");

  const create = page.getByRole("button", { name: /Create session/i });
  await create.waitFor({ timeout: 15_000 });
  await create.click();

  // Lands on the new session page, or shows an error we can report.
  await page.waitForTimeout(2500);
  const url = page.url();
  const onSession = /\/practice\/sessions\//.test(url);
  const codeShown = await page
    .getByText(/Session code/i)
    .isVisible()
    .catch(() => false);
  const err = await page.locator(".text-cardinal, [class*='cardinal']").first().textContent().catch(() => "");
  assert(
    onSession || codeShown,
    `Coach could not create a session (${url}). ${err || ""}`.trim(),
  );
  log(onSession ? `session ${url}` : "session code shown");

  await ctx.close();
}
