/**
 * Ethics Bowl in 90 seconds.
 * Built only from docs/domain (ethics-bowl.md, scoring-card.md).
 */

export type EthicsBowlBeat = {
  id: string;
  title: string;
  body: string;
  /** Short label for the illustrated strip. */
  beat: string;
};

export const ETHICS_BOWL_90 = {
  title: "Ethics Bowl in 90 seconds",
  lead: "A round is a moral conversation under a clock. Here is how it runs, what judges score, and what a strong answer sounds like.",
  beats: [
    {
      id: "round",
      beat: "1. Round",
      title: "How a round runs",
      body: "Present your answer (about 7 to 12 minutes). The other team gives commentary (about 5 to 8). You reply. Then judges ask questions (about 10 to 15). Regions set the exact times. Bring only blank scratch paper.",
    },
    {
      id: "score",
      beat: "2. Score",
      title: "What judges score",
      body: "Each item is 1 to 10: presentation clarity, moral dimensions, other viewpoints, commentary, response to commentary, and answers to judges. Team total up to 60. Spirit (1 to 5) sits on a separate sheet.",
    },
    {
      id: "strong",
      beat: "3. Strong",
      title: "What a strong answer sounds like",
      body: "Answer the moderator's question in the first 30 seconds. Keep judge answers under 45 seconds. Name the strongest objection, then answer it. In commentary, raise one or two big gaps, not ten small ones. Disagree with ideas, never with people.",
    },
  ] satisfies EthicsBowlBeat[],
  tips: [
    "Only seated members may speak. One person speaks at a time during conferral.",
    "Stay ethical, not legal: if a judge pushes for policy, answer briefly, then return to the moral question.",
    "Stronger presentations get tougher judges' questions. That is a good sign.",
  ],
} as const;
