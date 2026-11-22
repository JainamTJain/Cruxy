/**
 * Wave 7 C: full QA sweep at 390px and 1280px for member, coach, tech admin.
 * Writes JSON findings + screenshots under /tmp/wave7-qa and /opt/cursor/artifacts/wave7-qa.
 */
import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.QA_BASE || "http://127.0.0.1:3000";
const OUT = "/tmp/wave7-qa";
const ART = "/opt/cursor/artifacts/wave7-qa";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const IDS = {
  Serena: "a1111111-1111-1111-1111-111111111101",
  "Dr. B": "a0000000-0000-0000-0000-0000000000b0",
  Jainam: "a3333333-3333-3333-3333-333333333304",
};
const CASE9 = "c0000000-0000-4000-8000-000000000009";
const ROUND_REPORT = "25dac835-5030-4a01-932c-9e71d513c724";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];

const PAGES = [
  { key: "home", path: "/home" },
  { key: "case-brain", path: "/case-brain" },
  { key: "case-brain-case9", path: `/case-brain/${CASE9}` },
  { key: "revision", path: "/revision" },
  { key: "flashcards", path: "/revision/flashcards" },
  { key: "roadmap", path: "/revision/roadmap" },
  { key: "one-pagers", path: "/revision/one-pagers" },
  { key: "socratic", path: "/revision/socratic" },
  { key: "questions", path: "/revision/questions" },
  { key: "language", path: "/revision/language" },
  { key: "warmup", path: "/revision/warmup" },
  { key: "practice", path: "/practice" },
  { key: "practice-report", path: `/practice/rounds/${ROUND_REPORT}/report` },
  { key: "drill-thesis", path: "/practice/drills/thesis" },
  { key: "drill-moderator", path: "/practice/drills/moderator" },
  { key: "judging", path: "/judging" },
  { key: "team", path: "/team" },
  { key: "team-chat", path: "/team/chat" },
  { key: "library", path: "/library" },
  { key: "mastery", path: "/mastery" },
  { key: "settings", path: "/settings" },
  { key: "admin", path: "/admin", adminOnly: true },
  { key: "admin-calibration", path: "/admin/calibration", adminOnly: true },
  { key: "admin-flywheel", path: "/admin/flywheel", adminOnly: true },
  { key: "admin-spend", path: "/admin/spend", techOnly: true },
  { key: "admin-passcodes", path: "/admin/passcodes", techOnly: true },
  { key: "admin-books", path: "/admin/books", techOnly: true },
];

const CASE_TABS = [
  "Claim map",
  "Truth Sources",
  "Readings",
  "Flashcards",
  "Questions",
  "Research",
];

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SAMPLE_RE = /\b(sample data|lorem ipsum|placeholder|TODO|FIXME|undefined|null\b|\[object Object\])/i;

async function signIn(page, personId, code) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // API sign-in is more reliable than keypad UI
  const res = await page.request.post(`${BASE}/api/auth/sign-in`, {
    data: { personId, code },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) throw new Error(`sign-in failed ${personId}: ${JSON.stringify(body)}`);
  if (body.mustConsent) {
    await page.goto(`${BASE}/consent`, { waitUntil: "domcontentloaded" });
    const agree = page.getByRole("button", { name: /I agree|Agree|Continue/i }).first();
    if (await agree.count()) await agree.click();
    else {
      await page.request.post(`${BASE}/api/auth/consent`, { data: { agree: true } });
    }
  }
  if (body.mustChoosePasscode || body.mustConsent) {
    // set a stable personal code via API if possible
    const choose = await page.request.post(`${BASE}/api/auth/choose-passcode`, {
      data: { code: "258369", confirm: "258369" },
    });
    if (!choose.ok()) {
      // already set or still on consent
      await page.goto(`${BASE}/choose-passcode`, { waitUntil: "domcontentloaded" });
    }
  }
  await page.goto(`${BASE}/home`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  return body;
}

async function ensureAdminView(page, on) {
  const me = await page.request.get(`${BASE}/api/auth/me`).then((r) => r.json());
  const isAdmin =
    me?.session?.role === "tech_admin" || me?.session?.role === "coach_admin";
  if (!isAdmin) return;
  if (Boolean(me?.session?.adminView) !== on) {
    await page.request.post(`${BASE}/api/auth/admin-view`, {
      data: { adminView: on },
    });
  }
}

function analyzeText(text) {
  const issues = [];
  if (text.includes("·")) issues.push({ kind: "middot", detail: "middle dot in UI text" });
  if (/[—–]/.test(text)) issues.push({ kind: "emdash", detail: "em/en dash in UI text" });
  const uuid = text.match(UUID_RE);
  if (uuid) issues.push({ kind: "raw_uuid", detail: `raw id shown: ${uuid[0]}` });
  const sample = text.match(SAMPLE_RE);
  if (sample) issues.push({ kind: "sample_wording", detail: sample[0] });
  return issues;
}

async function checkOverflow(page) {
  return page.evaluate(() => {
    const issues = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 2) {
      issues.push({
        kind: "horizontal_overflow",
        detail: `scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`,
      });
    }
    // clipped text heuristically: elements with ellipsis overflow and zero scroll
    const nodes = Array.from(document.querySelectorAll("h1,h2,h3,p,button,a,span,label"));
    for (const el of nodes.slice(0, 400)) {
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (el.scrollWidth > el.clientWidth + 4 && st.overflowX !== "visible") {
        const t = (el.textContent || "").trim().slice(0, 80);
        if (t.length > 12) {
          issues.push({
            kind: "text_clip",
            detail: t,
          });
          if (issues.filter((i) => i.kind === "text_clip").length >= 5) break;
        }
      }
    }
    return issues;
  });
}

async function walkRole(browser, role) {
  const findings = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  let code =
    role.name === "Serena"
      ? "482913"
      : role.name === "Dr. B"
        ? "719304"
        : "258369";
  // Jainam may already have personal; try personal then admin
  try {
    await signIn(page, role.id, code);
  } catch (e) {
    if (role.name === "Jainam") {
      code = "246810";
      await signIn(page, role.id, code);
      await page.request.post(`${BASE}/api/auth/choose-passcode`, {
        data: { code: "258369", confirm: "258369" },
      });
    } else if (role.name === "Serena" || role.name === "Dr. B") {
      // after starter, choose passcode then re-enter
      await page.request.post(`${BASE}/api/auth/choose-passcode`, {
        data: { code: "258369", confirm: "258369" },
      });
      await signIn(page, role.id, "258369");
    } else {
      throw e;
    }
  }

  if (role.adminView) await ensureAdminView(page, true);
  else await ensureAdminView(page, false);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const p of PAGES) {
      if (p.adminOnly && !role.adminView) continue;
      if (p.techOnly && role.name !== "Jainam") continue;
      const consoleBefore = consoleErrors.length;
      let status = 200;
      try {
        const resp = await page.goto(`${BASE}${p.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        status = resp?.status() ?? 0;
        await page.waitForTimeout(900);
      } catch (err) {
        findings.push({
          role: role.name,
          viewport: vp.name,
          page: p.key,
          path: p.path,
          issues: [{ kind: "nav_error", detail: String(err).slice(0, 200) }],
          status: 0,
        });
        continue;
      }

      // Case brain tabs
      if (p.key === "case-brain-case9") {
        for (const tab of CASE_TABS) {
          const btn = page.getByRole("button", { name: tab }).first();
          if (await btn.count()) {
            await btn.click().catch(() => {});
            await page.waitForTimeout(400);
          }
          const shot = `${role.slug}_${vp.name}_${p.key}_${tab.replace(/\s+/g, "-").toLowerCase()}.png`;
          await page.screenshot({ path: path.join(ART, shot), fullPage: true }).catch(() => {});
        }
      }

      const text = await page.locator("body").innerText().catch(() => "");
      const issues = [
        ...analyzeText(text),
        ...(await checkOverflow(page)),
      ];
      const newConsole = consoleErrors.slice(consoleBefore);
      for (const c of newConsole.slice(0, 8)) {
        if (/favicon|Download the React DevTools/i.test(c)) continue;
        issues.push({ kind: "console_error", detail: c.slice(0, 240) });
      }
      if (status >= 400) {
        issues.push({ kind: "http_error", detail: `status ${status}` });
      }
      // empty-looking broken: only a spinner forever or blank main
      const mainText = text.replace(/\s+/g, " ").trim();
      if (mainText.length < 40 && !p.path.includes("/drills/")) {
        issues.push({ kind: "near_empty", detail: `body text length ${mainText.length}` });
      }

      const shot = `${role.slug}_${vp.name}_${p.key}.png`;
      await page.screenshot({ path: path.join(ART, shot), fullPage: true }).catch(() => {});

      findings.push({
        role: role.name,
        viewport: vp.name,
        page: p.key,
        path: p.path,
        status,
        issues,
        shot,
        textSnippet: mainText.slice(0, 180),
      });
    }
  }

  await context.close();
  return findings;
}

const roles = [
  { name: "Serena", slug: "member", id: IDS.Serena, adminView: false },
  { name: "Dr. B", slug: "coach", id: IDS["Dr. B"], adminView: true },
  { name: "Jainam", slug: "tech", id: IDS.Jainam, adminView: true },
];

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
});

const all = [];
for (const role of roles) {
  console.log("walking", role.name);
  try {
    const f = await walkRole(browser, role);
    all.push(...f);
  } catch (e) {
    all.push({
      role: role.name,
      viewport: "n/a",
      page: "sign-in",
      path: "/sign-in",
      issues: [{ kind: "sign_in_failed", detail: String(e).slice(0, 300) }],
      status: 0,
    });
  }
}
await browser.close();

const withIssues = all.filter((r) => (r.issues || []).length);
const summary = {
  totalVisits: all.length,
  withIssues: withIssues.length,
  byKind: {},
};
for (const row of withIssues) {
  for (const i of row.issues) {
    summary.byKind[i.kind] = (summary.byKind[i.kind] || 0) + 1;
  }
}

fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify({ summary, findings: all }, null, 2));
fs.writeFileSync(
  path.join(OUT, "issues-only.json"),
  JSON.stringify({ summary, findings: withIssues }, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
console.log("wrote", path.join(OUT, "findings.json"));
