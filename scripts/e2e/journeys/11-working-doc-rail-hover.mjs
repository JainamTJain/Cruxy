/**
 * Working document: Suggestions rail fits at desktop widths (no horizontal
 * scroll with sidebar open), and only one framework / glossary hover card
 * is open at a time.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  BASE,
  CASE9,
  TEAM3,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "working-doc-rail-hover";

const WIDTHS = [1024, 1280, 1440, 1920];
const ARTIFACTS = "/opt/cursor/artifacts";

async function ensureWorkingDoc(page, ctx) {
  const startBtn = page.getByRole("button", {
    name: /Start our working documents/i,
  });
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    log("start working documents");
    await startBtn.click();
    await page.waitForTimeout(2500);
  }

  // Prefer the Crux path so section bodies (with LinkedText) are visible.
  await ctx.request.post(`${BASE}/api/case/working-document`, {
    data: { caseId: CASE9, teamId: TEAM3, action: "start_crux" },
    headers: { "content-type": "application/json" },
  });
  const res = await ctx.request.post(`${BASE}/api/case/working-document`, {
    data: {
      caseId: CASE9,
      teamId: TEAM3,
      action: "save_section",
      sectionKey: "support",
      body:
        "The values in tension are dignity and efficiency. " +
        "A categorical imperative test asks whether the rule treats people as ends.",
    },
    headers: { "content-type": "application/json" },
  });
  log(`seed section status ${res.status()}`);
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await dismissTourIfOpen(page);
  await page.waitForTimeout(800);
}

export async function run(browser) {
  mkdirSync(ARTIFACTS, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await signIn(ctx, "katie");

  log("open Case 9 working document");
  await page.goto(`${BASE}/case-brain/${CASE9}?tab=working`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await ensureWorkingDoc(page, ctx);
  await expectNoCrash(page, "working tab");

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

  const marks = page.locator("[data-framework-mark]");
  const count = await marks.count();
  log(`framework marks: ${count}`);
  assert(count >= 2, `Need at least two framework marks, found ${count}`);

  const first = marks.nth(0);
  const second = marks.nth(1);
  await first.scrollIntoViewIfNeeded();
  await first.hover({ force: true });
  await page.waitForTimeout(300);
  if ((await page.locator("[data-hover-card]").count()) === 0) {
    await first.focus();
    await page.waitForTimeout(200);
  }
  const openAfterFirst = await page.locator("[data-hover-card]").count();
  assert(openAfterFirst === 1, `Expected 1 hover card after first term, got ${openAfterFirst}`);
  await page.screenshot({
    path: join(ARTIFACTS, "working-doc-hover-first.png"),
    fullPage: false,
  });

  await second.scrollIntoViewIfNeeded();
  await second.hover({ force: true });
  await page.waitForTimeout(300);
  if ((await page.locator("[data-hover-card]").count()) !== 1 || (await second.getAttribute("aria-expanded")) !== "true") {
    await second.focus();
    await page.waitForTimeout(200);
  }
  const openAfterSecond = await page.locator("[data-hover-card]").count();
  assert(
    openAfterSecond === 1,
    `Expected exactly 1 hover card after second term, got ${openAfterSecond}`,
  );
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

  await ctx.close();
}
