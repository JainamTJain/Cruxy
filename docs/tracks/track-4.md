# Track 4: Team space

Start a new Cursor chat for this track with:

> @AGENTS.md @docs/tracks/track-4.md Read both, then the files listed under "Read first". Build this track. Ask me before changing anything another track owns.

## Read first

Sections of `docs/spec.md`:
- "Assignments, team chat and the Cruxy assistant"
- "Cruxy"

Other files:
- `docs/design/README.md` (Cruxy floating and lamp)
- `public/cruxy/`

Screens to match (in `docs/design/screens/`):
- `TeamBoard.html`
- `Drawer.html`
- `Cruxy.html` (drag, sleep in the lamp, call back)
- `CruxyMoods.html`

## What this track owns

src/lib/team/*, src/components/cruxy/* (CruxyFloat, Lamp, Drawer), src/app/(app)/team/*.

Track 0 is merged; build on its files. Use the shared types in `src/src/lib/types.ts`, data access through `src/lib/db/repository.ts`, `callCruxy()` for every model call and `logActivity()` for every mutation.

## What to build

Using the Assignments section: an Assign button on cases, decks, one pagers, readings and practice slots; case roles editable in two taps with a chat announcement; a team board of 12 cases by role; team and program chat channels readable by all; the Cruxy assistant drawer on every page, aware of the current page and highlight; the floating Cruxy and its lamp from the Cruxy section (drag anywhere with position saved, tap Cruxy to open the drawer, sleeps in the lamp at the bottom right, tap the lamp to call it, hidden during recording and timed rounds, moods optional) using the PNGs in /public/cruxy/; answering from team truth items first with citations.
Add Staying on the same page: versioned claim maps with a one line reason per change, diffs posted to chat and home, "I've got vN" confirmations shown on the case board, Cruxy alignment questions after changes, drift flags in transcripts, and two-person approval for changing a claim.

## Checks (tick each one in this file when it passes)

- [ ] Changing a lead updates the board, the roadmap and posts in chat
- [ ] A claim change creates a new version that members must confirm
- [ ] The assistant refuses to answer without sources and says so
- [ ] Every new table has RLS policies in its migration
- [ ] Every screen in this track works at 390px wide and matches its reference
- [ ] No secret appears in code, tests, logs or client bundles

## Done means

All checks ticked, the app builds on Vercel with no type errors, and Jainam has clicked through the track's screens on a phone.
