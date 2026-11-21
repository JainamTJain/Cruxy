/**
 * Wave 5 J: screenshot sign-in at required widths; exercise lamp sleep/wake.
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

const WIDTHS = [360, 768, 970, 1280, 1440];

async function waitReady(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByText("USC ETHICS BOWL").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1300); // genie rise settles
}

async function shotSignIn(browser) {
  for (const w of WIDTHS) {
    const page = await browser.newPage({
      viewport: { width: w, height: w < 800 ? 800 : 900 },
    });
    await waitReady(page);
    const path = join(OUT, `sign-in-${w}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`wrote ${path}`);

    // Overlap probe: label top vs genie top
    const overlap = await page.evaluate(() => {
      const label = [...document.querySelectorAll("span")].find((el) =>
        el.textContent?.includes("USC ETHICS BOWL"),
      );
      const genie = document.querySelector('img[alt="Cruxy rising from the lamp"]');
      if (!label || !genie) return { error: "missing nodes" };
      const lr = label.getBoundingClientRect();
      const gr = genie.getBoundingClientRect();
      const overlaps =
        gr.top < lr.bottom &&
        gr.bottom > lr.top &&
        gr.left < lr.right &&
        gr.right > lr.left;
      return {
        labelBottom: Math.round(lr.bottom),
        genieTop: Math.round(gr.top),
        gap: Math.round(gr.top - lr.bottom),
        overlaps,
      };
    });
    console.log(`width ${w}:`, JSON.stringify(overlap));
    if (overlap.overlaps) {
      throw new Error(`Overlap at ${w}px: ${JSON.stringify(overlap)}`);
    }
    await page.close();
  }
}

async function lampPhoneAndDesktop(browser) {
  for (const [label, viewport] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 800 }],
  ]) {
    // Fresh sample people so the starter code still works
    rmSync(join(process.cwd(), ".data"), { recursive: true, force: true });
    const page = await browser.newPage({ viewport });
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    // Pick Katie and use sample starter
    async function enterCode(code) {
      for (const d of code) {
        await page.getByRole("button", { name: d, exact: true }).click();
      }
      await page.getByRole("button", { name: "Enter", exact: true }).click();
      await page.waitForTimeout(1200);
    }

    const katie = page.getByRole("button", { name: /^Katie/i }).first();
    await katie.scrollIntoViewIfNeeded();
    await katie.click();
    await enterCode("482913");
    console.log(`${label} after sign-in: ${page.url()}`);

    if (page.url().includes("/consent")) {
      // Prefer text-only to skip voice sample
      const textOnly = page.getByRole("button", { name: /Not now:\s*text only/i });
      if (await textOnly.count()) await textOnly.first().click();
      else {
        const btns = page.locator("main button, form button");
        const n = await btns.count();
        for (let i = 0; i < n; i++) {
          const t = (await btns.nth(i).innerText()).toLowerCase();
          if (t.includes("text") || t.includes("continue") || t.includes("agree")) {
            await btns.nth(i).click();
            break;
          }
        }
      }
      await page.waitForTimeout(1200);
    }

    if (page.url().includes("/choose-passcode")) {
      await enterCode("258147");
      if (page.url().includes("/choose-passcode")) {
        await enterCode("258147");
      }
      await page.waitForTimeout(1200);
    }

    // Ensure we're in the app shell
    if (!page.url().includes("/home") && !page.url().includes("/team")) {
      await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
    }

    await page.waitForSelector("#cruxy-lamp", { timeout: 15000 });
    // Clear any saved float pos so the lamp-clear default applies
    await page.evaluate(() => localStorage.removeItem("cruxy-float-pos"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#cruxy-lamp", { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: join(OUT, `lamp-awake-${label}.png`),
    });

    // Sleep via lamp click (must not be blocked by the floating figure)
    await page.locator("#cruxy-lamp").click({ timeout: 5000 });
    await page.waitForTimeout(900);
    const asleep = await page.evaluate(() => localStorage.getItem("cruxy-asleep"));
    console.log(`${label} after sleep: asleep=${asleep}`);
    await page.screenshot({ path: join(OUT, `lamp-asleep-${label}.png`) });

    // Wake: Cruxy pops out of the lamp
    await page.locator("#cruxy-lamp").click({ timeout: 5000 });
    await page.waitForTimeout(900);
    const awake = await page.evaluate(() => localStorage.getItem("cruxy-asleep"));
    console.log(`${label} after wake: asleep=${awake}`);
    await page.screenshot({ path: join(OUT, `lamp-awake-after-${label}.png`) });

    if (asleep !== "1") throw new Error(`${label}: expected asleep after lamp click`);
    if (awake !== "0") throw new Error(`${label}: expected awake after lamp click`);
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await shotSignIn(browser);
  await lampPhoneAndDesktop(browser);
  console.log("wave5-j-shots: all passed");
} finally {
  await browser.close();
}
