/**
 * Sample-mode checks for Today, Competition Day timer, offline helpers,
 * search empty/slow shape, and program map payloads.
 *
 * Run: USE_SAMPLE_DATA=1 NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' npx tsx scripts/check-competition-day.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.USE_SAMPLE_DATA = "1";

import { readFileSync } from "fs";
import { join } from "path";
import { APPE_DAY_PHASES, formatClock } from "../src/lib/regional/timings";
import {
  catchUpAfterWake,
  defaultTimerState,
  goToPhase,
  parseStoredTimer,
  pauseRunning,
  remainingSeconds,
  shouldBuzzOneMinute,
  startRunning,
} from "../src/lib/regional/timer-engine";
import { relativeSavedLabel } from "../src/lib/offline/pack-store";
import { buildFocusActions, DEC5_HELPERS } from "../src/lib/product/today";
import {
  canWriteTeamData,
  resolveVisibleTeamId,
} from "../src/lib/auth/team-privacy";
import type { Person, SessionPayload } from "../src/lib/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

function checkTimerEngine() {
  assert(APPE_DAY_PHASES.length === 5, "five APPE phases");
  assert(APPE_DAY_PHASES[0]!.seconds === 600, "presentation 10:00");
  assert(APPE_DAY_PHASES[1]!.seconds === 60, "conferral 1:00");
  assert(formatClock(65) === "01:05", "formatClock pads");

  const t0 = Date.UTC(2026, 11, 5, 16, 0, 0);
  let state = goToPhase(0);
  assert(state.remaining === 600 && !state.running, "phase reset paused");

  state = startRunning(state, t0);
  assert(state.running && state.endsAtMs === t0 + 600_000, "start sets endsAtMs");

  // Simulate phone lock for 90 seconds: wall clock advances, interval did not.
  const afterLock = t0 + 90_000;
  const left = remainingSeconds(state, afterLock);
  assert(left === 510, `wall-clock remaining after 90s sleep (got ${left})`);

  state = catchUpAfterWake(state, afterLock);
  assert(state.remaining === 510 && state.running, "catch-up keeps running");

  state = pauseRunning(state, afterLock);
  assert(!state.running && state.endsAtMs == null && state.remaining === 510, "pause freezes remaining");

  // Cross one-minute buzz threshold.
  assert(
    shouldBuzzOneMinute(61, 60, false),
    "buzz when crossing 60s",
  );
  assert(!shouldBuzzOneMinute(60, 59, true), "no second buzz");
  assert(!shouldBuzzOneMinute(120, 119, false), "no buzz above 60");

  // Expire while asleep.
  state = startRunning(goToPhase(1), t0); // 60s conferral
  const expired = catchUpAfterWake(state, t0 + 120_000);
  assert(
    !expired.running && remainingSeconds(expired, t0 + 120_000) === 0,
    "timer ends correctly after oversleep",
  );

  // Legacy v1 JSON (no endsAtMs) still loads.
  const legacy = parseStoredTimer(
    JSON.stringify({
      phaseIndex: 2,
      remaining: 200,
      running: true,
      buzzed: false,
    }),
  );
  assert(
    legacy.phaseIndex === 2 && !legacy.running && legacy.remaining === 200,
    "legacy v1 restore does not pretend to still be running",
  );

  assert(defaultTimerState().phaseIndex === 0, "default phase 0");
}

function checkOfflineHelpers() {
  assert(
    relativeSavedLabel(new Date().toISOString()).includes("just now") ||
      relativeSavedLabel(new Date().toISOString()).includes("Saved for offline"),
    "relativeSavedLabel recent",
  );
  const hourAgo = new Date(Date.now() - 90 * 60_000).toISOString();
  assert(
    relativeSavedLabel(hourAgo).includes("hour"),
    "relativeSavedLabel hours",
  );

  const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  assert(sw.includes('VERSION = "crux-offline-v3"'), "SW cache v3");
  assert(sw.includes('"/regional"'), "SW shells /regional");
  assert(sw.includes("/api/regional"), "SW caches /api/regional");
  assert(sw.includes('"/calm"'), "SW shells /calm");
}

function checkTodayHelpers() {
  const actions = buildFocusActions(
    [{ label: "JOIN", detail: "Practice now", href: "/practice/sessions/1" }],
    [...DEC5_HELPERS].map((h) => ({
      label: h.label,
      detail: h.detail,
      href: h.href,
    })),
  );
  assert(actions.length === 3, "Today focus capped at three");
  assert(actions[0]!.kind === "join", "join preferred first when present");
  assert(
    buildFocusActions([], []).length === 0,
    "empty focus stays empty (honest empty state)",
  );
}

async function checkProgramMapSample() {
  const { resetSampleStore, readStore } = await import(
    "../src/lib/db/sample-store"
  );
  await resetSampleStore();
  const store = await readStore();
  assert(store.teams.length >= 3, "sample has three teams");
  const active = store.cases.filter((c) => c.active);
  assert(active.length >= 12, `sample has 12 active cases (got ${active.length})`);
  assert(store.competitions.length >= 1, "sample has a competition");
}

function checkTeamPrivacy() {
  const member = {
    team_id: "team-a",
    role: "member",
  } as Pick<Person, "team_id" | "role">;
  const session = {
    teamId: "team-a",
    adminView: false,
    role: "member",
  } as Pick<SessionPayload, "teamId" | "adminView" | "role">;

  const denied = resolveVisibleTeamId({
    person: member,
    session,
    requested: "team-b",
  });
  assert(denied.denied && denied.teamId === "team-a", "member forced to own team");
  assert(
    !canWriteTeamData(member, session, "team-b"),
    "member cannot write other team",
  );
  assert(
    canWriteTeamData(member, session, "team-a"),
    "member can write own team",
  );

  const adminPerson = {
    team_id: null,
    role: "tech_admin",
  } as Pick<Person, "team_id" | "role">;
  const adminSession = {
    teamId: null,
    adminView: true,
    role: "tech_admin",
  } as Pick<SessionPayload, "teamId" | "adminView" | "role">;
  const adminPick = resolveVisibleTeamId({
    person: adminPerson,
    session: adminSession,
    requested: "team-b",
  });
  assert(
    !adminPick.denied && adminPick.teamId === "team-b",
    "admin view may pick a team",
  );
}

async function main() {
  checkTimerEngine();
  checkOfflineHelpers();
  checkTodayHelpers();
  checkTeamPrivacy();
  await checkProgramMapSample();
  console.log("competition-day checks ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
