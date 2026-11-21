# Workstreams

Each workstream is one Cursor agent and one pull request. Read `AGENTS.md` and `docs/orchestration/README.md` first. Only edit the files your workstream owns; if you must change a shared file, add to it and say so in the PR.

Audit of main on Nov 21, 2026 (screenshots at 1440 wide, sample data): every page renders, but none matches its reference. Cream background instead of paper grey; no dark ink sidebar; no "crux" wordmark at display size; page titles in Inter instead of Bricolage 800; the lamp is a black dot labelled "lamp" and the floating Cruxy is missing; team colours are wrong (Team 1 is cardinal); Case 10 is titled "Right to Be Forgotten" (correct: "To Be, or Not to Be…Forgotten?"); every content page is empty because nothing from `docs/domain/` was loaded.

---

## Wave 1 (start now, in parallel)

### 0. Wire Supabase (blocks the live site)

Found Nov 21: the whole data layer runs only on the local JSON sample store. Six repositories throw "Supabase path not wired yet" (`src/lib/db/repository.ts`, `library-repository.ts`, `practice-repository.ts`, `src/lib/revision/repository.ts`, `src/lib/team/repository.ts`, and the case brain and admin code that call them). The live site on Vercel returns 500 on `/api/auth/people`, so nobody can sign in. The Supabase database is ready: all seven migrations and `seed.sql` were applied on Nov 21 (project `jwqjxsjwglukpkokpmcb`).

Owns: every `*repository.ts` under `src/lib/`, a new `src/lib/db/supabase/` folder for the Postgres implementations, `src/lib/db/config.ts`.

1. Implement the Supabase path for **every** function in every repository, against the applied schema, using `@supabase/supabase-js` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server only. Keep the sample store for local development behind `USE_SAMPLE_DATA=1`.
2. Same function signatures, so no page changes. If the schema lacks something a function needs, add a new migration (00008 and up); never edit an applied one.
3. Starter codes: when `MEMBER_STARTER_CODE_HASH` is unset in Supabase mode, show admins a clear message in the admin console instead of crashing.
4. Write an integration test script (`scripts/supabase-smoke.ts`) that, against a real project, signs a person in with the starter code, records consent, chooses a passcode, signs in again, posts a chat message, creates a proposal and a decision, and reads them back. Run it against the live project before opening the PR and paste the output in the PR.
5. Every mutation still writes `activity_log`; every route still checks the session and role first.

Done when the preview deployment of the PR lets Jainam sign in, and the smoke script passes.

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
- **G. Admin:** `Admin.html`, passcodes panel, model settings panel (uses `getModelSettings`/`updateModelSettings` from Workstream M); spec "Program map, admin console and weekly summary", "Cost plan and caps", "Sign in" passcode rules. Owns `src/app/(app)/admin/**`.

After Wave 2: one agent runs both checklists top to bottom, fixes what's left, and lists anything still unticked.

### Wave 2 rules (Nov 21, after Wave 1 merged)

- Main is live: sign-in, the 15 real people, 3 teams, 12 cases and all Team 3 content (24 claims, 159 truth items, 116 questions, 12 one pagers, 159 flashcards) are in Supabase. Design every screen against that real data; never show "sample data" text, placeholder numbers or lorem.
- Workstream 0b is finishing Supabase paths for the remaining repository functions. Do not edit existing functions in `src/lib/db/repository.ts` or `src/lib/db/supabase/*`. If your screen needs a new data function, add it to a new file `src/lib/db/supabase/<your-area>-extra.ts` with an `isSampleDataMode()` dispatch, and say so in your PR.
- Never write to the filesystem on Vercel. Every mutation writes `activity_log`. RLS on any new table, revoke anon and authenticated.
- AI only through `callCruxy({ tier: 'small' | 'strong', ... })`. No model names, no provider SDKs, no Anthropic.
- Prove parity with `npm run shots` (desktop 1440 and phone 390) next to the reference HTML, and tick only D- and F-items you can show.

### Migration numbers (reserved so parallel agents never collide)

Applied on the live project: 00001 to 00012 and 00018 (00013 and 00015 were rejected). Reserved: **H 00011, I 00012, C 00013, D 00014, E 00015, F 00016, G 00017, J 00018, K 00019**. If you need a second migration, use your number with a letter suffix (`00014b_...`). Never reuse or edit an applied migration. Claude applies them to the live project when your PR merges.

## Wave 3 (start now, in parallel with Wave 2)

- **H. Cruxy's brain** (spec "Cruxy", "Cruxy's agents, models and prompts", "Research"). Build the eight agents as separate modules in `src/lib/cruxy/agents/` (Librarian, Researcher, Analyst, Coach, Moderator, Opponent, Judge, Assistant), each with its prompt in `src/lib/cruxy/prompts/<agent>.ts` (shared system prompt and the reasoning standard copied verbatim from the spec) and a zod output schema, all calling `callCruxy` with a tier. Owns:
  - `src/lib/cruxy/citations.ts`: the server check that every cited id exists and every quoted string appears in the cited text; failures are dropped and logged. Hook it into `callCruxy` by adding, not rewriting.
  - `src/lib/cruxy/context.ts`: context packing. Fixed prefix (rules and case card, so caching applies), the relevant claim-map nodes and the top 8 to 12 passages from a pgvector search RPC `match_passages(query_embedding, case_id, match_count)` in migration 00011, embedded with the `embed` tier.
  - The example library: tables for worked examples and Cruxy feedback (useful or not useful, with a reason; leads and admins can mark a point wrong), also in 00011.
  - `tests/cruxy/` with the fixed test set built from `docs/domain/cases/`, run by `npm run test:cruxy`. A prompt change ships only if the score is the same or higher.
  - The weekly review draft that the technical admin approves.
  - The Researcher: nightly gap finding and verification with Gateway web search through `callCruxy`, writing finding cards with sources, and `src/app/api/cron/research`. This replaces the Research item in F's brief.
  - The Librarian extracting ideas from synced Drive files into proposals for each team, so Teams 1 and 2 get their own content from their own Drive docs.
  - Existing feature code (case-brain analyst, practice judge, team assistant, library digest) calls the agents; change only those call lines.
- **I. Privacy, operations and reliability** (spec "Privacy and security", "Cost plan and caps" alerts). Owns `src/app/api/cron/{cleanup,keepalive,backup}/**`, `src/lib/ops/**`, `vercel.json` (merge cron entries carefully; others may add theirs), `public/manifest.webmanifest` and icons, `next.config` headers, migration 00012. Covers:
  - A nightly backstop that deletes audio older than 24 hours.
  - Voice samples deleted on withdrawal and at season end.
  - An admin "delete this person's transcript lines, voice sample and comments" action, exposed as a server function for G's admin screen.
  - Season-end export to the Drive folder: the service account is read-only, so produce a downloadable archive for the admin instead and say so in the PR.
  - Brute-force limits and activity-log entries on session codes and the judging portal (coordinate with D through server helpers, not D's pages).
  - A Supabase keep-alive so the free project never pauses over winter break.
  - A weekly logical backup of key tables to Supabase Storage.
  - Security headers (CSP, frame-ancestors, referrer policy).
  - A PWA manifest with the lamp as the icon so phones can add Crux to the home screen.
  - The 80 percent spend alert by email to Jainam through Resend (`EMAIL_API_KEY`; sender `onboarding@resend.dev` until a domain is verified).
