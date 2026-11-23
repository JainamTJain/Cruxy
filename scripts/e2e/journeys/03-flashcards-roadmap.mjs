/** Flashcard session and personal roadmap. */
import {
  BASE,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "flashcards-roadmap";

export async function run(browser) {
  // Phone for flashcards, then desktop for roadmap heading (sidebar also
  // says "My roadmap" and stays in the DOM hidden at 390).
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await phone.newPage();
  await signIn(phone, "katie");

  log("flashcards");
  await page.goto(`${BASE}/revision/flashcards`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "flashcards");

  if (
    await page
      .getByText(/left today|Got it|Missed it|Flip/i)
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false)
  ) {
    const flipAlt = page.getByRole("button", {
      name: /Flip to answer|Show answer|Flip/i,
    });
    if (await flipAlt.first().isVisible().catch(() => false)) {
      await flipAlt.first().click();
    } else {
      await page
        .locator("main")
        .locator("button, [role='button']")
        .first()
        .click()
        .catch(() => undefined);
    }
    await page.waitForTimeout(400);
    const gotIt = page.getByRole("button", { name: /Got it/i });
    const missed = page.getByRole("button", { name: /Missed it/i });
    if (await gotIt.isVisible().catch(() => false)) {
      await gotIt.click();
      log("rated Got it");
    } else if (await missed.isVisible().catch(() => false)) {
      await missed.click();
      log("rated Missed it");
    } else {
      log("no rating buttons; page still loads");
    }
  } else {
    log("deck empty or loading copy; page still loads");
  }
  await phone.close();

  log("roadmap");
  const desk = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const road = await desk.newPage();
  await signIn(desk, "katie");
  await road.goto(`${BASE}/revision/roadmap`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(road);
  await expectNoCrash(road, "roadmap");
  // App shell wraps pages in #main-content (not <main>).
  await road
    .locator("#main-content")
    .getByRole("heading", { name: /My roadmap/i })
    .waitFor({ timeout: 20_000 });
  assert(
    await road
      .locator("#main-content")
      .getByRole("heading", { name: /My roadmap/i })
      .isVisible(),
    "Roadmap missing expected content",
  );

  await desk.close();
}
