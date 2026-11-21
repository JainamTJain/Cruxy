/**
 * Workstream G Wave 6: flywheel dashboard aggregations.
 * Soft-bridges to K (arg_edges), H (attacks), C (kappa / cards),
 * D (Brier / predictions), E+F (mastery / reviews). Empty until sources land.
 */
import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore } from "@/lib/db/sample-store";
import { listCases, listPeopleFull, listTeams } from "@/lib/db/repository";

export type FlywheelRowLink = {
  id: string;
  label: string;
  href: string;
  meta?: string;
};

export type FlywheelTile = {
  id: string;
  title: string;
  source: string;
  ready: boolean;
  emptyMessage: string;
  summary: string;
  value: number | null;
  secondary?: string;
  series: { label: string; value: number }[];
  rows: FlywheelRowLink[];
};

async function tableExists(name: string): Promise<boolean> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as Record<string, unknown>;
    return Array.isArray(bag[name]);
  }
  const sb = getServiceSupabase();
  const { error } = await sb.from(name).select("*").limit(1);
  if (!error) return true;
  // undefined table / schema cache miss
  const msg = error.message?.toLowerCase() ?? "";
  if (msg.includes("does not exist") || msg.includes("schema cache")) {
    return false;
  }
  // Other errors still mean the table is addressable
  return true;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

/** Cohen's kappa for two ordinal raters (rounded to integers). */
export function cohenKappa(
  a: number[],
  b: number[],
): { kappa: number; n: number } | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const pairs = a.slice(0, n).map((x, i) => [Math.round(x), Math.round(b[i]!)] as const);
  const categories = [...new Set(pairs.flat())].sort((x, y) => x - y);
  if (categories.length < 2) return null;
  const matrix = new Map<string, number>();
  for (const [x, y] of pairs) {
    const k = `${x}:${y}`;
    matrix.set(k, (matrix.get(k) ?? 0) + 1);
  }
  let agree = 0;
  for (const c of categories) agree += matrix.get(`${c}:${c}`) ?? 0;
  const po = agree / n;
  let pe = 0;
  for (const c of categories) {
    let row = 0;
    let col = 0;
    for (const d of categories) {
      row += matrix.get(`${c}:${d}`) ?? 0;
      col += matrix.get(`${d}:${c}`) ?? 0;
    }
    pe += (row / n) * (col / n);
  }
  if (pe >= 0.999) return { kappa: 1, n };
  return { kappa: (po - pe) / (1 - pe), n };
}

/** Mean Brier for probabilistic forecasts vs outcomes on 1-10 scaled to 0-1. */
export function meanBrier(
  preds: number[],
  actuals: number[],
): { brier: number; n: number } | null {
  const n = Math.min(preds.length, actuals.length);
  if (n < 3) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.min(1, Math.max(0, (preds[i]! - 1) / 9));
    const o = Math.min(1, Math.max(0, (actuals[i]! - 1) / 9));
    sum += (p - o) ** 2;
  }
  return { brier: sum / n, n };
}

async function edgesTile(): Promise<FlywheelTile> {
  const days = lastNDays(14);
  const empty: FlywheelTile = {
    id: "edges",
    title: "Edges added per day",
    source: "K, arg_edges",
    ready: false,
    emptyMessage:
      "Not enough data yet. Waiting for Workstream K's arg_edges graph spine.",
    summary: "Not enough data yet",
    value: null,
    series: [],
    rows: [],
  };

  const exists = await tableExists("arg_edges");
  if (!exists) return empty;

  type EdgeRow = {
    id: string;
    type: string;
    created_at: string;
    from_kind?: string;
    to_kind?: string;
    round_id?: string | null;
  };

  let edges: EdgeRow[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    edges = ((store as unknown as { arg_edges?: EdgeRow[] }).arg_edges ??
      []) as EdgeRow[];
  } else {
    const sb = getServiceSupabase();
    const since = days[0];
    const { data, error } = await sb
      .from("arg_edges")
      .select("id, type, created_at, from_kind, to_kind, round_id")
      .gte("created_at", `${since}T00:00:00.000Z`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return empty;
    edges = (data as EdgeRow[]) ?? [];
  }

  if (edges.length === 0) {
    return {
      ...empty,
      ready: true,
      emptyMessage: "No edges recorded yet. Graph writes will show up here.",
      summary: "0 edges in the last 14 days",
      value: 0,
    };
  }

  const byDay = new Map<string, number>();
  for (const d of days) byDay.set(d, 0);
  for (const e of edges) {
    const k = dayKey(e.created_at);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const today = days[days.length - 1]!;
  const todayCount = byDay.get(today) ?? 0;

  return {
    id: "edges",
    title: "Edges added per day",
    source: "K, arg_edges",
    ready: true,
    emptyMessage: "",
    summary: `${todayCount} today, ${edges.length} in 14 days`,
    value: todayCount,
    series: days.map((d) => ({ label: d.slice(5), value: byDay.get(d) ?? 0 })),
    rows: edges.slice(0, 40).map((e) => ({
      id: e.id,
      label: `${e.type}: ${e.from_kind ?? "node"} to ${e.to_kind ?? "node"}`,
      href: e.round_id
        ? `/practice/rounds/${e.round_id}`
        : "/admin/flywheel?tile=edges",
      meta: dayKey(e.created_at),
    })),
  };
}

async function attacksTile(): Promise<FlywheelTile> {
  const empty: FlywheelTile = {
    id: "attacks",
    title: "Open vs answered attacks",
    source: "H, robustness / attack edges",
    ready: false,
    emptyMessage:
      "Not enough data yet. Waiting for Workstream H to classify round questions onto claim attacks.",
    summary: "Not enough data yet",
    value: null,
    series: [],
    rows: [],
  };

  const hasEdges = await tableExists("arg_edges");
  if (!hasEdges) return empty;

  type EdgeRow = {
    id: string;
    type: string;
    to_id?: string;
    from_id?: string;
    round_id?: string | null;
    created_at: string;
    answered?: boolean | null;
    meta?: Record<string, unknown> | null;
  };

  let edges: EdgeRow[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    edges = (
      (store as unknown as { arg_edges?: EdgeRow[] }).arg_edges ?? []
    ).filter((e) => e.type === "attacks" || e.type === "tested_by_question");
  } else {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("arg_edges")
      .select("*")
      .in("type", ["attacks", "tested_by_question"])
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return empty;
    edges = (data as EdgeRow[]) ?? [];
  }

  if (edges.length === 0) {
    return {
      ...empty,
      ready: true,
      emptyMessage: "No attack edges yet. Open and answered counts stay empty until H writes them.",
      summary: "0 open, 0 answered",
      value: 0,
      secondary: "0 answered",
    };
  }

  const open = edges.filter((e) => {
    if (typeof e.answered === "boolean") return !e.answered;
    const meta = e.meta ?? {};
    if (typeof meta.answered === "boolean") return !meta.answered;
    // Untagged attacks count as open until H marks them answered
    return e.type === "attacks" || e.type === "tested_by_question";
  });
  const answered = edges.filter((e) => {
    if (typeof e.answered === "boolean") return e.answered;
    const meta = e.meta ?? {};
    return meta.answered === true;
  });

  return {
    id: "attacks",
    title: "Open vs answered attacks",
    source: "H, robustness / attack edges",
    ready: true,
    emptyMessage: "",
    summary: `${open.length} open, ${answered.length} answered`,
    value: open.length,
    secondary: `${answered.length} answered`,
    series: [
      { label: "Open", value: open.length },
      { label: "Answered", value: answered.length },
    ],
    rows: [...open, ...answered].slice(0, 40).map((e) => {
      const isOpen =
        typeof e.answered === "boolean"
          ? !e.answered
          : e.meta?.answered !== true;
      return {
        id: e.id,
        label: `${isOpen ? "Open" : "Answered"} ${e.type}`,
        href: e.round_id
          ? `/practice/rounds/${e.round_id}`
          : e.to_id
            ? `/case-brain`
            : "/admin/flywheel?tile=attacks",
        meta: dayKey(e.created_at),
      };
    }),
  };
}

async function kappaTile(): Promise<FlywheelTile> {
  const empty: FlywheelTile = {
    id: "kappa",
    title: "Judge kappa trend",
    source: "C, human vs Cruxy cards",
    ready: false,
    emptyMessage:
      "Not enough data yet. Need at least five paired human and Cruxy item scores.",
    summary: "Not enough data yet",
    value: null,
    series: [],
    rows: [],
  };

  type Card = {
    id: string;
    round_id: string;
    cruxy: boolean;
    team_id: string;
    created_at: string;
  };
  type Score = {
    id: string;
    card_id: string;
    item: string;
    score: number;
  };

  let cards: Card[] = [];
  let scores: Score[] = [];

  if (isSampleDataMode()) {
    const store = await readStore();
    cards = store.judge_cards as Card[];
    scores = store.card_scores as Score[];
  } else {
    const sb = getServiceSupabase();
    const [cRes, sRes] = await Promise.all([
      sb
        .from("judge_cards")
        .select("id, round_id, cruxy, team_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      sb.from("card_scores").select("id, card_id, item, score").limit(2000),
    ]);
    if (cRes.error || sRes.error) return empty;
    cards = (cRes.data as Card[]) ?? [];
    scores = (sRes.data as Score[]) ?? [];
  }

  const byRoundTeam = new Map<string, { human: Card[]; cruxy: Card[] }>();
  for (const c of cards) {
    const key = `${c.round_id}:${c.team_id}`;
    const bag = byRoundTeam.get(key) ?? { human: [], cruxy: [] };
    if (c.cruxy) bag.cruxy.push(c);
    else bag.human.push(c);
    byRoundTeam.set(key, bag);
  }

  const humanScores: number[] = [];
  const cruxyScores: number[] = [];
  const rowLinks: FlywheelRowLink[] = [];
  const seriesPoints: { label: string; value: number }[] = [];

  for (const [key, bag] of byRoundTeam) {
    if (!bag.human.length || !bag.cruxy.length) continue;
    const humanCard = bag.human[0]!;
    const cruxyCard = bag.cruxy[0]!;
    const hScores = scores.filter((s) => s.card_id === humanCard.id);
    const cScores = scores.filter((s) => s.card_id === cruxyCard.id);
    for (const hs of hScores) {
      const cs = cScores.find((x) => x.item === hs.item);
      if (!cs) continue;
      humanScores.push(hs.score);
      cruxyScores.push(cs.score);
    }
    const pairKappa = cohenKappa(
      hScores.map((s) => s.score),
      hScores.map((s) => cScores.find((x) => x.item === s.item)?.score ?? s.score),
    );
    if (pairKappa) {
      seriesPoints.push({
        label: humanCard.created_at.slice(5, 10),
        value: Number(pairKappa.kappa.toFixed(2)),
      });
      rowLinks.push({
        id: humanCard.id,
        label: `Round pair kappa ${pairKappa.kappa.toFixed(2)} (n=${pairKappa.n})`,
        href: `/admin/calibration?roundId=${humanCard.round_id}`,
        meta: key,
      });
    }
  }

  const overall = cohenKappa(humanScores, cruxyScores);
  if (!overall) {
    return {
      ...empty,
      ready: true,
      emptyMessage:
        humanScores.length === 0
          ? "No paired human and Cruxy cards yet."
          : `Only ${humanScores.length} paired item scores so far (need 5).`,
      summary: "Not enough data yet",
      rows: rowLinks.slice(0, 20),
    };
  }

  return {
    id: "kappa",
    title: "Judge kappa trend",
    source: "C, human vs Cruxy cards",
    ready: true,
    emptyMessage: "",
    summary: `kappa ${overall.kappa.toFixed(2)} over ${overall.n} item pairs`,
    value: Number(overall.kappa.toFixed(2)),
    series: seriesPoints.slice(-14),
    rows: rowLinks.slice(0, 40),
  };
}

type BrierPersonBag = {
  p: number[];
  a: number[];
  roundId?: string;
  /** Pre-aggregated Brier from D (used when pair samples are absent). */
  preAgg?: { brier: number; n: number };
};

async function brierFromDTables(): Promise<{
  preds: number[];
  actuals: number[];
  byPerson: Map<string, BrierPersonBag>;
  preAggOverall?: { brier: number; n: number };
} | null> {
  // Prefer Workstream D's dedicated tables when they land (00031).
  type BrierRow = {
    id: string;
    person_id: string;
    brier: number | null;
    n: number | null;
    round_id?: string | null;
    predicted?: number | null;
    actual?: number | null;
    created_at?: string;
  };
  type PredRow = {
    id: string;
    person_id: string;
    round_id: string;
    item: string;
    predicted: number;
    actual: number | null;
  };

  const hasScores = await tableExists("prediction_brier_scores");
  const hasPreds = await tableExists("round_score_predictions");
  if (!hasScores && !hasPreds) return null;

  const byPerson = new Map<string, BrierPersonBag>();
  const preds: number[] = [];
  const actuals: number[] = [];
  let preAggOverall: { brier: number; n: number } | undefined;

  if (hasScores) {
    let rows: BrierRow[] = [];
    if (isSampleDataMode()) {
      const store = await readStore();
      rows =
        ((store as unknown as { prediction_brier_scores?: BrierRow[] })
          .prediction_brier_scores ?? []) as BrierRow[];
    } else {
      const sb = getServiceSupabase();
      const { data, error } = await sb
        .from("prediction_brier_scores")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return null;
      rows = (data as BrierRow[]) ?? [];
    }

    let weighted = 0;
    let weightN = 0;
    for (const r of rows) {
      if (typeof r.predicted === "number" && typeof r.actual === "number") {
        preds.push(r.predicted);
        actuals.push(r.actual);
        const bag = byPerson.get(r.person_id) ?? { p: [], a: [] };
        bag.p.push(r.predicted);
        bag.a.push(r.actual);
        if (r.round_id) bag.roundId = r.round_id;
        byPerson.set(r.person_id, bag);
      } else if (typeof r.brier === "number" && (r.n ?? 0) > 0) {
        const n = r.n ?? 1;
        const bag = byPerson.get(r.person_id) ?? { p: [], a: [] };
        const prevN = bag.preAgg?.n ?? 0;
        const prevB = bag.preAgg?.brier ?? 0;
        bag.preAgg = {
          brier: (prevB * prevN + r.brier * n) / (prevN + n),
          n: prevN + n,
        };
        if (r.round_id) bag.roundId = r.round_id;
        byPerson.set(r.person_id, bag);
        weighted += r.brier * n;
        weightN += n;
      }
    }
    if (weightN > 0) preAggOverall = { brier: weighted / weightN, n: weightN };
  }

  if (preds.length === 0 && hasPreds) {
    let rows: PredRow[] = [];
    if (isSampleDataMode()) {
      const store = await readStore();
      rows =
        ((store as unknown as { round_score_predictions?: PredRow[] })
          .round_score_predictions ?? []) as PredRow[];
    } else {
      const sb = getServiceSupabase();
      const { data, error } = await sb
        .from("round_score_predictions")
        .select("id, person_id, round_id, item, predicted, actual")
        .not("actual", "is", null)
        .limit(2000);
      if (error) return null;
      rows = (data as PredRow[]) ?? [];
    }
    for (const r of rows) {
      if (r.actual == null) continue;
      preds.push(r.predicted);
      actuals.push(r.actual);
      const bag = byPerson.get(r.person_id) ?? { p: [], a: [] };
      bag.p.push(r.predicted);
      bag.a.push(r.actual);
      bag.roundId = r.round_id;
      byPerson.set(r.person_id, bag);
    }
  }

  if (preds.length === 0 && byPerson.size === 0 && !preAggOverall) return null;
  return { preds, actuals, byPerson, preAggOverall };
}

async function brierTile(): Promise<FlywheelTile> {
  const empty: FlywheelTile = {
    id: "brier",
    title: "Brier trend",
    source: "D, score predictions",
    ready: false,
    emptyMessage:
      "Not enough data yet. Waiting for required score predictions before rounds (Workstream D).",
    summary: "Not enough data yet",
    value: null,
    series: [],
    rows: [],
  };

  const people = await listPeopleFull();
  const nameOf = (id: string | null) =>
    id ? people.find((p) => p.id === id)?.name ?? "Someone" : "Someone";

  const fromD = await brierFromDTables();
  let preds: number[] = [];
  let actuals: number[] = [];
  let byPerson = new Map<string, BrierPersonBag>();
  let sourceNote = "D, score predictions";
  let preAggOverall: { brier: number; n: number } | undefined;

  if (fromD) {
    preds = fromD.preds;
    actuals = fromD.actuals;
    byPerson = fromD.byPerson;
    preAggOverall = fromD.preAggOverall;
    sourceNote = "D, prediction_brier_scores / round_score_predictions";
  } else {
    // Fallback until D's tables land: judge_cards.predictions vs card_scores
    type Card = {
      id: string;
      round_id: string;
      cruxy: boolean;
      predictions: Record<string, number> | null;
      created_by: string | null;
      created_at: string;
    };
    type Score = { card_id: string; item: string; score: number };

    let cards: Card[] = [];
    let scores: Score[] = [];
    if (isSampleDataMode()) {
      const store = await readStore();
      cards = store.judge_cards as Card[];
      scores = store.card_scores as Score[];
    } else {
      const sb = getServiceSupabase();
      const [cRes, sRes] = await Promise.all([
        sb
          .from("judge_cards")
          .select("id, round_id, cruxy, predictions, created_by, created_at")
          .not("predictions", "is", null)
          .limit(200),
        sb.from("card_scores").select("card_id, item, score").limit(2000),
      ]);
      if (cRes.error) return empty;
      cards = (cRes.data as Card[]) ?? [];
      scores = (sRes.data as Score[]) ?? [];
    }

    for (const card of cards) {
      if (!card.predictions || card.cruxy) continue;
      const cardScores = scores.filter((s) => s.card_id === card.id);
      if (!cardScores.length) continue;
      for (const [item, pred] of Object.entries(card.predictions)) {
        const actual = cardScores.find((s) => s.item === item)?.score;
        if (actual == null || typeof pred !== "number") continue;
        preds.push(pred);
        actuals.push(actual);
        const pid = card.created_by ?? "unknown";
        const bag = byPerson.get(pid) ?? { p: [], a: [] };
        bag.p.push(pred);
        bag.a.push(actual);
        bag.roundId = card.round_id;
        byPerson.set(pid, bag);
      }
    }
    sourceNote = "D, judge_cards.predictions (fallback until D tables land)";
  }

  const overall = meanBrier(preds, actuals) ??
    (preAggOverall && preAggOverall.n >= 3
      ? { brier: preAggOverall.brier, n: preAggOverall.n }
      : null);
  if (!overall) {
    return {
      ...empty,
      ready: true,
      emptyMessage:
        preds.length === 0 && !preAggOverall
          ? "No score predictions yet. Waiting for Workstream D."
          : `Only ${preds.length || preAggOverall?.n || 0} prediction pairs so far (need 3).`,
      summary: "Not enough data yet",
      source: sourceNote,
    };
  }

  const rows: FlywheelRowLink[] = [];
  for (const [pid, bag] of byPerson) {
    const fromPairs = meanBrier(bag.p, bag.a);
    const b = fromPairs ??
      (bag.preAgg && bag.preAgg.n >= 1
        ? { brier: bag.preAgg.brier, n: bag.preAgg.n }
        : null);
    if (!b) continue;
    rows.push({
      id: pid,
      label: `${nameOf(pid)}: Brier ${b.brier.toFixed(3)} (n=${b.n})`,
      href: bag.roundId
        ? `/practice/rounds/${bag.roundId}/report`
        : "/admin/flywheel?tile=brier",
      meta: "personal (admin view)",
    });
  }

  return {
    id: "brier",
    title: "Brier trend",
    source: sourceNote,
    ready: true,
    emptyMessage: "",
    summary: `mean Brier ${overall.brier.toFixed(3)} over ${overall.n} pairs`,
    value: Number(overall.brier.toFixed(3)),
    series: rows.slice(0, 14).map((r) => ({
      label: r.label.split(":")[0] ?? r.id,
      value: Number(r.label.match(/Brier ([0-9.]+)/)?.[1] ?? 0),
    })),
    rows: rows.slice(0, 40),
  };
}

async function masteryTile(): Promise<FlywheelTile> {
  const empty: FlywheelTile = {
    id: "mastery",
    title: "Review coverage per case",
    source: "E + F, flashcards and reviews",
    ready: false,
    emptyMessage:
      "Not enough data yet. Review coverage fills from flashcard reviews (F); personal mastery map (E) will refine this later.",
    summary: "Not enough data yet",
    value: null,
    series: [],
    rows: [],
  };

  const cases = (await listCases()).filter((c) => c.active);
  if (!cases.length) return empty;

  type Card = { id: string; case_id: string };
  type Review = { card_id: string; person_id: string };

  let cards: Card[] = [];
  let reviews: Review[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    cards = (store.flashcards as { id: string; case_id: string }[]) ?? [];
    reviews =
      (store.card_reviews as { card_id: string; person_id: string }[]) ?? [];
  } else {
    const sb = getServiceSupabase();
    const [fRes, rRes] = await Promise.all([
      sb.from("flashcards").select("id, case_id").limit(5000),
      sb.from("card_reviews").select("card_id, person_id").limit(10000),
    ]);
    if (fRes.error) return empty;
    cards = (fRes.data as Card[]) ?? [];
    reviews = (rRes.data as Review[]) ?? [];
  }

  if (cards.length === 0) {
    return {
      ...empty,
      ready: true,
      emptyMessage: "No flashcards yet for active cases.",
      summary: "Not enough data yet",
    };
  }

  const reviewedCardIds = new Set(reviews.map((r) => r.card_id));
  const rows: FlywheelRowLink[] = [];
  const series: { label: string; value: number }[] = [];
  let covered = 0;

  for (const c of cases) {
    const caseCards = cards.filter((x) => x.case_id === c.id);
    if (!caseCards.length) {
      rows.push({
        id: c.id,
        label: `Case ${c.number}: no cards yet`,
        href: `/case-brain/${c.id}`,
        meta: c.title,
      });
      series.push({ label: String(c.number), value: 0 });
      continue;
    }
    const hit = caseCards.filter((x) => reviewedCardIds.has(x.id)).length;
    const pct = Math.round((hit / caseCards.length) * 100);
    if (pct > 0) covered += 1;
    series.push({ label: String(c.number), value: pct });
    rows.push({
      id: c.id,
      label: `Case ${c.number}: ${pct}% cards reviewed (${hit}/${caseCards.length})`,
      href: `/case-brain/${c.id}`,
      meta: c.title,
    });
  }

  return {
    id: "mastery",
    title: "Review coverage per case",
    source: "E + F, flashcards and reviews",
    ready: true,
    emptyMessage: "",
    summary: `${covered} of ${cases.length} cases have review activity`,
    value: covered,
    secondary: `${cases.length} active cases`,
    series,
    rows,
  };
}

export async function getFlywheelDashboard(): Promise<{
  tiles: FlywheelTile[];
  teams: { id: string; name: string }[];
  generatedAt: string;
}> {
  const [edges, attacks, kappa, brier, mastery, teams] = await Promise.all([
    edgesTile(),
    attacksTile(),
    kappaTile(),
    brierTile(),
    masteryTile(),
    listTeams(),
  ]);

  return {
    tiles: [edges, attacks, kappa, brier, mastery],
    teams: teams.map((t) => ({ id: t.id, name: t.name })),
    generatedAt: new Date().toISOString(),
  };
}
