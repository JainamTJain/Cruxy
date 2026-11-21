# Track 2: Case brain

Start a new Cursor chat for this track with:

> @AGENTS.md @docs/tracks/track-2.md Read both, then the files listed under "Read first". Build this track. Ask me before changing anything another track owns.

## Read first

Sections of `docs/spec.md`:
- "Case brain and Truth Sources"

Other files:
- `docs/domain/ethics-bowl.md` (Part 4, how we build an argument)
- `docs/domain/templates.md`
- `docs/domain/cases/` (real content to test with)

Screens to match (in `docs/design/screens/`):
- `CaseBrain.html`

## What this track owns

src/lib/casebrain/*, src/app/(app)/cases/[case]/*.

Track 0 is merged; build on its files. Use the shared types in `src/src/lib/types.ts`, data access through `src/lib/db/repository.ts`, `callCruxy()` for every model call and `logActivity()` for every mutation.

## What to build

Using the Case brain section: per team per case, a claim map editor (at least 2 claims, 3 supports each, backing, at least 1 counterclaim with concede, distinguish, rebut), truth items, case roles, and a proposals queue. Decisions are green tick, red cross or edit with a required one line reason; show other teams' decisions on the same idea. When a team edits or accepts anything, create proposals for the other two teams tagged "Inspired by Team N". Add the Analyst agent's one line note only when there's a problem. Add the likely opposing positions bank per case with commentary angles, and a Socratic question before any Inspired by decision. Add robustness bars, the cross-case consistency check and the change-the-facts list. Keep full history per item.

## Checks (tick each one in this file when it passes)

- [ ] A decision without a reason cannot be saved
- [ ] A Team 1 edit appears in Teams 2 and 3 queues
- [ ] History shows every change
- [ ] Every new table has RLS policies in its migration
- [ ] Every screen in this track works at 390px wide and matches its reference
- [ ] No secret appears in code, tests, logs or client bundles

## Done means

All checks ticked, the app builds on Vercel with no type errors, and Jainam has clicked through the track's screens on a phone.
