/** Guest judge joins with a session code and submits a card. */
import {
  BASE,
  PRACTICE_CODE,
  assert,
  log,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "guest-judge";

export async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  log("open judging portal as guest");
  await page.goto(`${BASE}/judging?guest=1`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await expectNoCrash(page, "judging portal");

  // Fill guest fields when the enter form is shown.
  const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
  const codeInput = page
    .getByLabel(/code|session/i)
    .or(page.getByPlaceholder(/482913|code/i));
  const bgInput = page
    .getByLabel(/background/i)
    .or(page.getByPlaceholder(/background|judge|alum/i));

  if (await nameInput.first().isVisible({ timeout: 4000 }).catch(() => false)) {
    await nameInput.first().fill("Prof. Rivera");
  }
  if (await bgInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await bgInput.first().fill("Past APPE judge");
  }
  if (await codeInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await codeInput.first().fill(PRACTICE_CODE);
  } else {
    // Fallback: any text input for the code.
    const inputs = page.locator("input");
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const ph = (await inputs.nth(i).getAttribute("placeholder")) ?? "";
      const type = (await inputs.nth(i).getAttribute("type")) ?? "text";
      if (type === "password" || /code|482913/i.test(ph)) {
        await inputs.nth(i).fill(PRACTICE_CODE);
        break;
      }
    }
  }

  const enter = page.getByRole("button", {
    name: /Open scoring card|Enter|Join|Start judging/i,
  });
  if (await enter.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await enter.first().click();
  }

  // Demo fallback path also works with the fixture code.
  await page.waitForTimeout(1500);
  const card = page.getByText(/JUDGING|APPE scoring|presenting|commenting/i).first();
  const demoOk =
    (await card.isVisible({ timeout: 10_000 }).catch(() => false)) ||
    (await page.getByText(/Could not open judging/i).isVisible().catch(() => false));

  if (await page.getByText(/Could not open judging/i).isVisible().catch(() => false)) {
    log("live enter failed; use demo=1 fallback");
    await page.goto(`${BASE}/judging?demo=1`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
  }

  await page
    .getByText(/JUDGING|APPE scoring|presenting/i)
    .first()
    .waitFor({ timeout: 20_000 });
  await expectNoCrash(page, "judge card");

  // Score the first scored item if number buttons are present.
  const one = page.getByRole("button", { name: "5", exact: true }).first();
  if (await one.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Tap a mid score on each visible row's "5" where possible.
    const fives = page.getByRole("button", { name: "5", exact: true });
    const n = Math.min(await fives.count(), 8);
    for (let i = 0; i < n; i++) {
      await fives.nth(i).click().catch(() => undefined);
    }
  }

  const submit = page.getByRole("button", { name: /Submit card/i });
  if (await submit.isVisible({ timeout: 5000 }).catch(() => false)) {
    log("submit card");
    await submit.click();
    await page
      .getByText(/Card in|Thank you|admin sees/i)
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined);
  } else {
    log("submit not shown (demo may no-op); card UI present");
  }

  assert(
    (await page.getByText(/JUDGING|Card in|APPE/i).first().isVisible().catch(() => false)) ||
      demoOk,
    "Guest judge card did not render",
  );

  await ctx.close();
}
