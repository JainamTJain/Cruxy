# Track 5: Practice

Start a new Cursor chat for this track with:

> @AGENTS.md @docs/tracks/track-5.md Read both, then the files listed under "Read first". Build this track. Ask me before changing anything another track owns.

## Read first

Sections of `docs/spec.md`:
- "Sessions"
- "Practice and recording"
- "Judging and calibration"
- "Feedback reports and the bank"

Other files:
- `docs/research/apis.md` (AssemblyAI, MediaRecorder)
- `docs/research/costs.md`
- `docs/domain/scoring-card.md`
- `docs/domain/ethics-bowl.md` (Part 2 roles and timing, Part 3 rules and judging)

Screens to match (in `docs/design/screens/`):
- `Session.html`
- `Practice.html`
- `JudgePhone.html`
- `Feedback.html`
- `DrillPhone.html`

## What this track owns

src/lib/practice/*, src/lib/judging/*, src/lib/transcripts/*, src/app/(app)/practice/*, src/app/judge/* (portal), AssemblyAI webhook route.

Track 0 is merged; build on its files. Use the shared types in `src/src/lib/types.ts`, data access through `src/lib/db/repository.ts`, `callCruxy()` for every model call and `logActivity()` for every mutation.

## What to build

Using the Sessions, Practice, Judging and Feedback sections: admin session setup with rounds, timings, moderator and judges; hashed session codes shown only to admins; join flow that routes people by role; judging portal (in person or Cruxy; known judge enters the session code; new judge scans a QR, enters name and background); the APPE scoring card; the six practice modes plus the conferral drill, thesis in 30 seconds and Q&A routing; transcription vocabulary (automatic glossary, key terms per round, correction pass, learning from fixes); peer judging of recordings; predict your score first; chunked browser recording with resumable upload; AssemblyAI transcription with speaker labels; speaker matching and an admin label-confirm screen; audio deletion after the transcript is saved; the Cruxy judge with evidence-linked scores, calibration as described, reports with personal sections, scored redos, skills charts and the Things to take care of bank.

## Checks (tick each one in this file when it passes)

- [ ] Killing the browser mid-round loses at most 30 seconds
- [ ] Audio is gone after transcription
- [ ] Every feedback point links to a transcript line
- [ ] A round with no human judge gets Cruxy scores for every team
- [ ] Every new table has RLS policies in its migration
- [ ] Every screen in this track works at 390px wide and matches its reference
- [ ] No secret appears in code, tests, logs or client bundles

## Done means

All checks ticked, the app builds on Vercel with no type errors, and Jainam has clicked through the track's screens on a phone.
