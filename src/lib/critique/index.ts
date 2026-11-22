export { buildTruthSource, findCite } from "@/lib/critique/truth-source";
export { critiqueWorkingDocument, selectForRail } from "@/lib/critique/engine";
export { ruleFindings, findingsByKind } from "@/lib/critique/rules";
export { raiseSharedIdeas } from "@/lib/critique/shared-ideas";
export {
  runCritiqueForTeamCase,
  runNightlyCritique,
  scheduleCritiqueOnChange,
} from "@/lib/critique/run";
export { formatCritiqueText, KIND_LABELS } from "@/lib/critique/format";
export {
  CRITIQUE_KINDS,
  OPEN_PER_SECTION_CAP,
  type CritiqueFinding,
  type CritiqueKind,
  type TruthSourceItem,
} from "@/lib/critique/types";
