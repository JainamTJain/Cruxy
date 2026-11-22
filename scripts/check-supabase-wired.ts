/**
 * Wave 8 + Wave 9 wiring audit (workstream K).
 *
 * 1. Repository exports that touch the sample store must guard with isSampleDataMode().
 * 2. Every UI fetch/form to /api/... must match a real App Router route.
 * 3. Every API route must reach a repository / service (or an allowed exception).
 * 4. Critical write → surface contracts must stay wired (Wave 8 flywheel + Wave 9
 *    C–K account, coach, regional, growth, calendar, search, help, access).
 *
 * Run: npm run check:supabase-wired
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const BAN = "Supabase path not wired yet";

const EXTRA_FILES = [
  "src/lib/library/sync.ts",
  "src/lib/library/researcher.ts",
  "src/lib/practice/pipeline.ts",
  "src/lib/case-brain/service.ts",
  "src/app/api/team/alignment/route.ts",
  "src/app/api/team/claim-maps/route.ts",
  "src/app/api/case-brain/[caseId]/route.ts",
];

/** Routes that intentionally skip a domain repository (auth handshake only). */
const ROUTE_REPO_ALLOWLIST = new Set([
  "src/app/api/auth/sign-in/route.ts",
  "src/app/api/auth/sign-out/route.ts",
  "src/app/api/auth/me/route.ts",
  "src/app/api/health/route.ts",
]);

type WriteSurfaceContract = {
  id: string;
  description: string;
  /** Files that must each match every pattern. */
  files: string[];
  patterns: RegExp[];
};

/**
 * End-to-end write surfaces people rely on. Gaps here fail CI.
 * Keep descriptions short for the PR / console report.
 */
const WRITE_SURFACE_CONTRACTS: WriteSurfaceContract[] = [
  {
    id: "chat_mention_to_notifications",
    description:
      "Chat @mention writes a notification (Reminders bell) for the mentioned person",
    files: ["src/lib/team/repository.ts"],
    patterns: [
      /function\s+notifyChatMentions|notifyChatMentions\s*\(/,
      /createNotification\s*\(/,
      /kind:\s*["']chat_mention["']/,
      /postMessage[\s\S]*notifyChatMentions/,
    ],
  },
  {
    id: "accept_claim_change_to_team_brief",
    description:
      "Accepted claim suggestion publishes a new claim map version (Team Brief)",
    files: [
      "src/lib/team/repository.ts",
      "src/lib/db/supabase/team.ts",
    ],
    patterns: [
      /acceptClaimChange/,
      /claim_map_versions|insertVersion/,
    ],
  },
  {
    id: "accept_proposal_to_evidence_library",
    description:
      "Accepted case-brain proposal becomes an accepted truth_item (Evidence Library)",
    files: [
      "src/lib/case-brain/service.ts",
      "src/lib/db/supabase/case-brain.ts",
    ],
    patterns: [/decideProposal/, /truth_items/],
  },
  {
    id: "practice_speak_moves_roadmap",
    description:
      "Finished practice speak recompute roadmap stages (practiced row moves)",
    files: [
      "src/lib/revision/repository.ts",
      "src/lib/db/supabase/revision.ts",
    ],
    patterns: [
      /recordPracticeSpeak/,
      /recomputeRoadmapStages/,
    ],
  },
  {
    id: "question_drill_moves_roadmap",
    description:
      "Question answers recompute roadmap (question_drill stage)",
    files: [
      "src/lib/revision/repository.ts",
      "src/lib/db/supabase/revision.ts",
    ],
    patterns: [/recomputeRoadmapStages/],
  },
  {
    id: "admin_health_last_24h",
    description:
      "Admin health / weekly errors list only refused AI calls from the last 24 hours",
    files: [
      "src/lib/db/supabase/program.ts",
      "src/lib/db/repository.ts",
      "src/lib/types.ts",
      "src/app/(app)/admin/admin-console.tsx",
    ],
    patterns: [
      /AI_ERRORS_LAST_24H_NOTE|errorsNote|last 24 hours/i,
      /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|24 hours/i,
    ],
  },
  {
    id: "forgot_passcode_service",
    description:
      "Forgot passcode service: request, approve, complete; never stores old plaintext",
    files: ["src/lib/auth/forgot-passcode.ts"],
    patterns: [
      /requestForgotPasscode/,
      /approveForgotPasscode/,
      /completeForgotPasscode/,
      /encrypted_copy:\s*null/,
      /MAX_REQUESTS_PER_DAY/,
    ],
  },
  {
    id: "forgot_passcode_ui",
    description: "Sign-in Forgot button and reminder Approve reset",
    files: [
      "src/app/sign-in/page.tsx",
      "src/components/notification-bell.tsx",
    ],
    patterns: [/Forgot passcode|Approve reset|passcode_reset_request/],
  },
  {
    id: "signed_in_devices_service",
    description: "Device register and revoke-others helpers",
    files: ["src/lib/auth/devices.ts"],
    patterns: [/registerAuthDevice/, /revokeOtherDevices/, /isDeviceActive/],
  },
  {
    id: "signed_in_devices_ui",
    description: "Settings devices API and Signed-in devices panel",
    files: [
      "src/app/api/settings/devices/route.ts",
      "src/app/(app)/settings/page.tsx",
    ],
    patterns: [/revoke_others|Signed-in devices/],
  },
  {
    id: "coach_who_is_behind_service",
    description: "Coach snapshot and nudge",
    files: ["src/lib/coach/team-view.ts"],
    patterns: [
      /getCoachTeamSnapshot/,
      /sendCoachNudge/,
      /STALE_DAYS/,
      /openBriefItems/,
    ],
  },
  {
    id: "coach_who_is_behind_ui",
    description: "Coach team page nudge and Team Brief list",
    files: [
      "src/app/(app)/coach/[teamId]/page.tsx",
      "src/app/api/coach/nudge/route.ts",
    ],
    patterns: [/Gentle nudge|sendCoachNudge|Open Team Brief/],
  },
  {
    id: "coach_printable_weekly_report",
    description: "Printable weekly coach report page",
    files: ["src/app/(app)/coach/[teamId]/report/page.tsx"],
    patterns: [
      /Printable weekly team report/,
      /\/api\/coach\/teams\//,
      /window\.print/,
    ],
  },
  {
    id: "wave9_c_competition_day",
    description: "Competition day hub: logistics, real-round log, debrief",
    files: [
      "src/lib/regional/service.ts",
      "src/app/api/regional/route.ts",
      "src/components/regional/regional-client.tsx",
    ],
    patterns: [
      /logRealRound|saveDebrief|getCompetitionDayHub|\/api\/regional/,
    ],
  },
  {
    id: "wave9_d_progress_privacy",
    description: "Progress and privacy centre call their APIs",
    files: [
      "src/app/(app)/progress/page.tsx",
      "src/app/(app)/settings/privacy/page.tsx",
    ],
    patterns: [
      /\/api\/my-progress|\/api\/goals|\/api\/privacy\/inventory|\/api\/privacy\/export/,
    ],
  },
  {
    id: "wave9_d_growth_services",
    description: "Growth services: progress, reflections, goals, export",
    files: [
      "src/lib/learning/progress.ts",
      "src/lib/learning/reflections.ts",
      "src/lib/learning/goals.ts",
      "src/lib/ops/personal-export.ts",
    ],
    patterns: [
      /getMyProgressView|upsertReflection|createGoal|buildPersonalDataExport/,
    ],
  },
  {
    id: "wave9_e_team_calendar_kudos",
    description: "Team calendar and kudos APIs reach calendar-repository",
    files: [
      "src/lib/team/calendar-repository.ts",
      "src/app/api/team/calendar/route.ts",
      "src/app/api/team/kudos/route.ts",
    ],
    patterns: [/createTeamEvent|createKudos|peer_kudos|kind:\s*["']kudos["']/],
  },
  {
    id: "wave9_f_search_offline",
    description: "Global search and offline case pack API",
    files: [
      "src/lib/search/global.ts",
      "src/app/api/search/route.ts",
      "src/app/api/offline/pack/[caseId]/route.ts",
      "src/components/search/command-palette.tsx",
    ],
    patterns: [
      /searchGlobal|\/api\/search|Bundle everything a person needs offline|getCaseHome/,
    ],
  },
  {
    id: "wave9_g_help_feedback",
    description: "Help report button posts product_feedback",
    files: [
      "src/lib/db/supabase/product-feedback-extra.ts",
      "src/app/api/help/feedback/route.ts",
      "src/components/help/report-problem-button.tsx",
    ],
    patterns: [
      /createProductFeedback|product_feedback|\/api\/help\/feedback|Report a problem/,
    ],
  },
  {
    id: "wave9_i_access",
    description: "Display prefs and explain-this-term via callCruxy",
    files: [
      "src/app/api/prefs/access/route.ts",
      "src/app/api/access/explain/route.ts",
      "src/components/access/display-settings.tsx",
      "src/components/access/explain-term.tsx",
      "src/components/case/reading-tools.tsx",
    ],
    patterns: [
      /\/api\/prefs\/access|\/api\/access\/explain|callCruxy|access_explain_term|text_size|high_contrast|readable_font/,
    ],
  },
  {
    id: "wave9_sample_store_bags",
    description:
      "migrateStoreShape keeps Wave 9 sample bags (devices, reset, growth, calendar, feedback)",
    files: ["src/lib/db/sample-store.ts"],
    patterns: [
      /auth_devices:\s*raw\.auth_devices/,
      /passcode_reset_requests:\s*raw\.passcode_reset_requests/,
      /round_reflections:\s*raw\.round_reflections/,
      /personal_goals:\s*raw\.personal_goals/,
      /peer_kudos:\s*raw\.peer_kudos/,
      /team_events:\s*raw\.team_events/,
      /calendar_feed_tokens:\s*raw\.calendar_feed_tokens/,
      /product_feedback:\s*raw\.product_feedback/,
      /solo_handoffs:\s*raw\.solo_handoffs/,
    ],
  },
  {
    id: "wave9_e_solo_async_prep",
    description: "Solo async prep: my part, minutes, handoff, review",
    files: [
      "src/lib/team/solo-prep-repository.ts",
      "src/app/api/prepare/parts/route.ts",
      "src/app/api/prepare/handoff/route.ts",
      "src/app/(app)/prepare/page.tsx",
    ],
    patterns: [
      /getMyParts|createHandoff|solo_handoffs|\/api\/prepare\/parts|\/api\/prepare\/handoff/,
    ],
  },
  {
    id: "wave9_c_working_document",
    description: "Working document hub API and case page",
    files: [
      "src/lib/working-doc/service.ts",
      "src/app/api/case/working-document/route.ts",
    ],
    patterns: [/getWorkingDocumentHub|\/api\/case\/working-document/],
  },
  {
    id: "wave9_h_season_hub",
    description: "After-regional season hub",
    files: [
      "src/lib/season/service.ts",
      "src/app/api/season/route.ts",
    ],
    patterns: [/loadSeasonHub|\/api\/season/],
  },
  {
    id: "wave9_h_season_page",
    description: "Season hub client loads /api/season",
    files: ["src/components/season/season-hub-client.tsx"],
    patterns: [/\/api\/season/],
  },
  {
    id: "wave9_j_reach_calm",
    description: "Notifications page and pre-round calm routine",
    files: [
      "src/app/(app)/notifications/page.tsx",
      "src/app/(app)/calm/page.tsx",
      "src/app/api/calm/log/route.ts",
    ],
    patterns: [/\/api\/notifications|\/api\/calm\/log|logCalmRoutine|calm/],
  },
  {
    id: "practice_finalize_moves_roadmap",
    description: "Finalize records practice speak so roadmap/Today move",
    files: ["src/lib/practice/pipeline.ts"],
    patterns: [/recordPracticeSpeak|replaceTranscriptForRound/],
  },
  {
    id: "practice_drill_resume",
    description: "Drill start resumes open round; checkpoint API saves UI state",
    files: [
      "src/app/api/practice/drills/start/route.ts",
      "src/app/api/practice/rounds/[id]/checkpoint/route.ts",
      "src/lib/db/practice-repository.ts",
    ],
    patterns: [/findOpenDrillRound|saveDrillCheckpoint|resumed|drill_checkpoint/],
  },
  {
    id: "score_predictions_coach_visible",
    description: "Score predictions visible to person, Dr. B and Jainam",
    files: [
      "src/lib/ops/privacy-scope.ts",
      "src/app/api/practice/rounds/[id]/predictions/route.ts",
      "src/app/(app)/settings/page.tsx",
    ],
    patterns: [
      /canViewScorePredictions|coachOrTech|visible to you, Dr\. B and Jainam/,
    ],
  },
];

function walk(dir: string, out: string[] = [], pred?: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out, pred);
    else if (!pred || pred(name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Top-level export async function bodies (brace-balanced). */
function exportedAsyncFunctions(
  src: string,
): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const name = match[1];
    const start = match.index + match[0].length - 1; // at '{'
    let depth = 0;
    let i = start;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    out.push({ name, body: src.slice(start, i) });
  }
  return out;
}

function usesSampleStore(body: string): boolean {
  return (
    /\breadStore\s*\(/.test(body) || /\bupdateStore\s*\(/.test(body)
  );
}

function hasSampleGuard(body: string): boolean {
  return /isSampleDataMode\s*\(/.test(body);
}

const gaps: string[] = [];

function fail(msg: string) {
  console.error(`FAIL: ${msg}`);
  gaps.push(msg);
}

function ok(msg: string) {
  console.log(`ok: ${msg}`);
}

// ---------------------------------------------------------------------------
// 1) Sample-store guards (original check)
// ---------------------------------------------------------------------------
console.log("\n=== 1) Sample-store guards ===");

for (const file of walk(join(SRC, "lib"), [], (n) => n.endsWith("repository.ts"))) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  if (text.includes(BAN)) {
    fail(`${rel} still contains "${BAN}"`);
  }
}

const targets = [
  ...walk(join(SRC, "lib"), [], (n) => n.endsWith("repository.ts")),
  join(SRC, "lib", "case-brain", "service.ts"),
  ...EXTRA_FILES.map((f) => join(ROOT, f)),
];
const seen = new Set<string>();

for (const file of targets) {
  if (seen.has(file)) continue;
  seen.add(file);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(`missing file ${relative(ROOT, file)}`);
    continue;
  }
  const rel = relative(ROOT, file);
  const cleaned = stripComments(text);

  const isRepoLike =
    rel.endsWith("repository.ts") ||
    rel.endsWith(join("case-brain", "service.ts")) ||
    rel.includes(`${join("case-brain")}${join("service.ts")}`);
  if (
    !isRepoLike &&
    /from\s+["']@\/lib\/db\/sample-store["']/.test(cleaned)
  ) {
    fail(`${rel} imports sample-store (use repository helpers instead)`);
  }

  for (const fn of exportedAsyncFunctions(cleaned)) {
    if (!usesSampleStore(fn.body)) continue;
    if (!hasSampleGuard(fn.body)) {
      fail(
        `${rel} :: ${fn.name}() reads readStore/updateStore without isSampleDataMode() guard`,
      );
    }
  }

  ok(rel);
}

// ---------------------------------------------------------------------------
// 2) UI → route map
// ---------------------------------------------------------------------------
console.log("\n=== 2) UI → route map ===");

type RouteInfo = {
  rel: string;
  pattern: RegExp;
  apiPath: string;
  methods: Set<string>;
  text: string;
};

function collectRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const file of walk(join(SRC, "app", "api"), [], (n) => n === "route.ts")) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const apiRel = rel
      .replace(/^src\/app\/api\//, "")
      .replace(/\/route\.ts$/, "");
    const segs = apiRel.split("/").map((part) => {
      if (part.startsWith("[") && part.endsWith("]")) return "[^/]+";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    const text = readFileSync(file, "utf8");
    const methods = new Set<string>();
    for (const m of text.matchAll(
      /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
    )) {
      methods.add(m[1]);
    }
    routes.push({
      rel,
      apiPath: `/api/${apiRel}`,
      pattern: new RegExp(`^/api/${segs.join("/")}$`),
      methods,
      text,
    });
  }
  return routes;
}

const routes = collectRoutes();
ok(`${routes.length} API routes indexed`);

/** Normalize a fetch URL: drop query, turn ${...} path segments into *. */
function normalizeApiUrl(raw: string): string {
  let url = raw.split("?")[0];
  // `/api/case-brain/${id}` → `/api/case-brain/*`
  url = url.replace(/\/\$\{[^}]+\}/g, "/*");
  // `/api/team/chat${q}` where q builds `?…` → `/api/team/chat`
  url = url.replace(/\$\{[^}]+\}/g, "");
  // Drop empty trailing slash left by bad templates, keep `/*`
  if (url.endsWith("/") && !url.endsWith("/*/")) {
    url = url.replace(/\/+$/, "");
  }
  return url;
}

function urlMatchesRoute(url: string, route: RouteInfo): boolean {
  const cand = url.replace(/\*/g, "x");
  return route.pattern.test(cand);
}

type UiCall = { url: string; file: string; methodHint: string };

function collectUiApiCalls(): UiCall[] {
  const calls: UiCall[] = [];
  const files = [
    ...walk(join(SRC, "app"), [], (n) => n.endsWith(".ts") || n.endsWith(".tsx")),
    ...walk(join(SRC, "components"), [], (n) => n.endsWith(".ts") || n.endsWith(".tsx")),
  ].filter((f) => !f.includes(`${join("app", "api")}`));

  const fetchLit = /fetch\(\s*(['"`])(\/api\/[^'"`]*?)\1/g;
  const fetchTpl = /fetch\(\s*`(\/api\/[^`]*)`/g;
  const formAction = /(?:action|href)=(['"`])(\/api\/[^'"`]+)\1/g;
  const methodRe = /method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/;

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const found: { raw: string; index: number }[] = [];
    for (const m of text.matchAll(fetchLit)) {
      found.push({ raw: m[2], index: m.index ?? 0 });
    }
    for (const m of text.matchAll(fetchTpl)) {
      found.push({ raw: m[1], index: m.index ?? 0 });
    }
    for (const m of text.matchAll(formAction)) {
      found.push({ raw: m[2], index: m.index ?? 0 });
    }
    for (const f of found) {
      const url = normalizeApiUrl(f.raw);
      if (!url.startsWith("/api/")) continue;
      const window = text.slice(f.index, f.index + 280);
      const mm = window.match(methodRe);
      let methodHint = mm ? mm[1] : "GET";
      if (
        methodHint === "GET" &&
        (/JSON\.stringify/.test(window) || /FormData/.test(window)) &&
        !/method:\s*['"]GET['"]/.test(window)
      ) {
        methodHint = "POST";
      }
      calls.push({ url, file: rel, methodHint });
    }
  }
  return calls;
}

const uiCalls = collectUiApiCalls();
const uniqueUi = new Map<string, UiCall>();
for (const c of uiCalls) {
  uniqueUi.set(`${c.url}::${c.file}`, c);
}

let uiOk = 0;
for (const c of uniqueUi.values()) {
  const match = routes.find((r) => urlMatchesRoute(c.url, r));
  if (!match) {
    fail(`UI calls missing route: ${c.url} (from ${c.file})`);
    continue;
  }
  uiOk += 1;
}
ok(`UI → route: ${uiOk} call sites matched (${uniqueUi.size} unique)`);

// ---------------------------------------------------------------------------
// 3) Route → repository / service map
// ---------------------------------------------------------------------------
console.log("\n=== 3) Route → repository map ===");

const REPO_IMPORT =
  /from\s+["']@\/lib\/(?:db\/repository|team\/repository|team\/roles-board-repository|case-brain\/service|case-brain\/[^"']+|practice\/[^"']+|revision\/[^"']+|library\/[^"']+|graph\/[^"']+|cruxy\/[^"']+|auth\/[^"']+|admin\/[^"']+|email\/[^"']+|ops\/[^"']+|coach\/[^"']+|notify\/[^"']+|learning\/[^"']+|product\/[^"']+|case-home\/[^"']+|home\/[^"']+|db\/supabase\/[^"']+)["']/;

let routeRepoOk = 0;
for (const route of routes) {
  if (ROUTE_REPO_ALLOWLIST.has(route.rel)) {
    ok(`allowlisted ${route.rel}`);
    routeRepoOk += 1;
    continue;
  }
  const cleaned = stripComments(route.text);
  if (!REPO_IMPORT.test(cleaned)) {
    // Also accept relative imports into lib via deep paths already covered.
    // Cron / webhook style that only imports email helpers still match above.
    fail(
      `route has no repository/service import: ${route.rel} (${route.apiPath})`,
    );
    continue;
  }
  routeRepoOk += 1;
}
ok(`Route → repo: ${routeRepoOk}/${routes.length} routes wired`);

// Soft map: each repository under src/lib/** that has a supabase twin
console.log("\n=== 3b) Repository → Supabase twin ===");
const repoFiles = walk(join(SRC, "lib"), [], (n) => n.endsWith("repository.ts"));
for (const file of repoFiles) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const text = readFileSync(file, "utf8");
  const cleaned = stripComments(text);
  // Domain repos should branch to supabase or isSampleDataMode
  if (
    !/isSampleDataMode\s*\(/.test(cleaned) &&
    !/getServiceSupabase\s*\(/.test(cleaned) &&
    !/from\s+["']@\/lib\/db\/supabase\//.test(cleaned)
  ) {
    // roles-board-repository etc may import createNotification + supabase helpers
    if (!/supabase/.test(cleaned)) {
      fail(`${rel} has no Supabase / sample-mode branch`);
      continue;
    }
  }
  ok(`repo→supabase: ${rel}`);
}

// ---------------------------------------------------------------------------
// 4) Write → surface contracts
// ---------------------------------------------------------------------------
console.log("\n=== 4) Write → surface contracts ===");

for (const contract of WRITE_SURFACE_CONTRACTS) {
  let contractOk = true;
  for (const f of contract.files) {
    const abs = join(ROOT, f);
    if (!existsSync(abs)) {
      fail(`[${contract.id}] missing file ${f}`);
      contractOk = false;
      continue;
    }
    const text = readFileSync(abs, "utf8");
    for (const pat of contract.patterns) {
      if (!pat.test(text)) {
        fail(
          `[${contract.id}] ${f} missing pattern ${pat}: ${contract.description}`,
        );
        contractOk = false;
      }
    }
  }
  if (contractOk) {
    ok(`[${contract.id}] ${contract.description}`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log("\n=== Wiring audit report ===");
if (gaps.length) {
  console.error(`\nGaps found (${gaps.length}):`);
  for (const g of gaps) console.error(`  - ${g}`);
  console.error("\ncheck-supabase-wired: FAILED");
  process.exit(1);
}
console.log("No gaps. UI→route, route→repo, and write→surface contracts hold.");
console.log("check-supabase-wired: all repository exports guarded + wiring map ok");
