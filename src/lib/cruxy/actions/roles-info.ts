/**
 * Roles page Q&A that is not a mutation: who has the most leads.
 */
import "server-only";

import type { RolesBoardView } from "@/lib/team/roles-board";

export { looksLikeLeadsCount } from "@/lib/cruxy/actions/detect";

export function answerWhoHasMostLeads(board: RolesBoardView): string {
  if (board.load.length) {
    const ranked = [...board.load].sort(
      (a, b) => b.leadCount - a.leadCount,
    );
    const top = ranked[0]!;
    if (top.leadCount === 0) return "No leads are set yet.";
    const nameOf = new Map(board.people.map((p) => [p.id, p.name]));
    const tied = ranked.filter((r) => r.leadCount === top.leadCount);
    const names = tied.map((t) => nameOf.get(t.personId) ?? "Someone");
    if (names.length === 1) {
      return `${names[0]} has the most leads (${top.leadCount}).`;
    }
    return `${names.join(" and ")} are tied with ${top.leadCount} leads each.`;
  }
  // Fallback if load is empty: count cells.
  const counts = new Map<string, number>();
  for (const p of board.people) counts.set(p.id, 0);
  for (const [personId, byCase] of Object.entries(board.cells)) {
    for (const role of Object.values(byCase)) {
      if (role === "lead_1" || role === "lead_2") {
        counts.set(personId, (counts.get(personId) ?? 0) + 1);
      }
    }
  }
  const ranked = board.people
    .map((p) => ({ name: p.name, n: counts.get(p.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  if (!ranked.length) return "No one is on the board yet.";
  const top = ranked[0]!;
  if (top.n === 0) return "No leads are set yet.";
  const tied = ranked.filter((r) => r.n === top.n);
  if (tied.length === 1) {
    return `${top.name} has the most leads (${top.n}).`;
  }
  return `${tied.map((t) => t.name).join(" and ")} are tied with ${top.n} leads each.`;
}
