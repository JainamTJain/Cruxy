/** Member first sign in: welcome code, consent, choose passcode, guided tour. */
import {
  BASE,
  STARTER,
  FIRST_RUN_PASS,
  assert,
  log,
  enterKeypad,
  resetFirstRunPerson,
  completeTour,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "first-sign-in";

export async function run(browser) {
  // Ensure Tri needs the full first-run path.
  const ok = resetFirstRunPerson("Tri");
  assert(ok, "Could not reset Tri in sample store (start the server once first)");
  // Give the server a beat so the next read picks up the file.
  await new Promise((r) => setTimeout(r, 200));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  log("open sign-in");
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: "Tri", exact: true }).click();
  log("enter welcome code");
  await enterKeypad(page, STARTER);

  await page.waitForURL(/\/consent/, { timeout: 20_000 });
  log("consent (text only)");
  await page.getByRole("button", { name: /Not now: text only/i }).click();

  await page.waitForURL(/\/learning-profile/, { timeout: 20_000 });
  log("skip learning profile");
  await page.getByRole("button", { name: /Skip for now/i }).click();

  await page.waitForURL(/\/choose-passcode/, { timeout: 20_000 });
  log("choose passcode (twice)");
  await enterKeypad(page, FIRST_RUN_PASS);
  await page.waitForTimeout(400);
  await enterKeypad(page, FIRST_RUN_PASS);
  await page.getByRole("heading", { name: /Passcode saved/i }).waitFor({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /Enter Crux/i }).click();

  await page.waitForURL(/\/(checklist|today|home)/, { timeout: 20_000 });
  log("guided tour");
  // Tour auto-starts on app shell; if we landed on checklist, wait for it.
  await completeTour(page);
  await expectNoCrash(page, "after tour");

  // Should end on Today or stay on checklist without the dialog.
  const tourGone = !(await page
    .getByRole("button", { name: "Skip tour" })
    .isVisible()
    .catch(() => false));
  assert(tourGone, "Tour still open after finish");

  await ctx.close();
}
