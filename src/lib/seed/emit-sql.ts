import type { ContentSeedBundle } from "@/lib/seed/build-content";
import { CONTENT_ORIGIN } from "@/lib/seed/ids";
import {
  sqlBool,
  sqlJson,
  sqlStr,
  sqlTextArray,
  sqlUuidArray,
} from "@/lib/seed/sql-escape";

function upsert(
  table: string,
  columns: string[],
  rows: string[][],
  conflict: string,
  updateCols: string[],
): string {
  if (!rows.length) return `-- no rows for ${table}\n`;
  const colList = columns.join(", ");
  const values = rows.map((r) => `(${r.join(", ")})`).join(",\n  ");
  const updates = updateCols
    .map((c) => `${c} = excluded.${c}`)
    .join(",\n  ");
  return `insert into ${table} (${colList}) values\n  ${values}\non conflict (${conflict}) do update set\n  ${updates};\n`;
}

function caseRef(
  caseId: string,
  byId: Map<string, number>,
): string {
  const n = byId.get(caseId);
  if (n == null) return sqlStr(caseId);
  return `(select id from cases where number = ${n})`;
}

export function emitContentSql(bundle: ContentSeedBundle): Record<string, string> {
  const byId = new Map(bundle.cases.map((c) => [c.id, c.number]));
  const cref = (id: string) => caseRef(id, byId);
  const files: Record<string, string> = {};

  // 00 cases meta — update by number so existing DBs keep their case ids
  files["00_cases_meta.sql"] = `-- Case titles, crux, trap, closing question (idempotent)
${bundle.cases
  .map(
    (c) =>
      `insert into cases (id, number, title, case_set_page, crux, trap, closing_question, active, created_at) values (${sqlStr(c.id)}, ${c.number}, ${sqlStr(c.title)}, ${sqlStr(c.case_set_page)}, ${sqlStr(c.crux)}, ${sqlStr(c.trap)}, ${sqlStr(c.closing_question)}, ${sqlBool(c.active)}, ${sqlStr(c.created_at)})\non conflict (number) do update set title = excluded.title, case_set_page = excluded.case_set_page, crux = excluded.crux, trap = excluded.trap, closing_question = excluded.closing_question, active = excluded.active;`,
  )
  .join("\n")}
`;

  files["01_stakeholders.sql"] = `-- Case stakeholders from prep docs
${upsert(
  "case_stakeholders",
  ["id", "case_id", "who", "stake", "voice_in_case", "ord", "origin", "created_at", "created_by"],
  bundle.stakeholders.map((s) => [
    sqlStr(s.id),
    cref(s.case_id),
    sqlStr(s.who),
    sqlStr(s.stake),
    sqlStr(s.voice_in_case),
    String(s.ord),
    sqlStr(s.origin),
    sqlStr(s.created_at),
    sqlStr(s.created_by),
  ]),
  "id",
  ["case_id", "who", "stake", "voice_in_case", "ord", "origin"],
)}
`;

  files["02_claims.sql"] = `-- Team 3 claims, supports, backings, counterclaims
${upsert(
  "claims",
  ["id", "team_id", "case_id", "text", "logic_line", "ord", "citation_ids", "created_at", "created_by", "updated_at"],
  bundle.claims.map((c) => [
    sqlStr(c.id),
    sqlStr(c.team_id),
    cref(c.case_id),
    sqlStr(c.text),
    sqlStr(c.logic_line),
    String(c.ord),
    sqlUuidArray(c.citation_ids),
    sqlStr(c.created_at),
    sqlStr(c.created_by),
    sqlStr(c.updated_at),
  ]),
  "id",
  ["text", "logic_line", "ord", "citation_ids", "updated_at"],
)}

${upsert(
  "supports",
  ["id", "claim_id", "team_id", "case_id", "text", "logic_line", "ord", "citation_ids", "created_at", "created_by", "updated_at"],
  bundle.supports.map((s) => [
    sqlStr(s.id),
    sqlStr(s.claim_id),
    sqlStr(s.team_id),
    cref(s.case_id),
    sqlStr(s.text),
    sqlStr(s.logic_line),
    String(s.ord),
    sqlUuidArray(s.citation_ids),
    sqlStr(s.created_at),
    sqlStr(s.created_by),
    sqlStr(s.updated_at),
  ]),
  "id",
  ["text", "logic_line", "ord", "citation_ids", "updated_at"],
)}

${upsert(
  "backings",
  ["id", "support_id", "team_id", "case_id", "text", "citation_ids", "created_at", "created_by", "updated_at", "kind"],
  bundle.backings.map((b) => [
    sqlStr(b.id),
    sqlStr(b.support_id),
    sqlStr(b.team_id),
    cref(b.case_id),
    sqlStr(b.text),
    sqlUuidArray(b.citation_ids),
    sqlStr(b.created_at),
    sqlStr(b.created_by),
    sqlStr(b.updated_at),
    sqlStr(b.kind),
  ]),
  "id",
  ["text", "citation_ids", "updated_at", "kind"],
)}

${upsert(
  "counterclaims",
  ["id", "team_id", "case_id", "text", "concede", "distinguish", "rebut", "citation_ids", "created_at", "created_by", "updated_at", "claim_id"],
  bundle.counterclaims.map((c) => [
    sqlStr(c.id),
    sqlStr(c.team_id),
    cref(c.case_id),
    sqlStr(c.text),
    sqlStr(c.concede),
    sqlStr(c.distinguish),
    sqlStr(c.rebut),
    sqlUuidArray(c.citation_ids),
    sqlStr(c.created_at),
    sqlStr(c.created_by),
    sqlStr(c.updated_at),
    sqlStr(c.claim_id),
  ]),
  "id",
  ["text", "concede", "distinguish", "rebut", "citation_ids", "updated_at", "claim_id"],
)}
`;

  files["03_truth_items.sql"] = `-- Team 3 Truth Sources (origin: case prep doc)
${upsert(
  "truth_items",
  ["id", "team_id", "case_id", "kind", "text", "citation_ids", "status", "created_at", "created_by", "updated_at", "origin"],
  bundle.truth_items.map((t) => [
    sqlStr(t.id),
    sqlStr(t.team_id),
    cref(t.case_id),
    sqlStr(t.kind),
    sqlStr(t.text),
    sqlUuidArray(t.citation_ids),
    sqlStr(t.status),
    sqlStr(t.created_at),
    sqlStr(t.created_by),
    sqlStr(t.updated_at),
    sqlStr(CONTENT_ORIGIN),
  ]),
  "id",
  ["kind", "text", "citation_ids", "status", "updated_at", "origin"],
)}
`;

  files["04_questions.sql"] = `-- Moderator + judge question bank (origin member)
${upsert(
  "questions",
  ["id", "case_id", "text", "type", "difficulty", "origin", "created_at", "created_by", "status", "origin_label", "asked_at_tag"],
  bundle.questions.map((q) => [
    sqlStr(q.id),
    cref(q.case_id),
    sqlStr(q.text),
    sqlStr(q.type),
    String(q.difficulty),
    sqlStr(q.origin),
    sqlStr(q.created_at),
    sqlStr(q.created_by),
    sqlStr(q.status),
    sqlStr(q.origin_label),
    sqlStr(q.asked_at_tag),
  ]),
  "id",
  ["text", "type", "difficulty", "origin", "status", "origin_label", "asked_at_tag"],
)}
`;

  files["05_opposing_and_one_pagers.sql"] = `-- Commentary kit → opposing positions; v1 one pagers
${upsert(
  "opposing_positions",
  ["id", "case_id", "title", "strongest_support", "weak_point", "commentary_angles", "origin", "added_by_team_id", "created_at", "created_by"],
  bundle.opposing_positions.map((o) => [
    sqlStr(o.id),
    cref(o.case_id),
    sqlStr(o.title),
    sqlStr(o.strongest_support),
    sqlStr(o.weak_point),
    sqlTextArray([...o.commentary_angles]),
    sqlStr(o.origin),
    sqlStr(o.added_by_team_id),
    sqlStr(o.created_at),
    sqlStr(o.created_by),
  ]),
  "id",
  ["title", "strongest_support", "weak_point", "commentary_angles", "origin", "added_by_team_id"],
)}

${upsert(
  "one_pagers",
  ["id", "team_id", "case_id", "version", "body", "created_at", "created_by", "previous_body", "change_note", "signed_off_by", "drive_doc_id", "drive_pdf_exported", "origin_tag"],
  bundle.one_pagers.map((o) => [
    sqlStr(o.id),
    sqlStr(o.team_id),
    cref(o.case_id),
    String(o.version),
    sqlJson(o.body),
    sqlStr(o.created_at),
    sqlStr(o.created_by),
    o.previous_body ? sqlJson(o.previous_body) : "null",
    sqlStr(o.change_note),
    sqlUuidArray(o.signed_off_by),
    sqlStr(o.drive_doc_id),
    sqlBool(o.drive_pdf_exported),
    sqlStr(o.origin_tag),
  ]),
  "id",
  ["body", "change_note", "signed_off_by", "origin_tag"],
)}
`;

  files["06_flashcards_roles_proposals.sql"] = `-- Flashcards, case roles, deck opt-ins, Inspired-by proposals
${upsert(
  "flashcards",
  ["id", "team_id", "case_id", "deck", "front", "back", "citation_ids", "created_at", "created_by", "truth_item_id", "source_kind", "updated_at"],
  bundle.flashcards.map((f) => [
    sqlStr(f.id),
    sqlStr(f.team_id),
    f.case_id ? cref(f.case_id) : "null",
    sqlStr(f.deck),
    sqlStr(f.front),
    sqlStr(f.back),
    sqlUuidArray(f.citation_ids),
    sqlStr(f.created_at),
    sqlStr(f.created_by),
    sqlStr(f.truth_item_id),
    sqlStr(f.source_kind),
    sqlStr(f.updated_at),
  ]),
  "id",
  ["deck", "front", "back", "citation_ids", "truth_item_id", "source_kind", "updated_at"],
)}

${upsert(
  "case_roles",
  ["id", "team_id", "case_id", "person_id", "role", "created_at", "created_by"],
  bundle.case_roles.map((r) => [
    sqlStr(r.id),
    sqlStr(r.team_id),
    cref(r.case_id),
    sqlStr(r.person_id),
    sqlStr(r.role),
    sqlStr(r.created_at),
    sqlStr(r.created_by),
  ]),
  "id",
  ["person_id", "role"],
)}

${upsert(
  "deck_opt_ins",
  ["id", "person_id", "team_id", "case_id", "assigned", "created_at"],
  bundle.deck_opt_ins.map((d) => [
    sqlStr(d.id),
    sqlStr(d.person_id),
    sqlStr(d.team_id),
    cref(d.case_id),
    sqlBool(d.assigned),
    sqlStr(d.created_at),
  ]),
  "id",
  ["assigned"],
)}

${upsert(
  "proposals",
  ["id", "team_id", "case_id", "origin", "origin_ref", "text", "cruxy_note", "status", "created_at", "created_by", "idea_key", "inspired_from_team_id", "kind", "socratic_question", "socratic_answered", "updated_at"],
  bundle.proposals.map((p) => [
    sqlStr(p.id),
    sqlStr(p.team_id),
    cref(p.case_id),
    sqlStr(p.origin),
    sqlStr(p.origin_ref),
    sqlStr(p.text),
    sqlStr(p.cruxy_note),
    sqlStr(p.status),
    sqlStr(p.created_at),
    sqlStr(p.created_by),
    sqlStr(p.idea_key),
    sqlStr(p.inspired_from_team_id),
    sqlStr(p.kind),
    sqlStr(p.socratic_question),
    sqlBool(p.socratic_answered),
    sqlStr(p.updated_at),
  ]),
  "id",
  ["origin", "origin_ref", "text", "cruxy_note", "status", "idea_key", "inspired_from_team_id", "kind", "socratic_question", "socratic_answered", "updated_at"],
)}
`;

  files["07_scoring_card.sql"] = `-- APPE scoring card items from docs/domain/scoring-card.md
${upsert(
  "scoring_card_items",
  ["id", "key", "label", "question", "sort_ord", "min_score", "max_score", "is_total", "created_at"],
  bundle.scoring_card_items.map((s) => [
    sqlStr(s.id),
    sqlStr(s.key),
    sqlStr(s.label),
    sqlStr(s.question),
    String(s.sort_ord),
    String(s.min_score),
    String(s.max_score),
    sqlBool(s.is_total),
    sqlStr(s.created_at),
  ]),
  "id",
  ["key", "label", "question", "sort_ord", "min_score", "max_score", "is_total"],
)}
`;

  return files;
}
