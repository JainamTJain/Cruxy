# Who owns which checklist items (sprint to 2 p.m., Nov 21, 2026)

Every F-item in `feature-checklist.md` has exactly one owner. Work only your ranges, tick an item only when it works end to end in the running app with real data (write the file path next to it), and open small PRs often; Claude merges continuously. If an item truly belongs to someone else, leave a one-line note under it, not a code change in their files.

| Checklist section | F range | Owner |
| --- | --- | --- |
| How to build it | F-002 to F-013 | K (audit, tick what's proven) |
| Who uses it (roles, permissions) | F-014 to F-020 | J |
| Cruxy | F-021 to F-026 | H |
| Cruxy's character, floating Cruxy and the lamp | F-027 to F-050 | J |
| Sign in, consent and attendance | F-051 to F-077 | J (attendance items that live on the Session screen: D, through J's server helpers) |
| Library and Drive sync | F-078 to F-092 | F |
| Research | F-093 to F-107 | H |
| Case brain and Truth Sources | F-108 to F-121 | C |
| Revision | F-122 to F-133 | F (one pagers: C) |
| Moderator question bank | F-134 to F-140 | F |
| Personal roadmap and deadlines | F-141 to F-159 | F |
| Assignments, team chat and the Cruxy assistant | F-160 to F-183 | E |
| Sessions | F-184 to F-204 | D |
| Practice and recording | F-205 to F-234 | D |
| Judging and calibration | F-235 to F-265 | D |
| Feedback reports and the bank | F-266 to F-281 | D |
| Program map, admin console and weekly summary | F-282 to F-305 | G |
| Data model | F-306 to F-332 | K |
| Cruxy's agents, models and prompts | F-333 to F-359 | H |
| Cost plan and caps | F-360 to F-370 | G (alerts: I) |
| Stack, services and repos | F-371 to F-385 | K |
| Privacy and security | F-386 to F-394 | I |

Design items (D-xxxx in `design-parity.md`) follow the screen: whoever owns the screen owns its D-items.

## Open source to learn from (check the license before copying; MIT and Apache 2.0 are fine with credit in `THIRD_PARTY_NOTICES.md`)

- **D (practice, judging):** `RutanshP/Debby` does browser recording, AssemblyAI transcription, an AI opponent, a judge-style reason for decision, WPM and speech analytics; borrow its round flow and analytics ideas. `dinesh-git17/debate-lab` has judge and summary views and a debate engine to study.
- **H and F (search, citations):** `supabase-community/chatgpt-your-files` (pgvector to production, chunking, match function) and `supabase-community/nextjs-openai-doc-search` (Apache 2.0) for the embed, match and cite pipeline. Use AI Gateway through `callCruxy`, never their OpenAI calls.
- **F (revision):** `open-spaced-repetition/ts-fsrs` (MIT), `ishiko732/ts-fsrs-demo` (MIT, Next.js App Router plus ts-fsrs) for the review flow, and `zsh-eng/spaced` for swipe gestures on phone flashcards (react-swipeable).
- Never paste code that calls a provider directly, stores data in localStorage instead of Supabase, or skips activity_log.
