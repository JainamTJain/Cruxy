/**
 * Time case-brain + case-home (Wave F save/share speed pass).
 * Usage: SHOTS_BASE=http://localhost:3022 node scripts/measure-case-load.mjs
 */
const BASE = process.env.SHOTS_BASE ?? "http://localhost:3022";
const CASE9 = "c0000000-0000-4000-8000-000000000009";

async function jar() {
  const people = await (await fetch(`${BASE}/api/auth/people`)).json();
  const katie = people.people.find((p) => p.name?.startsWith("Katie"));
  let cookie = "";
  async function post(path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) cookie = c.split(";")[0];
    return res;
  }
  let r = await post("/api/auth/sign-in", { personId: katie.id, code: "159753" });
  if (!r.ok) {
    r = await post("/api/auth/sign-in", { personId: katie.id, code: "482913" });
  }
  await post("/api/auth/consent", { recordingOk: true });
  await post("/api/auth/choose-passcode", { code: "159753", confirm: "159753" });
  await post("/api/learning-profile", {
    sliders: {
      visual_verbal: 50,
      analogies_formal: 50,
      ethical_mechanization: 50,
      short_deep: 50,
      direct_gentle: 50,
    },
    appeBaselines: {
      clarity: 5,
      ethical_analysis: 5,
      engagement: 5,
      commentary: 5,
      response: 5,
    },
  });
  return cookie;
}

async function time(cookie, path) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  const ms = Math.round(performance.now() - t0);
  await res.arrayBuffer();
  return { ms, status: res.status };
}

const cookie = await jar();
console.log("Case load timings");
for (let i = 0; i < 3; i++) {
  const brain = await time(cookie, `/api/case-brain/${CASE9}`);
  const home = await time(cookie, `/api/case-home/${CASE9}`);
  const lite = await time(cookie, `/api/case-brain/${CASE9}?lite=1`);
  console.log(
    `  run ${i + 1}: brain=${brain.ms}ms home=${home.ms}ms lite=${lite.ms}ms`,
  );
}
