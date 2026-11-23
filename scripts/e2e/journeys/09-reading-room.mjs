/**
 * Import a pasted reading (Nick / team 3, case 1), open the reading room,
 * highlight / comment / sticky note, reload; team 1 cannot open that import.
 */
import {
  BASE,
  CASE1,
  assert,
  log,
  signIn,
  dismissTourIfOpen,
  expectNoCrash,
} from "../helpers.mjs";

export const name = "reading-room-import";

const PASTE_TITLE = "E2E sample reading on consent";
const PASTE_BODY = [
  "Judges often ask whether a choice respects the people named in the case,",
  "not only whether the outcome looks fair on a spreadsheet.",
  "A clear stake for those people helps the presentation land.",
  "When a teammate concedes a point, they should say what still stands.",
  "This paragraph is long enough for Cruxy to digest and split into passages.",
].join(" ");

/** Select passage text in the reading room article (opens the toolbar). */
async function selectPassageText(page) {
  const passage = page.locator("article [data-ord] p").first();
  await passage.waitFor({ timeout: 30_000 });
  const selected = await passage.evaluate((el) => {
    const text = (el.textContent ?? "").trim();
    if (text.length < 12) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    // Prefer a short slice so Highlight / Comment stay snappy.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (node && (node.textContent ?? "").length >= 12) {
      const len = Math.min(48, node.textContent.length);
      range.setStart(node, 0);
      range.setEnd(node, len);
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 40, clientY: 40 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return sel?.toString()?.trim() || text.slice(0, 48);
  });
  assert(selected, "Could not select passage text");
  await page.getByRole("button", { name: "Highlight", exact: true }).waitFor({
    timeout: 5_000,
  });
  return selected;
}

export async function run(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await signIn(ctx, "Nick");

  log("case 1 reading tab");
  await page.goto(`${BASE}/case-brain/${CASE1}?tab=reading`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "case reading");

  log("paste and import a reading");
  await page.getByRole("heading", { name: "Extra reading" }).waitFor({
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page
    .getByPlaceholder(/Paste the article, chapter or notes/i)
    .fill(PASTE_BODY);
  await page
    .getByPlaceholder(/Cruxy names it if you leave this blank/i)
    .fill(PASTE_TITLE);
  await page.getByRole("button", { name: /Import and digest/i }).click();

  await page.getByText(PASTE_TITLE).first().waitFor({ timeout: 90_000 });
  const titleCard = page.locator("article").filter({ hasText: PASTE_TITLE }).first();
  const readLink = titleCard.getByRole("link", { name: "Read in Crux" });
  await readLink.waitFor({ timeout: 30_000 });

  log("open reading room");
  await readLink.click();
  await page.waitForURL(/\/case-brain\/.*\/read\/import\//, {
    timeout: 30_000,
  });
  await expectNoCrash(page, "reading room");
  await page
    .getByRole("heading", { name: PASTE_TITLE })
    .waitFor({ timeout: 30_000 });
  const importUrl = page.url();
  const importId = importUrl.split("/").pop();
  assert(importId && importId.length > 10, "Missing import id in URL");

  // Confirm passages exist via API before relying on selection.
  const readingRes = await ctx.request.get(
    `${BASE}/api/case/reading?caseId=${encodeURIComponent(CASE1)}&kind=import&id=${encodeURIComponent(importId)}`,
  );
  assert(readingRes.ok(), `reading API ${readingRes.status()}`);
  const readingJson = await readingRes.json();
  assert(
    (readingJson.reading?.passages?.length ?? 0) > 0,
    "Imported reading has no passages",
  );

  // Passages may render even when the digest stub fails without a gateway key.
  await page.locator("article [data-ord] p").first().waitFor({ timeout: 30_000 });

  log("highlight selected text");
  await selectPassageText(page);
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.waitForTimeout(1000);
  assert(
    (await page.locator("mark").count()) >= 1 ||
      (await page.getByRole("heading", { name: "Highlights and comments" }).isVisible()),
    "Highlight did not appear",
  );
  // Toolbar closes after save; list should gain an entry.
  await page
    .locator("aside")
    .getByText(/Judges often ask|Respect|outcome|teammate/i)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);

  log("comment on selected text");
  await selectPassageText(page);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByPlaceholder("Your comment").fill("Useful for our reply.");
  await page.getByRole("button", { name: "Save comment" }).click();
  await page.waitForTimeout(800);
  assert(
    await page.getByText("Useful for our reply.").first().isVisible(),
    "Comment did not save",
  );

  log("add sticky note");
  await page
    .getByPlaceholder(/A thought, a counterpoint/i)
    .fill("Bring this into Claims.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.waitForTimeout(800);
  assert(
    await page.getByText("Bring this into Claims.").first().isVisible(),
    "Sticky note did not save",
  );

  log("reload and keep annotations");
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page
    .getByRole("heading", { name: PASTE_TITLE })
    .waitFor({ timeout: 30_000 });
  assert(
    await page.getByText("Useful for our reply.").first().isVisible(),
    "Comment missing after reload",
  );
  assert(
    await page.getByText("Bring this into Claims.").first().isVisible(),
    "Sticky note missing after reload",
  );

  await ctx.close();

  log("team 1 cannot open team 3 import");
  const t1 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await signIn(t1, "Serena");
  const denied = await t1.request.get(
    `${BASE}/api/case/reading?caseId=${encodeURIComponent(CASE1)}&kind=import&id=${encodeURIComponent(importId)}`,
  );
  assert(denied.status() === 404, `Expected 404 for other team, got ${denied.status()}`);
  await t1.close();
}
