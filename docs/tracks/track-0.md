# Track 0: Foundation (run first)

**Status: merged in PR #1 (Nov 21, 2026).** Cursor built it before this pack existed. Follow-ups are listed at the end.

Start a new Cursor chat for this track with:

> @AGENTS.md @docs/tracks/track-0.md Read both, then the files listed under "Read first". Build this track. Ask me before changing anything another track owns.

## Read first

Sections of `docs/spec.md`:
- "Who uses it"
- "Cruxy"
- "Sign in, consent and attendance"
- "Data model"
- "Cost plan and caps"
- "Privacy and security"

Other files:
- `docs/research/apis.md` (Supabase keys, passcode sign in on top of Supabase Auth, AI Gateway)
- `docs/research/costs.md`
- `docs/infrastructure.md`
- `docs/design/README.md` and `docs/design/tokens.css`

Screens to match (in `docs/design/screens/`):
- `Main.html` (sign in, meet Cruxy)
- `ChooseCode.html` (choose your passcode)
- `TodayPhone.html` (phone shell and tab bar)

## What this track owns

package.json, the app shell and layouts, supabase/migrations (whole schema), src/lib/types.ts, src/lib/db/*, src/lib/auth/*, src/lib/cruxy/callCruxy.ts, src/lib/db/repository.ts (logActivity), src/app/globals.css. Other tracks import these and only add to them.

Use the shared types in `src/src/lib/types.ts`, the Supabase clients in `src/lib/db/`, `callCruxy()` for every model call and `logActivity()` for every mutation.

## What to build

Create a Next.js App Router project in TypeScript with Tailwind and shadcn/ui, deployed on Vercel, using Supabase. Implement the full schema from the Data model section as SQL migrations with row level security as described. Build sign in: pick your name (grouped by team), enter a 6 digit code on a keypad; the first sign in uses the shared member code (or an admin starter code), then after consent the person chooses their own 6 digit passcode, typed twice, refusing the shared code, repeated digits and straight runs, with a line saying Jainam can see it; each personal passcode is stored as an argon2 hash plus an AES-GCM copy encrypted with PASSCODE_VIEW_KEY; a Jainam-only Passcodes panel reveals one for 20 seconds (re-entering his own passcode first) and resets them, logging every reveal and reset; Jainam's own passcode is hash only; 30 day sessions; 5 failures lock a name for 10 minutes. Build the first-sign-in consent screen from the Sign in and Cruxy sections, including a 20 second voice sample recorder. Add an admin switch for admins, an activity_log writer used by every mutation, and one server function callCruxy(feature, model, messages) that logs tokens and cost to ai_calls and refuses calls over the caps in the Cost plan section. Add design tokens as CSS variables so the visual design can be swapped in later. Make every screen work in phone browsers (web only): responsive layouts, an installable home screen version, and audio recording tested on iPhone Safari and Android Chrome. Reminders in the app; email only for people who add an email and opt in. Add the first-run checklist.

## Also in this track

- Seed `teams` and `people` from the list in `AGENTS.md` (Jainam: tech_admin, Dr. B: coach_admin, everyone else: member), and the 12 active cases (1, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15; 2, 6 and 8 inactive) with titles from `docs/domain/cases/`.
- Sign in works as described in "How sign in works" in `docs/research/apis.md`.
- Supabase values: `SUPABASE_SERVICE_ROLE_KEY` holds the `sb_secret_` key and `NEXT_PUBLIC_SUPABASE_ANON_KEY` the `sb_publishable_` key.
- Copy `docs/design/tokens.css` to `src/app/globals.css` and load Bricolage Grotesque, Inter and IBM Plex Mono with `next/font/google`.
- Put the floating Cruxy and lamp slots in the root layout (Track 4 fills them in).

## Checks (tick each one in this file when it passes)

- [ ] A member cannot read auth_codes or ai_calls
- [ ] Wrong codes lock after 5 tries
- [ ] After choosing a passcode the shared code no longer signs that name in
- [ ] Only Jainam can reveal or reset a passcode, and every reveal is in the activity log
- [ ] Consent is stored with its version
- [ ] CallCruxy refuses when the monthly cap is reached
- [ ] Every new table has RLS policies in its migration
- [ ] Every screen in this track works at 390px wide and matches its reference
- [ ] No secret appears in code, tests, logs or client bundles

## Done means

All checks ticked, the app builds on Vercel with no type errors, and Jainam has clicked through the track's screens on a phone.

## Follow-ups after PR #1

- [ ] Set the Supabase values (URL, `sb_secret_` key, `sb_publishable_` key) in Vercel and `.env.local`, apply `supabase/migrations/00001_track0_foundation.sql` and `supabase/seed.sql`, and confirm sample-data mode switches off
- [ ] Check every API route calls the session and role check before touching the database (the secret key bypasses RLS)
- [ ] Set RLS on every table to deny `anon` by default
- [ ] Fix `--crux-paper` in `src/app/globals.css` to #F3F4F6 and compare the sign in, consent and choose-passcode screens with `docs/design/screens/Main.html` and `ChooseCode.html`
- [ ] Confirm the seed has the 12 active cases with titles from `docs/domain/cases/` and cases 2, 6 and 8 inactive
- [ ] Add the floating Cruxy and lamp slots to the app layout (Track 4 fills them in)
