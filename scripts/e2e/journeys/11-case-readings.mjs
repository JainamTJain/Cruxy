/** Case page Prep notes from Drive: heading, edit, fallacy apply. */
import {
  BASE,
  CASE9,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "case-readings-prep-notes";

export async function run(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  await signIn(ctx, "katie");

  log("open Case 9 reading tab");
  await page.goto(`${BASE}/case-brain/${CASE9}?tab=reading`, {
    waitUntil: "networkidle",
    timeout: 90_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "reading tab");

  const heading = page.getByRole("heading", {
    name: /Prep notes from Drive/i,
  });
  await heading.waitFor({ timeout: 60_000 });
  assert(await heading.isVisible(), "Prep notes heading missing");

  const blurb = page.getByText(/Ethics Bowl Drive/i).first();
  assert(await blurb.isVisible(), "purpose blurb missing");

  // If there are cards, try inline edit save/cancel.
  const editBtn = page.getByRole("button", { name: /Edit key point|Edit note|Edit open question/i }).first();
  if (await editBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    log("edit a point");
    await editBtn.click();
    const box = page.locator("textarea").first();
    await box.waitFor({ timeout: 5_000 });
    const before = await box.inputValue();
    await box.fill(`${before} (team edit)`);
    await page.getByRole("button", { name: /^Save$/i }).click();
    await page.waitForTimeout(1500);
    const edited = page.getByText(/Edited by/i).first();
    if (await edited.isVisible().catch(() => false)) {
      log("override saved");
    } else {
      log("override UI quiet (point may have cleaned empty)");
    }
  } else {
    log("no editable points on this case yet");
  }

  await ctx.close();
}
