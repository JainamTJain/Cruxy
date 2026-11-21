import { seedUuid, SEED_CREATED_AT } from "@/lib/seed/ids";

/** APPE scoring card items exactly as in docs/domain/scoring-card.md. */
export interface ScoringCardItemSeed {
  id: string;
  key: string;
  label: string;
  question: string;
  sort_ord: number;
  min_score: number;
  max_score: number;
  is_total: boolean;
  created_at: string;
}

const ITEMS: Omit<ScoringCardItemSeed, "id" | "created_at">[] = [
  {
    key: "presentation_a",
    label: "Presentation A",
    question: "Was the presentation clear and systematic?",
    sort_ord: 1,
    min_score: 1,
    max_score: 10,
    is_total: false,
  },
  {
    key: "presentation_b",
    label: "Presentation B",
    question:
      "Did the presentation clearly identify and thoroughly discuss the central moral dimensions of the case?",
    sort_ord: 2,
    min_score: 1,
    max_score: 10,
    is_total: false,
  },
  {
    key: "presentation_c",
    label: "Presentation C",
    question:
      "Did the presentation show awareness of and thoughtful consideration for different viewpoints, especially those that would weigh heavily for those who disagree?",
    sort_ord: 3,
    min_score: 1,
    max_score: 10,
    is_total: false,
  },
  {
    key: "presentation_total",
    label: "Presentation total",
    question: "A + B + C",
    sort_ord: 4,
    min_score: 3,
    max_score: 30,
    is_total: true,
  },
  {
    key: "commentary",
    label: "Commentary",
    question: "The team's commentary on the other team's presentation",
    sort_ord: 5,
    min_score: 1,
    max_score: 10,
    is_total: false,
  },
  {
    key: "response_to_commentary",
    label: "Response to commentary",
    question: "The team's response to the other team's commentary",
    sort_ord: 6,
    min_score: 1,
    max_score: 10,
    is_total: false,
  },
  {
    key: "response_to_judges",
    label: "Response to judges",
    question: "The team's answers to the judges' questions",
    sort_ord: 7,
    min_score: 1,
    max_score: 10,
    is_total: false,
  },
  {
    key: "team_total",
    label: "Team total",
    question: "All of the above",
    sort_ord: 8,
    min_score: 0,
    max_score: 60,
    is_total: true,
  },
  {
    key: "spirit",
    label: "Spirit points",
    question: "Spirit points (1 to 5) on a separate feedback sheet",
    sort_ord: 9,
    min_score: 1,
    max_score: 5,
    is_total: false,
  },
];

export function buildScoringCardItems(): ScoringCardItemSeed[] {
  return ITEMS.map((item) => ({
    ...item,
    id: seedUuid(`scoring:${item.key}`),
    created_at: SEED_CREATED_AT,
  }));
}
