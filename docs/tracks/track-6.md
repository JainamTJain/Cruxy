# Track 6: Admin

Start a new Cursor chat for this track with:

> @AGENTS.md @docs/tracks/track-6.md Read both, then the files listed under "Read first". Build this track. Ask me before changing anything another track owns.

## Read first

Sections of `docs/spec.md`:
- "Program map, admin console and weekly summary"
- "Cost plan and caps"

Other files:
- `docs/research/costs.md`
- `docs/decisions.md` (who sees what)

Screens to match (in `docs/design/screens/`):
- `Home.html` (program map, the launch screen)
- `Admin.html`
- `Drawer.html` (Cruxy admin mode)

## What this track owns

src/app/(app)/admin/*, src/app/(app)/page.tsx (program map), src/lib/admin/*, the weekly summary cron route.

Track 0 is merged; build on its files. Use the shared types in `src/src/lib/types.ts`, data access through `src/lib/db/repository.ts`, `callCruxy()` for every model call and `logActivity()` for every mutation.

## What to build

Using the Program map, admin console and Cost plan sections: the program map launch screen for everyone; the competition log and season rollover; the Is Crux working view for Jainam only; the admin console with the permissions table; spend dashboard from ai_calls with caps and alerts; consent status; activity log; calibration view for the technical admin; the Sunday 6 pm weekly summary email for opted-in admins; Cruxy admin mode in the drawer, answering program questions (who is prepared, what is happening where, which team needs help) from live data with links to the records used.

## Checks (tick each one in this file when it passes)

- [ ] Dr. B cannot change codes or caps
- [ ] The weekly email sends only to opted-in admins
- [ ] Spend totals match ai_calls
- [ ] Every new table has RLS policies in its migration
- [ ] Every screen in this track works at 390px wide and matches its reference
- [ ] No secret appears in code, tests, logs or client bundles

## Done means

All checks ticked, the app builds on Vercel with no type errors, and Jainam has clicked through the track's screens on a phone.
