# AGENTS.md: read this first

You are building **Crux**, a private web app for USC's three Ethics Bowl teams, and **Cruxy**, its AI. The first deadline is the APPE California Regional at UC Santa Barbara on **Saturday, December 5, 2026**. The app keeps being used after that (semifinals, nationals, next season).

This file tells you where every piece of context lives. Do not guess what the product should do: it is all written down in `docs/`. If something you need is not there, stop and ask Jainam instead of inventing it.

## Status (Nov 21, 2026)

Tracks 0 to 6 are merged as plumbing (code under `src/`). The product does **not** yet match the spec or the designs. All work now follows `docs/orchestration/README.md`: reach parity with every item in `docs/orchestration/feature-checklist.md` and `docs/orchestration/design-parity.md`, with real seeded content, before adding anything new. Your task brief is in `docs/orchestration/waves.md`.

## The order to read things

1. `docs/spec.md`: the full product spec. It is the source of truth for features, data model, prompts and checks.
2. `docs/decisions.md`: every decision Jainam made, with his reasons. Never "improve" one of these away.
3. `docs/orchestration/README.md`, `waves.md` and the two checklists: what done means now.
4. `docs/tracks/track-N.md`: the original track briefs and checks.
5. `docs/design/README.md`: how the screens must look, with the reference HTML for every screen.
6. `docs/research/apis.md`: verified, current notes for every outside API. Use these, not your memory.
7. `docs/domain/`: what Ethics Bowl is, the scoring card, and the 12 regional cases. Cruxy's prompts and tests use these.
8. `docs/infrastructure.md`: which accounts, projects and IDs already exist.

## The stack (do not change it)

- Next.js App Router, TypeScript (strict), Tailwind, shadcn/ui restyled to the Crux design.
- Supabase: Postgres with pgvector, Storage, row level security, scheduled functions. Project `crux`, ref `jwqjxsjwglukpkokpmcb`, region us-west-2. All access is server side (see `docs/research/apis.md`, "How sign in works").
- Vercel for hosting and cron. All AI calls go through the Vercel AI SDK and AI Gateway with `creator/model` strings.
- Google Drive API with a **service account** (read only) for the team's Drive.
- AssemblyAI for transcripts with speaker labels.
- Resend for email.

## Rules that are never broken

1. **No citation, no display.** Every AI output stores the ids of the sources it used. If Cruxy can't cite, it says so.
2. **One AI gateway.** Every model call goes through `callCruxy()` in `src/lib/cruxy/callCruxy.ts`, which logs to `ai_calls`, enforces the caps in the spec's Cost plan section and refuses calls over them. Never call a model anywhere else. Never add an Anthropic, OpenAI, Google or other provider SDK or key: only Vercel AI Gateway, with tier names (`small`, `strong`); Jainam chooses the model behind each tier in admin settings, so never hardcode a model or default provider.
3. **Secrets live only in environment variables** (see `.env.example`). Never commit a key, a passcode, a service account file or a `.env` file. Never put a secret in a prompt, a log line or client code.
4. **`SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_` key), `PASSCODE_VIEW_KEY` and the service account are server only.** Never import them into a client component.
5. **Row level security on every table**, written in the same migration that creates the table.
6. **Every mutation writes to `activity_log`.**
7. **Consent before recording.** Nothing records without stored consent. Audio is deleted once the transcript is saved.
8. **Progress is measured against the person's own past**, never against fixed score cutoffs or against other people.
9. **The three USC teams never compete against each other.** Everything is visible to all three teams; each team decides for itself.
10. **Cruxy asks before it answers.** See the Cruxy section of the spec and `.cursor/rules/30-cruxy-ai.mdc`.
11. **Writing style in the UI:** plain words, short sentences, no jargon, no em dashes. No middle dots ("·") as separators either; Jainam finds them ugly. Use line breaks, commas, spacing or small labels instead. Users never see the words "AI" or a model's name; they see "Cruxy".

## How to work

- Work on the workstream you were given in `docs/orchestration/waves.md`, and only touch the files it owns.
- Shared files (`src/lib/types.ts`, `src/lib/db/repository.ts`, `callCruxy`, `src/app/globals.css`): add to them, never rewrite them.
- Before opening a pull request, run `npm run typecheck`, `npm run build` and `npm run shots`, and tick the checklist items you finished.
- Write migrations in `supabase/migrations/`, one per change, never edit an applied one.
- When a check in the track file passes, tick it in that file in the same commit.
- If the spec and the code disagree, the spec wins. If the spec and `docs/decisions.md` disagree, ask Jainam.
- Keep commits small and named after the track: `track-2: proposals queue with required reasons`.

## People (for seed data)

- Team 1: Serena, Ivan, Ashton, Stolei, Tri
- Team 2: Lehar, Camerin, Jade, Bethany, Quixote
- Team 3: Nick, Daniel, Katie, Jainam
- Admins: Jainam (technical admin, sees everything including passcodes, spend and keys) and Dr. B (coach admin, sees everything except the technical panels)

This repository is **public** (Jainam's choice). Never commit secrets, `.env.local`, transcripts or anything a student said in practice.
