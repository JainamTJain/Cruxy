/**
 * Short answers to the questions a new person would ask.
 * Wave 9 G help page. Keep under ~40 words each.
 */

export type HelpFaq = {
  id: string;
  question: string;
  answer: string;
  /** Tags for search. */
  tags: string[];
  href?: string;
};

export const HELP_FAQS: HelpFaq[] = [
  {
    id: "what-is-crux",
    question: "What is Crux?",
    answer:
      "Crux is the private home for USC's three Ethics Bowl teams. It holds cases, practice, evidence and Cruxy in one place so prep stays organised.",
    tags: ["crux", "app", "start"],
  },
  {
    id: "what-is-ethics-bowl",
    question: "What is Ethics Bowl?",
    answer:
      "A collegiate contest where teams reason through real moral cases. Judges score clarity, moral analysis, other viewpoints, commentary and Q&A.",
    tags: ["ethics bowl", "appe", "new"],
    href: "/help/ethics-bowl",
  },
  {
    id: "how-do-i-sign-in",
    question: "How do I sign in?",
    answer:
      "Tap your name, enter the starter passcode Jainam gave you once, then choose your own six-digit code. Forgot it? Ask Jainam.",
    tags: ["sign in", "passcode", "login"],
  },
  {
    id: "where-do-i-start",
    question: "Where should I start today?",
    answer:
      "Open Today. Do the three things listed. New to the event? Read Ethics Bowl in 90 seconds first.",
    tags: ["today", "start", "new"],
    href: "/today",
  },
  {
    id: "what-is-my-case",
    question: "How do I find my case?",
    answer:
      "Open Cases. Your Team Brief and Evidence Library live on the case page. Leads own the stance; everyone still reads every case.",
    tags: ["case", "team brief", "evidence"],
    href: "/case-brain",
  },
  {
    id: "how-practice-works",
    question: "How does practice work?",
    answer:
      "Start a mode alone or with a join code. Warm-up and Judges' Q&A are one tap. Full rounds get scored like a real match.",
    tags: ["practice", "drill", "round"],
    href: "/practice",
  },
  {
    id: "what-judges-score",
    question: "What do judges score?",
    answer:
      "Presentation (clarity, moral dimensions, other viewpoints), commentary, response to commentary, and answers to judges. Up to 60 points, plus spirit.",
    tags: ["judges", "scoring", "appe"],
    href: "/help/ethics-bowl",
  },
  {
    id: "what-is-evidence-library",
    question: "What is the Evidence Library?",
    answer:
      "Shared facts and citations the team trusts. Tap a marked term anywhere, or open the glossary for the full list.",
    tags: ["evidence library", "glossary", "sources"],
    href: "/help/glossary",
  },
  {
    id: "what-is-team-brief",
    question: "What is the Team Brief?",
    answer:
      "The one place for your team's stance on a case: claims, counters and open work. Keep it current so the table speaks as one.",
    tags: ["team brief", "claims"],
  },
  {
    id: "how-cruxy-helps",
    question: "How does Cruxy help?",
    answer:
      "Call Cruxy from the lamp. It asks before it answers and shows sources when it can. If it cannot cite, it says so.",
    tags: ["cruxy", "ask", "cite"],
  },
  {
    id: "three-teams",
    question: "Why three USC teams?",
    answer:
      "All three teams share Crux. They never compete against each other. Each team decides its own stance.",
    tags: ["teams", "usc"],
  },
  {
    id: "recording",
    question: "Will Crux record me?",
    answer:
      "Only after you consent. Audio is deleted once the transcript is saved. You can stay text-only in settings and consent.",
    tags: ["recording", "consent", "privacy"],
  },
  {
    id: "report-problem",
    question: "Something is broken. What do I do?",
    answer:
      "Tap Report on any page. Say what you were doing. Jainam gets a queue item and you hear when it is fixed.",
    tags: ["bug", "report", "feedback"],
  },
  {
    id: "whats-new",
    question: "What changed since I was last here?",
    answer:
      "Open What's new for a short dated list. Returning people should check it after big updates.",
    tags: ["changelog", "whats new", "updates"],
    href: "/help/whats-new",
  },
  {
    id: "dec-5",
    question: "What is Dec 5?",
    answer:
      "The APPE California Regional at UC Santa Barbara. Use Today for the countdown, warm-up the morning of a round, and keep phones ready for bad wifi.",
    tags: ["competition", "ucsb", "regional"],
    href: "/today",
  },
];

export function searchFaqs(query: string): HelpFaq[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_FAQS;
  return HELP_FAQS.filter(
    (f) =>
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q) ||
      f.tags.some((t) => t.includes(q)),
  );
}
