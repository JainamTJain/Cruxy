/**
 * Rough before/after timing for Wave 9 F search.
 * Usage: SHOTS_BASE=http://localhost:3010 node scripts/measure-search.mjs
 */
const BASE = process.env.SHOTS_BASE ?? "http://localhost:3010";
const STARTER = "482913";
const MEMBER_PASS = "159753";

async function jar() {
  const people = await (await fetch(`${BASE}/api/auth/people`)).json();
  const katie = people.people.find((p) => p.name?.startsWith("Katie"));
  const headers = { "content-type": "application/json" };
  let cookie = "";
  async function post(path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { ...headers, cookie },
      body: JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      cookie = c.split(";")[0];
    }
    return res;
  }
  let r = await post("/api/auth/sign-in", {
    personId: katie.id,
    code: MEMBER_PASS,
  });
  if (!r.ok) {
    r = await post("/api/auth/sign-in", {
      personId: katie.id,
      code: STARTER,
    });
  }
  await post("/api/auth/consent", { recordingOk: true });
  await post("/api/auth/choose-passcode", {
    code: MEMBER_PASS,
    confirm: MEMBER_PASS,
  });
  return cookie;
}

async function time(cookie, path) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  const ms = Math.round(performance.now() - t0);
  const json = await res.json().catch(() => ({}));
  return { ms, status: res.status, took: json.took_ms ?? null };
}

const cookie = await jar();
const queries = ["rosetta", "case 9", "museum", "claim"];
console.log("Wave 9 F search timings");
for (const q of queries) {
  const r = await time(cookie, `/api/search?q=${encodeURIComponent(q)}`);
  console.log(
    `  search q="${q}" http=${r.ms}ms server=${r.took ?? "n/a"}ms status=${r.status}`,
  );
}
const caseId = "c0000000-0000-4000-8000-000000000009";
const home = await time(cookie, `/api/case-home/${caseId}`);
console.log(`  case-home http=${home.ms}ms status=${home.status}`);
const pack = await time(cookie, `/api/offline/pack/${caseId}`);
console.log(`  offline-pack http=${pack.ms}ms status=${pack.status}`);
