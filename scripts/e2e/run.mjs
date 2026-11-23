#!/usr/bin/env node
/**
 * Crux end-to-end journeys against a production build in sample mode.
 *
 *   USE_SAMPLE_DATA=1 npm run build
 *   npm run e2e
 *
 * Or one shot: npm run e2e (builds unless E2E_SKIP_BUILD=1).
 *
 * Env:
 *   E2E_BASE          default http://127.0.0.1:3000
 *   E2E_SKIP_BUILD    skip next build
 *   E2E_SKIP_SERVER   assume a server is already running
 *   E2E_ONLY          comma list of journey names to run
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { BASE, waitForServer, log } from "./helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

const SAMPLE_ENV = {
  ...process.env,
  USE_SAMPLE_DATA: "1",
  SESSION_SECRET:
    process.env.SESSION_SECRET ||
    "e2e-sample-session-secret-not-for-prod-use-32",
  PASSCODE_VIEW_KEY:
    process.env.PASSCODE_VIEW_KEY || "0123456789abcdef0123456789abcdef",
  // Keep sample starter hashes unset so the local sample store seeds them.
  MEMBER_STARTER_CODE_HASH: process.env.MEMBER_STARTER_CODE_HASH || "",
  COACH_STARTER_CODE_HASH: process.env.COACH_STARTER_CODE_HASH || "",
  INITIAL_ADMIN_CODE_HASH: process.env.INITIAL_ADMIN_CODE_HASH || "",
  NODE_OPTIONS:
    process.env.NODE_OPTIONS || "--max-old-space-size=8192",
};

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: SAMPLE_ENV,
      stdio: "inherit",
      ...opts,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function loadJourneys() {
  const dir = join(__dirname, "journeys");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".mjs"))
    .sort();
  const only = (process.env.E2E_ONLY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const journeys = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (!mod.run || !mod.name) continue;
    if (only.length && !only.includes(mod.name)) continue;
    journeys.push(mod);
  }
  return journeys;
}

async function main() {
  console.log(`Crux e2e → ${BASE} (sample mode)`);

  if (process.env.E2E_SKIP_BUILD !== "1") {
    console.log("Building (USE_SAMPLE_DATA=1)…");
    await runCmd("npm", ["run", "build"]);
  }

  let server = null;
  if (process.env.E2E_SKIP_SERVER !== "1") {
    console.log("Starting next start…");
    server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", "3000"], {
      cwd: ROOT,
      env: { ...SAMPLE_ENV, NODE_ENV: "production", PORT: "3000" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
    server.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));
  }

  const failures = [];
  try {
    await waitForServer();
    // Prime sample store (people + practice fixtures) before first-run reset.
    await fetch(`${BASE}/api/auth/people`);

    const journeys = await loadJourneys();
    assertJourneys(journeys);
    // PW_CHROMIUM_PATH lets machines with a system Chrome run the journeys
    // without downloading Playwright's browser.
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.PW_CHROMIUM_PATH
        ? {
            executablePath: process.env.PW_CHROMIUM_PATH,
            args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
          }
        : {}),
    });

    for (const j of journeys) {
      console.log(`\n▶ ${j.name}`);
      try {
        await j.run(browser);
        console.log(`✓ ${j.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`✗ ${j.name}: ${msg}`);
        failures.push({ name: j.name, msg });
      }
    }

    await browser.close();
  } finally {
    if (server && !server.killed) {
      server.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      if (!server.killed) server.kill("SIGKILL");
    }
  }

  console.log("");
  if (failures.length) {
    console.error(`${failures.length} journey(s) failed:`);
    for (const f of failures) console.error(`  - ${f.name}: ${f.msg}`);
    process.exit(1);
  }
  console.log("All e2e journeys passed.");
}

function assertJourneys(journeys) {
  if (!journeys.length) throw new Error("No journeys loaded");
  log(`${journeys.length} journeys queued`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
