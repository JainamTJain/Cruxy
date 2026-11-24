/**
 * One pager is always available: never the empty state, built from the
 * working document / truth source. Screen + print screenshots for the PR.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  BASE,
  CASE1,
  TEAM3,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "one-pager-always";

export async function run(browser) {
  const outDir = join(
    process.env.CURSOR_ARTIFACTS_DIR || "/opt/cursor/artifacts",
    "one-pager",
  );
  mkdirSync(outDir, { recursive: true });

  // Jainam tech admin in admin view, Team 3 Case 1 (the live bug report).
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await signIn(ctx, "jainam-admin");

  log("admin view Team 3 Case 1 one pager");
  await page.goto(
    `${BASE}/case-brain/${CASE1}?tab=one_pager&teamId=${TEAM3}`,
    { waitUntil: "networkidle", timeout: 90_000 },
  );
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "one pager case 1");

  // Never the empty state from the bug.
  const empty = await page
    .getByText(/No one pager yet|has not drafted a one pager/i)
    .isVisible()
    .catch(() => false);
  assert(!empty, "One pager showed the empty state (should always render)");

  // Wait for the sheet (derived or stored).
  await page.locator("#one-pager-sheet").waitFor({ timeout: 60_000 });
  const answer = await page
    .getByText(/Our answer in one sentence/i)
    .first()
    .isVisible();
  assert(answer, "Missing one-sentence answer block");
  const claim = await page.getByText(/Claim 1/i).first().isVisible();
  assert(claim, "Missing Claim 1");

  const printBtn = page.getByRole("button", {
    name: /Download PDF or Print/i,
  });
  assert(
    await printBtn.isVisible(),
    "Missing Download PDF or Print button",
  );

  // Screen screenshot.
  await page.locator("#one-pager-sheet").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(outDir, "case1-team3-screen.png"),
    fullPage: true,
  });
  log("wrote case1-team3-screen.png");

  // Print media screenshot.
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => {
    document.body.classList.add("printing-one-pager");
  });
  await page.locator("#one-pager-sheet").screenshot({
    path: join(outDir, "case1-team3-print.png"),
  });
  await page.evaluate(() => {
    document.body.classList.remove("printing-one-pager");
  });
  await page.emulateMedia({ media: "screen" });
  log("wrote case1-team3-print.png");

  // Team member (Katie) also always sees a one pager for her own team.
  await ctx.close();
  const ctx2 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page2 = await ctx2.newPage();
  await signIn(ctx2, "katie");
  await page2.goto(`${BASE}/case-brain/${CASE1}?tab=one_pager`, {
    waitUntil: "networkidle",
    timeout: 90_000,
  });
  await dismissTourIfOpen(page2);
  const empty2 = await page2
    .getByText(/No one pager yet|has not drafted a one pager/i)
    .isVisible()
    .catch(() => false);
  assert(!empty2, "Katie saw empty one pager state");
  await page2.locator("#one-pager-sheet").waitFor({ timeout: 60_000 });
  await page2.screenshot({
    path: join(outDir, "case1-katie-screen.png"),
    fullPage: true,
  });
  log("wrote case1-katie-screen.png");

  await ctx2.close();
}
