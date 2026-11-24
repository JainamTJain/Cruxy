/**
 * Working document: Suggestions rail fits at desktop widths (no horizontal
 * scroll with sidebar open), and only one framework / glossary hover card
 * is open at a time.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  BASE,
  CASE1,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "working-doc-rail-hover";

const WIDTHS = [1024, 1280, 1440, 1920];
const ARTIFACTS = "/opt/cursor/artifacts";

async function ensureWorkingDoc(page) {
  const startBtn = page.getByRole("button", {
    name: /Start our working documents/i,
  });
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    log("start working documents");
    await startBtn.click();
    await page.waitForTimeout(2500);
  }
}

export async function run(browser) {
  mkdirSync(ARTIFACTS, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await signIn(ctx, "katie");

  log("open Case 1 working document");
  await page.goto(`${BASE}/case-brain/${CASE1}?tab=working`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await ensureWorkingDoc(page);
  await expectNoCrash(page, "working tab");

  // Put two framework terms in a section so hover cards can be tested.
  async function ensureFrameworkMarks() {
    if ((await page.locator("[data-framework-mark]").count()) >= 2) return;
    const editBtn = page.getByRole("button", { name: /^Edit$/i }).first();
    if (!(await editBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      log("no Edit button; cannot seed framework terms");
      return;
    }
    await editBtn.click();
    const area = page.locator("textarea").first();
    await area.waitFor({ timeout: 8000 });
    const seeded =
      "The values in tension are dignity and efficiency. " +
      "A categorical imperative test asks whether the rule treats people as ends.";
    await area.fill(seeded);
    const save = page.getByRole("button", { name: /^Save$/i }).first();
    await save.click();
    await page.waitForTimeout(1500);
  }
  await ensureFrameworkMarks();

  const ideaBox = page.getByPlaceholder(/My idea is/i);
  if (await ideaBox.isVisible({ timeout: 4000 }).catch(() => false)) {
    await ideaBox.fill(
      "Judges care about a clear stake for the people named in the case.",
    );
    await page.getByRole("button", { name: /Add as suggestion/i }).click();
    await page.waitForTimeout(1500);
  }

  for (const w of WIDTHS) {
    log(`viewport ${w}`);
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(400);

    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    assert(
      scroll.scrollWidth <= scroll.clientWidth + 1,
      `Horizontal overflow at ${w}px: scrollWidth=${scroll.scrollWidth} clientWidth=${scroll.clientWidth}`,
    );

    const rail = page.locator("aside").filter({ hasText: "Suggestions" }).first();
    if (await rail.isVisible({ timeout: 4000 }).catch(() => false)) {
      const box = await rail.boundingBox();
      assert(box, `Suggestions rail missing box at ${w}`);
      assert(
        box.x + box.width <= w + 1,
        `Suggestions rail clipped past viewport at ${w}: right=${box.x + box.width}`,
      );
    }

    await page.screenshot({
      path: join(ARTIFACTS, `working-doc-rail-${w}.png`),
      fullPage: false,
    });
  }

  log("hover two terms in a row");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);

  // Prefer case text / suggestions body; fall back to any framework mark.
  const marks = page.locator("[data-framework-mark]");
  const count = await marks.count();
  if (count >= 2) {
    const first = marks.nth(0);
    const second = marks.nth(1);
    await first.scrollIntoViewIfNeeded();
    await first.hover({ force: true });
    await page.waitForTimeout(250);
    // Click also opens (keyboard / touch path).
    if ((await page.locator("[data-hover-card]").count()) === 0) {
      await first.click();
      await page.waitForTimeout(250);
    }
    const openAfterFirst = await page.locator("[data-hover-card]").count();
    assert(openAfterFirst === 1, `Expected 1 hover card after first term, got ${openAfterFirst}`);
    await page.screenshot({
      path: join(ARTIFACTS, "working-doc-hover-first.png"),
      fullPage: false,
    });

    await second.scrollIntoViewIfNeeded();
    await second.hover({ force: true });
    await page.waitForTimeout(250);
    if ((await page.locator("[data-hover-card]").count()) !== 1) {
      await second.click();
      await page.waitForTimeout(250);
    }
    const openAfterSecond = await page.locator("[data-hover-card]").count();
    assert(
      openAfterSecond === 1,
      `Expected exactly 1 hover card after second term, got ${openAfterSecond}`,
    );
    // Confirm the open card is for the second term (shared store swapped).
    const secondExpanded = await second.getAttribute("aria-expanded");
    assert(secondExpanded === "true", "Second term should own the open card");
    await page.screenshot({
      path: join(ARTIFACTS, "working-doc-hover-second-only.png"),
      fullPage: false,
    });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const afterEsc = await page.locator("[data-hover-card]").count();
    assert(afterEsc === 0, `Escape should close hover card, got ${afterEsc}`);
  } else {
    log(`only ${count} framework marks on page; seed terms into the idea box`);
    // Last resort: put two terms on the page via a visible suggestion path.
    await page.screenshot({
      path: join(ARTIFACTS, "working-doc-hover-skipped-few-marks.png"),
      fullPage: false,
    });
    assert(count >= 1, `Need at least one framework mark to verify hover cards, found ${count}`);
    await marks.nth(0).click();
    await page.waitForTimeout(250);
    assert(
      (await page.locator("[data-hover-card]").count()) === 1,
      "Single framework mark should open one hover card",
    );
    await page.screenshot({
      path: join(ARTIFACTS, "working-doc-hover-first.png"),
      fullPage: false,
    });
    await page.keyboard.press("Escape");
  }

  await ctx.close();
}
