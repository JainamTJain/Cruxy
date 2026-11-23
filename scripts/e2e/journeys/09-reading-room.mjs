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

/** Select the first chunk of text inside the reading article. */
async function selectPassageText(page) {
  const selected = await page.evaluate(() => {
    const article = document.querySelector("article");
    const p = article?.querySelector("p");
    if (!p || !p.firstChild) return null;
    const text = (p.textContent ?? "").trim();
    if (text.length < 12) return null;
    const range = document.createRange();
    const node = p.firstChild;
    const len = Math.min(40, (node.textContent ?? "").length);
    range.setStart(node, 0);
    range.setEnd(node, len);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return text.slice(0, len);
  });
  assert(selected, "Could not select passage text");
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

  const readLink = page.getByRole("link", { name: "Read in Crux" }).first();
  await readLink.waitFor({ timeout: 90_000 });
  assert(
    await page.getByText(PASTE_TITLE).first().isVisible(),
    "Imported title missing from Extra reading",
  );

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

  // Passages may render even when the digest stub fails without a gateway key.
  await page.locator("article p").first().waitFor({ timeout: 30_000 });

  log("highlight selected text");
  await selectPassageText(page);
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page
    .getByRole("heading", { name: "Highlights and comments" })
    .waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  assert(
    (await page.locator("aside li").count()) >= 1 ||
      (await page.locator("mark").count()) >= 1,
    "Highlight did not appear",
  );

  log("comment on selected text");
  await selectPassageText(page);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByPlaceholder("Your comment").fill("Useful for our reply.");
  await page.getByRole("button", { name: "Save comment" }).click();
  await page.waitForTimeout(800);
  assert(
    await page.getByText("Useful for our reply.").isVisible(),
    "Comment did not save",
  );

  log("add sticky note");
  await page
    .getByPlaceholder(/A thought, a counterpoint/i)
    .fill("Bring this into Claims.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.waitForTimeout(800);
  assert(
    await page.getByText("Bring this into Claims.").isVisible(),
    "Sticky note did not save",
  );

  log("reload and keep annotations");
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page
    .getByRole("heading", { name: PASTE_TITLE })
    .waitFor({ timeout: 30_000 });
  assert(
    await page.getByText("Useful for our reply.").isVisible(),
    "Comment missing after reload",
  );
  assert(
    await page.getByText("Bring this into Claims.").isVisible(),
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
