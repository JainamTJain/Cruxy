/** Wave 6 Mastery map types (Workstream E). */

export type MasteryNodeKind = "claim" | "support" | "counterclaim" | "truth_item";

export type MasteryBand = "empty" | "low" | "mid" | "high";

export type ClaimNodeRef = {
  node_kind: MasteryNodeKind;
  node_id: string;
  label: string;
  ord: number;
};

export type NodeMasteryRow = {
  id: string;
  person_id: string;
  team_id: string | null;
  case_id: string;
  node_kind: MasteryNodeKind;
  node_id: string;
  mastery: number;
  evidence: {
    card_reviews?: number;
    answers?: number;
    round_hits?: number;
  };
  updated_at: string;
};

export type MasteryCell = {
  person_id: string;
  node_id: string;
  node_kind: MasteryNodeKind;
  mastery: number | null;
  band: MasteryBand;
  evidence: NodeMasteryRow["evidence"];
};

export type MasteryMapView = {
  caseId: string;
  caseNumber: number;
  caseTitle: string;
  teamId: string | null;
  teamName: string | null;
  scope: "lead" | "admin" | "none";
  nodes: ClaimNodeRef[];
  people: { id: string; name: string; team_id: string | null; team_name: string | null }[];
  cells: MasteryCell[];
  /** True when no claim nodes exist yet for this case. */
  emptyNodes: boolean;
  /** True when every cell is empty (no real activity). */
  emptyActivity: boolean;
};

export function masteryBand(mastery: number | null): MasteryBand {
  if (mastery == null || mastery <= 0) return "empty";
  if (mastery < 0.34) return "low";
  if (mastery < 0.67) return "mid";
  return "high";
}
