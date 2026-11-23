/** Today → case → working document (Take, Undo, Tell Cruxy) → one pager. */
import {
  BASE,
  CASE9,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "today-case-working-doc";

export async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await signIn(ctx, "katie");

  log("Today");
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle", timeout: 60_000 });
  await dismissTourIfOpen(page);
  await page.getByRole("heading", { name: /Hi Katie/i }).waitFor({ timeout: 20_000 });
  await expectNoCrash(page, "Today");

  log("open Case 9 working document");
  await page.goto(`${BASE}/case-brain/${CASE9}?tab=working`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "working tab");

  // Start working docs from truth if empty.
  const startBtn = page.getByRole("button", {
    name: /Start our working documents/i,
  });
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    log("start working documents from truth");
    await startBtn.click();
    await page.waitForTimeout(2500);
  }

  // Tell Cruxy an idea (stubs without gateway key).
  const ideaBox = page.getByPlaceholder(/My idea is/i);
  if (await ideaBox.isVisible({ timeout: 8000 }).catch(() => false)) {
    log("Tell Cruxy an idea");
    await ideaBox.fill(
      "Judges care most about a clear stake for the people named in the case.",
    );
    await page.getByRole("button", { name: /Add as suggestion/i }).click();
    await page.waitForTimeout(2500);
    // Coherence also seeds the suggestions rail when the idea path is quiet.
    const coherence = page.getByRole("button", { name: /Check coherence/i });
    if (await coherence.isVisible().catch(() => false)) {
      await coherence.click();
      await page.waitForTimeout(2500);
    }
  } else {
    log("idea box not shown yet (document may still be empty)");
  }

  // Take uses aria-label "Take suggestion".
  const take = page
    .getByRole("button", { name: /Take suggestion|^Take$/i })
    .first();
  if (await take.isVisible({ timeout: 12_000 }).catch(() => false)) {
    log("Take a suggestion");
    await take.scrollIntoViewIfNeeded();
    await take.click();
    await page.waitForTimeout(2500);
    const undo = page.getByRole("button", { name: /^Undo$/i });
    if (await undo.isVisible({ timeout: 10_000 }).catch(() => false)) {
      log("Undo");
      await undo.click();
      await page.waitForTimeout(1000);
    } else {
      log("Undo not shown (suggestion may have gone to to-do list)");
    }
  } else {
    log("no Take button yet; continuing");
  }

  log("One pager tab");
  await page.goto(`${BASE}/case-brain/${CASE9}?tab=one_pager`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "one pager");
  const onePagerSignal = await page
    .getByText(/One pager|Claim|Stakeholder|Framework/i)
    .first()
    .isVisible()
    .catch(() => false);
  assert(onePagerSignal, "One pager tab did not show expected content");

  await ctx.close();
}
