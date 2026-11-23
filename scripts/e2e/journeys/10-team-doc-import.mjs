/**
 * Cases tab import=1: paste a doc with a Case 1 heading, sort case by case,
 * confirm with replace, then check the working document picked up the text.
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

export const name = "team-doc-import";

const MARKER = "E2E team doc marker for case one working document";
const PASTE_DOC = [
  "# Case 1: Sample regional case",
  "",
  "## Our answer",
  `${MARKER} in one clear sentence about the people named in the case.`,
  "",
  "## Claims",
  "Claim 1: Respect for named people comes before a neat spreadsheet outcome.",
  "Claim 2: A reply should say what still stands after a fair concede.",
].join("\n");

export async function run(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await signIn(ctx, "katie");

  log("open Cases with import panel");
  await page.goto(`${BASE}/case-brain?import=1`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "case brain import");

  await page
    .getByRole("heading", { name: /Bring your own working documents/i })
    .waitFor({ timeout: 20_000 });

  log("paste document with Case 1 heading");
  await page
    .getByPlaceholder(/Paste your notes/i)
    .fill(PASTE_DOC);

  log("Sort them case by case");
  await page.getByRole("button", { name: /Sort them case by case/i }).click();
  await page
    .getByText(/Cruxy found \d+ case/i)
    .waitFor({ timeout: 120_000 });

  const replace = page.getByRole("checkbox", {
    name: /Use only our document/i,
  });
  if (await replace.isVisible().catch(() => false)) {
    if (!(await replace.isChecked())) await replace.check();
  }

  log("confirm with replace");
  await page
    .getByRole("button", { name: /Confirm and fill/i })
    .click();
  await page
    .getByText(/Done\. Cruxy filled/i)
    .waitFor({ timeout: 120_000 });

  log("check Case 1 working document sections");
  await page.goto(`${BASE}/case-brain/${CASE1}?tab=working`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  await dismissTourIfOpen(page);
  await expectNoCrash(page, "working after import");

  // Prefer the API: the working tab layout has no reliable <main> wrapper.
  const api = await ctx.request.get(
    `${BASE}/api/case/working-document?caseId=${CASE1}`,
  );
  assert(api.ok(), `working-document API ${api.status()}`);
  const json = await api.json();
  const blob = JSON.stringify(json);
  assert(
    blob.includes(MARKER) || blob.includes("Respect for named people"),
    "Working document did not show imported team text",
  );

  // Also glance at the page so the journey covers the UI path.
  const pageText = await page.locator("body").innerText();
  assert(
    /Working document|Our answer|Claims|One sentence/i.test(pageText),
    "Working tab did not render expected chrome",
  );

  await ctx.close();
}
