# Track 3: Revision

Start a new Cursor chat for this track with:

> @AGENTS.md @docs/tracks/track-3.md Read both, then the files listed under "Read first". Build this track. Ask me before changing anything another track owns.

## Read first

Sections of `docs/spec.md`:
- "Revision"
- "Moderator question bank"
- "Personal roadmap and deadlines"

Other files:
- `docs/research/apis.md` (ts-fsrs)
- `docs/domain/templates.md`
- `docs/domain/cases/`

Screens to match (in `docs/design/screens/`):
- `OnePager.html`
- `FlashPhone.html`
- `DrillPhone.html`
- `Roadmap.html`

## What this track owns

src/lib/revision/*, src/lib/roadmap/*, src/app/(app)/revise/*, src/app/(app)/roadmap/*.

Track 0 is merged; build on its files. Use the shared types in `src/src/lib/types.ts`, data access through `src/lib/db/repository.ts`, `callCruxy()` for every model call and `logActivity()` for every mutation.

## What to build

Using the Revision, Moderator bank and Roadmap sections: one pager drafting and editing with diff and Drive export; flashcards generated from truth items and readings with FSRS scheduling, auto-assigned to leads and opt-in for others (shown on profiles); Socratic drills; language and analogy suggestions with a personal phrasebook; 10 minute warm up; visual one pagers (claim map diagram, values scale, stakeholder grid, fact timeline, question table); the moderator bank with Dr. B's unstructured paste-in, origin tags, difficulty, weighted random serve and answer log; personal roadmaps with the seven stages, auto-marking rules and recommended deadlines counted back from the competition date.

## Checks (tick each one in this file when it passes)

- [ ] A changed truth item updates its flashcards
- [ ] Dr. B's pasted text becomes separate tagged questions for her to confirm
- [ ] Roadmap stages mark themselves done from real activity
- [ ] Every new table has RLS policies in its migration
- [ ] Every screen in this track works at 390px wide and matches its reference
- [ ] No secret appears in code, tests, logs or client bundles

## Done means

All checks ticked, the app builds on Vercel with no type errors, and Jainam has clicked through the track's screens on a phone.
