/**
 * Analyst agent helpers for Case brain.
 * Workstream H: delegates to src/lib/cruxy/agents/analyst.
 */
export {
  detectProposalProblems,
  runAnalystNote as analystNoteForProposal,
  runAnalystOpposing as draftOpposingPositions,
  runAnalystChangeTheFacts as draftChangeTheFacts,
  socraticQuestionForInspiredBy,
  type AnalystProblem,
} from "@/lib/cruxy/agents/analyst";
