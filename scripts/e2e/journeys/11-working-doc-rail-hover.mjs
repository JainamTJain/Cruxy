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

  const ideaBox = page.getByPlaceholder(/My idea is/i);
  if (await ideaBox.isVisible({ timeout: 6000 }).catch(() => false)) {
    await ideaBox.fill(
      "The values in tension here include dignity and the categorical imperative.",
    );
    await page.getByRole("button", { name: /Add as suggestion/i }).click();
    await page.waitForTimeout(2000);
    const coherence = page.getByRole("button", { name: /Check coherence/i });
    if (await coherence.isVisible().catch(() => false)) {
      await coherence.click();
      await page.waitForTimeout(2000);
    }
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

  const marks = page.locator("button[aria-expanded]");
  const count = await marks.count();
  if (count >= 2) {
    const first = marks.nth(0);
    const second = marks.nth(1);
    await first.scrollIntoViewIfNeeded();
    await first.hover();
    await page.waitForTimeout(350);
    const openAfterFirst = await page.locator("[data-hover-card]").count();
    assert(openAfterFirst === 1, `Expected 1 hover card after first hover, got ${openAfterFirst}`);
    await page.screenshot({
      path: join(ARTIFACTS, "working-doc-hover-first.png"),
      fullPage: false,
    });

    await second.scrollIntoViewIfNeeded();
    await second.hover();
    await page.waitForTimeout(350);
    const openAfterSecond = await page.locator("[data-hover-card]").count();
    assert(
      openAfterSecond === 1,
      `Expected exactly 1 hover card after second hover, got ${openAfterSecond}`,
    );
    await page.screenshot({
      path: join(ARTIFACTS, "working-doc-hover-second-only.png"),
      fullPage: false,
    });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const afterEsc = await page.locator("[data-hover-card]").count();
    assert(afterEsc === 0, `Escape should close hover card, got ${afterEsc}`);
  } else {
    log(`only ${count} framework marks on page; skipping dual-hover assert`);
    await page.screenshot({
      path: join(ARTIFACTS, "working-doc-hover-skipped-few-marks.png"),
      fullPage: false,
    });
  }

  await ctx.close();
}
