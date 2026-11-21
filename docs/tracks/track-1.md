# Track 1: Library

Start a new Cursor chat for this track with:

> @AGENTS.md @docs/tracks/track-1.md Read both, then the files listed under "Read first". Build this track. Ask me before changing anything another track owns.

## Read first

Sections of `docs/spec.md`:
- "Library and Drive sync"
- "Research"

Other files:
- `docs/research/apis.md` (Google Drive, service account)
- `docs/infrastructure.md`

Screens to match (in `docs/design/screens/`):
- `Reading.html` (reading room)
- `Admin.html` (books and Drive sorting queue panel)

## What this track owns

src/lib/drive/*, src/lib/library/*, src/app/(app)/library/*, src/app/(app)/reading/*, the nightly sync and research cron routes.

Track 0 is merged; build on its files. Use the shared types in `src/src/lib/types.ts`, data access through `src/lib/db/repository.ts`, `callCruxy()` for every model call and `logActivity()` for every mutation.

## What to build

Using the Library and Research sections: connect Google Drive read only through the service account in GOOGLE_SERVICE_ACCOUNT_JSON for the folder in DRIVE_ROOT_FOLDER_ID, using files.list for the first walk and changes.list with a stored start token after that; nightly cron and a Sync now button; process only new or changed files; extract text; tag cases, type and confidence with the Librarian agent; split into ~600 word passages with anchors; embed into pgvector; write file cards; send ideas from practice transcripts to proposals. Build the reading room: open any file beside its case set page, highlight, threaded comments visible to all, ask Cruxy about a highlight, turn a highlight into a flashcard or proposal. Build global search with filters. Build the nightly Researcher loop and book requests visible to the technical admin only.

## Checks (tick each one in this file when it passes)

- [ ] Re-running sync on unchanged files makes zero AI calls
- [ ] Every passage links back to its Drive file and anchor
- [ ] A sorting queue shows files under 0.7 confidence
- [ ] Every new table has RLS policies in its migration
- [ ] Every screen in this track works at 390px wide and matches its reference
- [ ] No secret appears in code, tests, logs or client bundles

## Done means

All checks ticked, the app builds on Vercel with no type errors, and Jainam has clicked through the track's screens on a phone.
