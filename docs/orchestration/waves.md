# Workstreams

Each workstream is one Cursor agent and one pull request. Read `AGENTS.md` and `docs/orchestration/README.md` first. Only edit the files your workstream owns; if you must change a shared file, add to it and say so in the PR.

Audit of main on Nov 21, 2026 (screenshots at 1440 wide, sample data): every page renders, but none matches its reference. Cream background instead of paper grey; no dark ink sidebar; no "crux" wordmark at display size; page titles in Inter instead of Bricolage 800; the lamp is a black dot labelled "lamp" and the floating Cruxy is missing; team colours are wrong (Team 1 is cardinal); Case 10 is titled "Right to Be Forgotten" (correct: "To Be, or Not to Be…Forgotten?"); every content page is empty because nothing from `docs/domain/` was loaded.

---

## Wave 1 (start now, in parallel)

### A. Design foundation, shell and Cruxy

Builds on open PR #9 (`cursor/design-fidelity-4505`); continue that branch.

Owns: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/components/app-shell.tsx`, `src/components/cruxy/**`, `src/app/sign-in/**`, `src/app/consent/**`, `src/app/choose-passcode/**`, `src/components/keypad.tsx`, `src/components/name-picker.tsx`.

1. Tokens: set paper to #F3F4F6 (no cream, no gradient wash), team colours #0F7B6C / #4F46E5 / #C2410C everywhere they are defined, fonts via `next/font/google` (Bricolage Grotesque 600/800, Inter 400 to 700, IBM Plex Mono 500/600).
2. App shell exactly like the sidebar in `Home.html`: 248px ink (#111318) sidebar, lowercase "crux" wordmark in Bricolage 800, the nav items and order from the reference, active item cardinal, gold "Ask Cruxy" button with the lamp PNG at the bottom; main column padding 32/40px. On phones, the bottom tab bar from `TodayPhone.html` (Today, Cases, Practice, Team, Cruxy).
3. Sign in, consent and choose-passcode exactly like `Main.html` and `ChooseCode.html`: the cardinal panel with the giant wordmark, the "built so far" numbers from real counts, name chips grouped by team in team colours, the keypad, "Meet Cruxy" with the consent table; choose-passcode with Cruxy's question bubble and the live rule checks.
4. Floating Cruxy and the lamp exactly like `Cruxy.html` on every signed-in page: `public/cruxy/*.png` images (never a placeholder dot), drag with mouse, touch and arrow keys, position saved per person, Socratic bubble with "One hint, please" and "Back to the lamp", sleeps in the lamp at the bottom right with "z z", tap the lamp to call it, hidden during recording and timed rounds, moods mapped as in `CruxyMoods.html`.
5. The Cruxy drawer like `Drawer.html`, including admin mode.

Done when D-items for Main, ChooseCode, Home sidebar, TodayPhone tab bar, Cruxy, CruxyMoods and Drawer are ticked, with screenshots.

### B. Load the real content

Owns: `supabase/seed.sql` and new `supabase/seed/**`, `scripts/seed-*.ts`, the seeding part of `src/lib/db/sample-store.ts`, and a new migration only if a table is missing.

1. Fix seed data: team colours as above; Case 10 title "To Be, or Not to Be…Forgotten?"; all 12 active cases with their exact titles, and cases 2, 6, 8 inactive.
2. Parse every `docs/domain/cases/case-NN.md` into structured records for **Team 3** (the team that wrote them), tagged with origin "case prep doc": crux, trap and stakeholders; Claim 1 and Claim 2 with their three supports and backing; counterclaims with concede, distinguish or rebut; truth items (facts, quotes, examples, frameworks) with citations to the case set; the judge question bank and moderator question versions into `questions` (origin "member"); the commentary kit into likely opposing positions; the one-pager into a v1 one pager.
3. Generate flashcard decks from those truth items for the case leads, and seed Team 1 and Team 2 "Inspired by Team 3" proposals for a few items so the proposals queue has real examples.
4. Load the scoring card items exactly as in `docs/domain/scoring-card.md`.
5. Make the same content available in sample data mode, so screenshots show it.
6. Idempotent: running the seed twice changes nothing.

Done when every case page, the question bank, flashcards, one pagers and the proposals queue show real content in screenshots.

---

## Wave 2 (start from main after Wave 1 merges; one agent each)

Each one: make every D-item of its screens match, wire every F-item of its spec sections end to end, and show seeded content.

- **C. Case brain and one pagers:** `CaseBrain.html`, `OnePager.html`; spec "Case brain and Truth Sources", "Revision" (one pagers). Green tick and red cross with a required reason, Inspired by Team N queue, Socratic question before borrowing, versions and "I've got vN", visual one pager (claim map boxes, values scale, timeline, stakeholder grid, frameworks strip, question table). Owns `src/app/(app)/case-brain/**`, `src/app/(app)/revision/one-pagers/**`, related components.
- **D. Practice, sessions, judging, feedback:** `Session.html`, `Practice.html`, `JudgePhone.html`, `Feedback.html`, `DrillPhone.html`; spec "Sessions", "Practice and recording", "Judging and calibration", "Feedback reports and the bank". Owns `src/app/(app)/practice/**`, `src/app/judging/**`, related components and API routes.
- **E. Team space:** `TeamBoard.html`; spec "Assignments, team chat and the Cruxy assistant" (roles by case, gaps, Assign, chat with version diffs, mark as idea, alignment questions). Owns `src/app/(app)/team/**`.
- **F. Home, roadmap, revision and library:** `Home.html`, `Roadmap.html`, `FlashPhone.html`, `Reading.html`; spec "Program map", "Personal roadmap", "Revision" (flashcards, drills, language, warm-up), "Moderator question bank", "Library and Drive sync", "Research". Owns `src/app/(app)/home/**`, `src/app/(app)/revision/**` (except one pagers), `src/app/(app)/library/**`.
- **G. Admin:** `Admin.html`, passcodes panel; spec "Program map, admin console and weekly summary", "Cost plan and caps", "Sign in" passcode rules. Owns `src/app/(app)/admin/**`.

After Wave 2: one agent runs both checklists top to bottom, fixes what's left, and lists anything still unticked.
