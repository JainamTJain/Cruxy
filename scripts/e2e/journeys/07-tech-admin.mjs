/** Tech admin console (Jainam): overview, teams, spend / passcodes links. */
import {
  BASE,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "tech-admin";

export async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await signIn(ctx, "jainam-admin");

  log("admin console");
  await page.goto(`${BASE}/admin`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "admin");

  await page
    .getByText(/Admin|Team 1|Team 2|Team 3|Spend|Passcode|Activity/i)
    .first()
    .waitFor({ timeout: 20_000 });

  // Teams visible to tech admin.
  for (const team of ["Team 1", "Team 2", "Team 3"]) {
    const visible = await page.getByText(team, { exact: false }).first().isVisible().catch(() => false);
    assert(visible, `Admin console missing ${team}`);
  }

  // Technical panels reachable.
  for (const path of ["/admin/spend", "/admin/passcodes", "/admin/models"]) {
    log(path);
    await page.goto(`${BASE}${path}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await dismissTourIfOpen(page);
    await expectNoCrash(page, path);
    const blocked = await page
      .getByText(/Forbidden|not allowed|coach only/i)
      .first()
      .isVisible()
      .catch(() => false);
    assert(!blocked, `${path} blocked for tech admin`);
  }

  await ctx.close();
}
