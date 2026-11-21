import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import {
  getGlossary,
  getRoundById,
  getTranscript,
  updateGlossary,
  saveTranscriptLines,
} from "@/lib/db/practice-repository";
import { listPeopleFull, listTeams, logActivity } from "@/lib/db/repository";
import { listTruthItems } from "@/lib/revision/repository";
import {
  applyGlossaryCorrections,
  buildCaseGlossary,
  learnMisheard,
} from "@/lib/practice/glossary";
import type { GlossaryTerm, TranscriptLine } from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";

const STOP = new Set(
  [
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "have",
    "been",
    "were",
    "their",
    "would",
    "could",
    "should",
    "about",
    "into",
    "over",
    "under",
    "than",
    "then",
    "when",
    "what",
    "which",
    "while",
    "case",
    "team",
    "claim",
    "support",
  ].map((s) => s.toLowerCase()),
);

function extractCandidateTerms(text: string): string[] {
  const out: string[] = [];
  const proper = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g) ?? [];
  for (const p of proper) {
    if (p.length >= 3 && !STOP.has(p.toLowerCase())) out.push(p);
  }
  const coined = text.match(/\b[a-z]{4,}(?:ing|ism|maxxing)\b/gi) ?? [];
  for (const c of coined) {
    if (!STOP.has(c.toLowerCase())) out.push(c);
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/** Rough pronunciation guide for unusual names (F-230). */
export function pronunciationHint(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => {
      const lower = p.toLowerCase();
      if (lower === "jainam") return "JAI-nahm";
      if (lower === "serena") return "suh-REE-nuh";
      if (lower === "stolei") return "STOH-lay";
      if (lower === "quixote") return "kee-HO-tay";
      if (lower === "camerin") return "KAM-er-in";
      if (lower === "bethany") return "BETH-uh-nee";
      if (lower === "lehar") return "LAY-har";
      // Fallback: split on vowel runs for a short speakable form.
      return p.replace(/([aeiouy]+)/gi, "-$1-").replace(/^-|-$/g, "");
    })
    .join(" ");
}

/**
 * F-226: rebuild glossary from case set title, Truth Sources, claim text,
 * Drive file names for the case, plus roster and team names.
 */
export async function refreshCaseGlossary(opts: {
  caseId: string;
  personId?: string | null;
}): Promise<GlossaryTerm[]> {
  const teams = await listTeams();
  const people = await listPeopleFull();
  const storeBits = await loadCaseContentBits(opts.caseId);

  const extra: string[] = [];
  for (const t of storeBits.truthTexts) {
    extra.push(...extractCandidateTerms(t));
  }
  for (const t of storeBits.claimTexts) {
    extra.push(...extractCandidateTerms(t));
  }
  for (const name of storeBits.fileNames) {
    extra.push(...extractCandidateTerms(name));
  }
  if (storeBits.caseTitle) {
    extra.push(...extractCandidateTerms(storeBits.caseTitle));
  }

  const base = buildCaseGlossary({
    caseId: opts.caseId,
    caseTitle: storeBits.caseTitle,
    extraTerms: extra,
  });

  const existing = await getGlossary(opts.caseId);
  const byTerm = new Map(
    existing.map((g) => [g.term.toLowerCase(), g] as const),
  );

  const merged: GlossaryTerm[] = [];
  const seen = new Set<string>();
  for (const term of base) {
    const key = term.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const prev = byTerm.get(key);
    if (prev) {
      merged.push({
        ...prev,
        misheard: prev.misheard,
        pronunciation: prev.pronunciation,
      });
    } else {
      merged.push(term);
    }
  }

  // F-230: pronunciation notes for people with a voice sample on file.
  const nameToPerson = new Map(
    people.map((p) => [p.name.toLowerCase(), p] as const),
  );
  for (const g of merged) {
    const person = nameToPerson.get(g.term.toLowerCase());
    if (!person) continue;
    if (person.voice_sample_path && !g.pronunciation) {
      g.pronunciation = pronunciationHint(person.name);
    }
  }

  // Keep team colour names stable.
  for (const team of teams) {
    const key = team.name.toLowerCase();
    if (!seen.has(key)) {
      merged.push({
        id: randomUUID(),
        case_id: opts.caseId,
        term: team.name,
        misheard: [],
        pronunciation: null,
        created_at: nowIso(),
      });
      seen.add(key);
    }
  }

  await updateGlossary(merged);
  await markGlossaryTestClipNeedsRerun(opts.caseId, merged.map((g) => g.term));
  await logActivity({
    person_id: opts.personId ?? null,
    action: "glossary_refreshed",
    target: opts.caseId,
    meta: { terms: merged.length },
  });
  return merged;
}

async function loadCaseContentBits(caseId: string): Promise<{
  caseTitle: string | null;
  truthTexts: string[];
  claimTexts: string[];
  fileNames: string[];
}> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const caseRow = store.cases.find((c) => c.id === caseId) ?? null;
    const truthTexts = store.truth_items
      .filter((t) => t.case_id === caseId)
      .map((t) => t.text);
    const claimTexts = [
      ...store.claims.filter((c) => c.case_id === caseId).map((c) => c.text),
      ...store.supports.filter((c) => c.case_id === caseId).map((c) => c.text),
      ...store.counterclaims
        .filter((c) => c.case_id === caseId)
        .map((c) => c.text),
    ];
    const caseNumbers = caseRow ? [caseRow.number] : [];
    const fileNames = store.files
      .filter(
        (f) =>
          (f.case_numbers ?? []).some((n) => caseNumbers.includes(n)) ||
          (f.case_ids ?? []).includes(caseId),
      )
      .map((f) => f.name || f.path || "");
    return {
      caseTitle: caseRow?.title ?? null,
      truthTexts,
      claimTexts,
      fileNames,
    };
  }

  const sb = getServiceSupabase();
  const { data: caseRow, error: caseErr } = await sb
    .from("cases")
    .select("id,number,title")
    .eq("id", caseId)
    .maybeSingle();
  assertOk(caseErr, "loadCaseContentBits.case");

  const truth = await listTruthItems({ caseId });
  const { data: claims, error: claimsErr } = await sb
    .from("claims")
    .select("text")
    .eq("case_id", caseId);
  assertOk(claimsErr, "loadCaseContentBits.claims");
  const { data: supports, error: supportsErr } = await sb
    .from("supports")
    .select("text")
    .eq("case_id", caseId);
  assertOk(supportsErr, "loadCaseContentBits.supports");
  const { data: counters, error: countersErr } = await sb
    .from("counterclaims")
    .select("text")
    .eq("case_id", caseId);
  assertOk(countersErr, "loadCaseContentBits.counters");

  const caseNumber = (caseRow as { number?: number } | null)?.number;
  let fileNames: string[] = [];
  if (caseNumber != null) {
    const { data: files, error: filesErr } = await sb
      .from("files")
      .select("name,path,case_numbers,case_ids")
      .or(`case_ids.cs.{${caseId}}`);
    assertOk(filesErr, "loadCaseContentBits.files");
    fileNames = (files ?? [])
      .filter((f) => {
        const nums = (f.case_numbers as number[] | null) ?? [];
        const ids = (f.case_ids as string[] | null) ?? [];
        return nums.includes(caseNumber) || ids.includes(caseId);
      })
      .map((f) => (f.name as string) || (f.path as string) || "");
  }

  return {
    caseTitle: ((caseRow as { title?: string } | null)?.title as string) ?? null,
    truthTexts: truth.map((t) => t.text),
    claimTexts: [
      ...((claims ?? []) as { text: string }[]).map((c) => c.text),
      ...((supports ?? []) as { text: string }[]).map((c) => c.text),
      ...((counters ?? []) as { text: string }[]).map((c) => c.text),
    ],
    fileNames,
  };
}

export type LineQuality = {
  line_id: string;
  uncertain_words: string[];
  corrections: { from: string; to: string }[];
};

/**
 * F-228: correction pass with uncertain flags for near-miss glossary words.
 * Never invents meaning beyond glossary swaps and near-matches.
 */
export function runCorrectionPass(
  lines: TranscriptLine[],
  glossary: GlossaryTerm[],
): { lines: TranscriptLine[]; quality: LineQuality[] } {
  const terms = glossary.map((g) => g.term);
  const quality: LineQuality[] = [];
  const nextLines = lines.map((line) => {
    const swapped = applyGlossaryCorrections(line.text, glossary);
    let text = swapped.text;
    const corrections = [...swapped.corrections];
    const uncertain: string[] = [];

    const words = text.split(/(\s+)/);
    const rebuilt: string[] = [];
    for (const token of words) {
      if (/^\s+$/.test(token) || token.length < 4) {
        rebuilt.push(token);
        continue;
      }
      const clean = token.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "");
      if (clean.length < 4) {
        rebuilt.push(token);
        continue;
      }
      const lower = clean.toLowerCase();
      const exact = terms.find((t) => t.toLowerCase() === lower);
      if (exact) {
        rebuilt.push(token.replace(clean, exact));
        continue;
      }
      let best: { term: string; dist: number } | null = null;
      for (const t of terms) {
        if (Math.abs(t.length - clean.length) > 2) continue;
        const dist = levenshtein(lower, t.toLowerCase());
        const maxDist = t.length >= 8 ? 2 : 1;
        if (dist > 0 && dist <= maxDist) {
          if (!best || dist < best.dist) best = { term: t, dist };
        }
      }
      if (best && best.dist === 1) {
        corrections.push({ from: clean, to: best.term });
        rebuilt.push(token.replace(clean, best.term));
      } else if (best && best.dist === 2) {
        uncertain.push(clean);
        rebuilt.push(token);
      } else {
        rebuilt.push(token);
      }
    }
    text = rebuilt.join("");
    quality.push({
      line_id: line.id,
      uncertain_words: uncertain,
      corrections,
    });
    return {
      ...line,
      text,
      corrected: corrections.length > 0 || line.corrected,
    };
  });
  return { lines: nextLines, quality };
}

export async function saveLineQuality(rows: LineQuality[]): Promise<void> {
  if (rows.length === 0) return;
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = (s as unknown as { transcript_line_quality?: LineQuality[] })
        .transcript_line_quality;
      const list = bag ?? [];
      (s as unknown as { transcript_line_quality: LineQuality[] }).transcript_line_quality =
        list;
      for (const row of rows) {
        const i = list.findIndex((x) => x.line_id === row.line_id);
        if (i >= 0) list[i] = row;
        else list.push(row);
      }
    });
    return;
  }
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("transcript_line_quality").upsert(
        rows.map((r) => ({
          line_id: r.line_id,
          uncertain_words: r.uncertain_words,
          corrections: r.corrections,
          updated_at: nowIso(),
        })),
        { onConflict: "line_id" },
      )
    ).error,
    "saveLineQuality",
  );
}

/** F-229: learn misheard form when someone edits a transcript line. */
export async function learnFromTranscriptFix(opts: {
  lineId: string;
  newText: string;
  correctTerm: string;
  misheardForm: string;
  caseId: string | null;
  personId?: string | null;
}): Promise<TranscriptLine> {
  const roundId = await findRoundIdForLine(opts.lineId);
  if (!roundId) throw new Error("Line not found");
  const lines = await getTranscript(roundId);
  const line = lines.find((l) => l.id === opts.lineId);
  if (!line) throw new Error("Line not found");

  const glossary = await getGlossary(opts.caseId);
  let learned = learnMisheard(glossary, opts.correctTerm, opts.misheardForm);
  // Ensure the correct term exists even if it was new.
  if (
    !learned.some(
      (g) => g.term.toLowerCase() === opts.correctTerm.toLowerCase(),
    )
  ) {
    learned = [
      ...learned,
      {
        id: randomUUID(),
        case_id: opts.caseId,
        term: opts.correctTerm,
        misheard: opts.misheardForm ? [opts.misheardForm] : [],
        pronunciation: null,
        created_at: nowIso(),
      },
    ];
  }
  await updateGlossary(learned);
  if (opts.caseId) {
    await markGlossaryTestClipNeedsRerun(
      opts.caseId,
      learned.map((g) => g.term),
    );
  }

  const next = { ...line, text: opts.newText, corrected: true };
  await saveTranscriptLines([next]);
  await logActivity({
    person_id: opts.personId ?? null,
    action: "transcript_fix_learned",
    target: opts.lineId,
    meta: {
      correctTerm: opts.correctTerm,
      misheardForm: opts.misheardForm,
    },
  });
  return next;
}

async function findRoundIdForLine(lineId: string): Promise<string | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.transcript_lines.find((l) => l.id === lineId)?.round_id ?? null;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("transcript_lines")
    .select("round_id")
    .eq("id", lineId)
    .maybeSingle();
  assertOk(error, "findRoundIdForLine");
  return (data?.round_id as string | undefined) ?? null;
}

export type GlossaryRoundCheck = {
  round_id: string;
  case_id: string | null;
  accuracy: number;
  term_hits: { term: string; hit: boolean }[];
  uncertain_count: number;
  correction_count: number;
  checked_at: string;
};

/** F-231: accuracy estimate on glossary terms present in the transcript. */
export function estimateGlossaryAccuracy(
  lines: TranscriptLine[],
  glossary: GlossaryTerm[],
  quality: LineQuality[],
): GlossaryRoundCheck {
  const blob = lines.map((l) => l.text).join(" ").toLowerCase();
  const term_hits = glossary.slice(0, 80).map((g) => {
    const hit = blob.includes(g.term.toLowerCase());
    return { term: g.term, hit };
  });
  const hitCount = term_hits.filter((t) => t.hit).length;
  const accuracy =
    term_hits.length === 0 ? 1 : hitCount / Math.max(term_hits.length, 1);
  const uncertain_count = quality.reduce(
    (n, q) => n + q.uncertain_words.length,
    0,
  );
  const correction_count = quality.reduce(
    (n, q) => n + q.corrections.length,
    0,
  );
  return {
    round_id: lines[0]?.round_id ?? "",
    case_id: glossary[0]?.case_id ?? null,
    accuracy,
    term_hits,
    uncertain_count,
    correction_count,
    checked_at: nowIso(),
  };
}

export async function saveGlossaryRoundCheck(
  check: GlossaryRoundCheck,
  personId?: string | null,
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = (
        s as unknown as { glossary_round_checks?: GlossaryRoundCheck[] }
      ).glossary_round_checks;
      const list = bag ?? [];
      (s as unknown as { glossary_round_checks: GlossaryRoundCheck[] }).glossary_round_checks =
        list;
      const i = list.findIndex((x) => x.round_id === check.round_id);
      if (i >= 0) list[i] = check;
      else list.push(check);
    });
    return;
  }
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("glossary_round_checks").upsert(
        {
          round_id: check.round_id,
          case_id: check.case_id,
          accuracy: check.accuracy,
          term_hits: check.term_hits,
          uncertain_count: check.uncertain_count,
          correction_count: check.correction_count,
          checked_at: check.checked_at,
          created_by: personId ?? null,
        },
        { onConflict: "round_id" },
      )
    ).error,
    "saveGlossaryRoundCheck",
  );
}

async function markGlossaryTestClipNeedsRerun(
  caseId: string,
  terms: string[],
): Promise<void> {
  const expected = [...new Set(terms)].slice(0, 40);
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = (
        s as unknown as {
          glossary_test_clips?: {
            case_id: string;
            expected_terms: string[];
            needs_rerun: boolean;
            updated_at: string;
          }[];
        }
      ).glossary_test_clips;
      const list = bag ?? [];
      (
        s as unknown as {
          glossary_test_clips: {
            case_id: string;
            expected_terms: string[];
            needs_rerun: boolean;
            updated_at: string;
          }[];
        }
      ).glossary_test_clips = list;
      const i = list.findIndex((x) => x.case_id === caseId);
      const row = {
        case_id: caseId,
        expected_terms: expected,
        needs_rerun: true,
        updated_at: nowIso(),
      };
      if (i >= 0) list[i] = row;
      else list.push(row);
    });
    return;
  }
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("glossary_test_clips").upsert(
        {
          case_id: caseId,
          expected_terms: expected,
          needs_rerun: true,
          updated_at: nowIso(),
        },
        { onConflict: "case_id" },
      )
    ).error,
    "markGlossaryTestClipNeedsRerun",
  );
}

/**
 * Re-run the short per-case glossary test against a stub/live transcript blob.
 * Marks needs_rerun false and stores last_accuracy.
 */
export async function rerunGlossaryTestClip(opts: {
  caseId: string;
  transcriptText?: string;
  personId?: string | null;
}): Promise<{ accuracy: number; needs_rerun: boolean }> {
  const glossary = await getGlossary(opts.caseId);
  const text = (opts.transcriptText ?? glossary.map((g) => g.term).join(" ")).toLowerCase();
  const hits = glossary.filter((g) => text.includes(g.term.toLowerCase()));
  const accuracy =
    glossary.length === 0 ? 1 : hits.length / Math.max(glossary.length, 1);

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const list = (
        (s as unknown as { glossary_test_clips?: { case_id: string }[] })
          .glossary_test_clips ?? []
      ) as {
        case_id: string;
        expected_terms: string[];
        needs_rerun: boolean;
        last_accuracy?: number;
        last_run_at?: string;
        updated_at: string;
      }[];
      (s as unknown as { glossary_test_clips: typeof list }).glossary_test_clips =
        list;
      const i = list.findIndex((x) => x.case_id === opts.caseId);
      const row = {
        case_id: opts.caseId,
        expected_terms: glossary.map((g) => g.term).slice(0, 40),
        needs_rerun: false,
        last_accuracy: accuracy,
        last_run_at: nowIso(),
        updated_at: nowIso(),
      };
      if (i >= 0) list[i] = row;
      else list.push(row);
    });
  } else {
    const sb = getServiceSupabase();
    assertOk(
      (
        await sb.from("glossary_test_clips").upsert(
          {
            case_id: opts.caseId,
            expected_terms: glossary.map((g) => g.term).slice(0, 40),
            needs_rerun: false,
            last_accuracy: accuracy,
            last_run_at: nowIso(),
            updated_at: nowIso(),
          },
          { onConflict: "case_id" },
        )
      ).error,
      "rerunGlossaryTestClip",
    );
  }

  await logActivity({
    person_id: opts.personId ?? null,
    action: "glossary_test_clip_rerun",
    target: opts.caseId,
    meta: { accuracy },
  });
  return { accuracy, needs_rerun: false };
}

/**
 * End-of-round quality hook (F-228, F-231). Call after finalizeRound.
 * Refresh the glossary with refreshCaseGlossary before finalize so key terms land.
 */
export async function applyTranscriptQualityAfterFinalize(opts: {
  roundId: string;
  personId?: string | null;
}): Promise<{
  accuracy: number;
  uncertain_count: number;
  correction_count: number;
}> {
  const round = await getRoundById(opts.roundId);
  if (!round) throw new Error("Round not found");
  const glossary = await getGlossary(round.case_id);
  const lines = await getTranscript(opts.roundId);
  const { lines: corrected, quality } = runCorrectionPass(lines, glossary);
  await saveTranscriptLines(corrected);
  await saveLineQuality(quality);
  const check = estimateGlossaryAccuracy(corrected, glossary, quality);
  check.round_id = opts.roundId;
  check.case_id = round.case_id;
  await saveGlossaryRoundCheck(check, opts.personId);
  if (round.case_id) {
    await rerunGlossaryTestClip({
      caseId: round.case_id,
      transcriptText: corrected.map((l) => l.text).join(" "),
      personId: opts.personId,
    });
  }
  return {
    accuracy: check.accuracy,
    uncertain_count: check.uncertain_count,
    correction_count: check.correction_count,
  };
}
