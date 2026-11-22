/**
 * Short dated product changes for returning people.
 * Edit this list when something moves. Newest first.
 */

export type WhatsNewEntry = {
  date: string; // YYYY-MM-DD
  title: string;
  body: string;
  href?: string;
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    date: "2026-11-22",
    title: "Help, glossary and report a problem",
    body: "Ethics Bowl in 90 seconds, a shared glossary, a searchable help page, What's new, and a Report button on every page.",
    href: "/help",
  },
  {
    date: "2026-11-22",
    title: "Today is the landing page",
    body: "Members land on three things to do, a Dec 5 countdown, warm-up and one-tap Judges' Q&A. The program map stays one tap away.",
    href: "/today",
  },
  {
    date: "2026-11-21",
    title: "Cruxy moods and a clearer Genie",
    body: "Cruxy shows how it feels while it works. The lamp and Genie share one size so the page stays calm.",
  },
  {
    date: "2026-11-21",
    title: "Team Brief and Evidence Library",
    body: "Each case keeps the team's stance and trusted citations in one place. Same words everywhere: Team Brief, Evidence Library.",
    href: "/case-brain",
  },
];
