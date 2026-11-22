# Product audit (Wave 8, Workstream G)

Walked as a member, a case lead, Dr. B, and the tech admin on the live app shape (Nov 21 night). Scores are 1 to 5 for **impact** (does this help win Dec 5?) and **clarity** (can a new person grasp it in about 10 seconds?).

Crux should organise and ease the work, not add to it. Too much text, repeated sections, and parallel "where am I?" surfaces are the main drag.

## Scorecard (before → after this PR)

| Feature / surface | Who | Impact before | Clarity before | Verdict | After |
| --- | --- | --- | --- | --- | --- |
| Program map `/home` | All | 4 | 2 | Split: keep board for coaches; members land on Today | Today is primary; home stays the program board |
| "Your next three" vs "Today's practice" | Member | 4 | 2 | Merge into one focus stack | `TodayFocus` shows three actions once |
| Roadmap | Member / lead | 5 | 3 | Keep (E redesigns layout) | Linked from Today; not duplicated as a second board |
| Mastery map | Lead / coach | 3 | 3 | Keep, secondary | Reach from Cases / roadmap, not the first nav item |
| Case brain / Team Brief | Lead | 5 | 3 | Keep (C owns Brief + Evidence Library) | Today links into the case you lead |
| Reading room vs case reading | Member | 3 | 2 | Fold into case (F) | Nav still lists Reading until F finishes; audit flags the duplicate |
| Practice hub (9 modes) | Member | 4 | 2 | Keep hub; surface one-tap drills | One-tap Judges' Q&A + warm-up on Today |
| 10-minute warm-up | Member | 5 | 3 | Exists but hidden | CTA on Today and Practice |
| Flashcards | Member | 5 | 4 | Keep | Linked from Today / tour |
| Socratic / question bank | Member | 4 | 3 | Keep | Not in first-run tour (too many steps) |
| Team board / chat / roles | Lead / coach | 4 | 3 | Keep (E) | Tour step points at Team |
| Admin console monolith | Dr. B / Jainam | 4 | 2 | Trim intro copy; deep tools stay linked | Shorter header; flywheel / spend stay separate routes |
| Flywheel | Tech / coach | 3 | 3 | Keep for Wave 6 | Linked from admin only |
| Floating Genie / lamp | All | 4 | 3 | Keep (J) | First-visit tour uses Cruxy bubble, 3 steps |
| Checklist `/checklist` | New member | 3 | 2 | Easy to skip | Tour replaces the cold start; checklist remains |

## Persona walks (before)

### Member
Opens app → Program map full of team boards and Drive stats. Phone tab says "Today" but the page is a coach board. "Your next three" and "Today's practice" can both say join the same session. Warm-up and Judges' Q&A are three clicks away under Practice modes or Revision.

### Case lead
Needs one case, one next action, one drill. Mastery map, roadmap, case brain, and home all compete. No single "you lead Case N; do this in ten minutes" card.

### Dr. B
Admin console is long: readiness (again), rosters, then many tech panels. Coach needs people, sessions, weekly summary, competition log. Clarity suffers from length, not missing tools.

### Tech admin
Needs passcodes, models, spend, privacy, flywheel. Those exist but sit under the same scroll as coach work. Separate routes help; the console header still reads like a novel.

## Cuts and merges (this wave)

1. **Member landing = Today** (`/today`). Phone "Today" and the first desktop nav item go here. Program map stays at `/home` for the case board and coach view.
2. **One focus stack** of three actions (sessions first, then roadmap / warm-up / drill). No second "next three" panel on Today.
3. **First-visit tour** from Cruxy: three steps max (Today → your case → one drill). Stored in `localStorage`; no new table.
4. **Top Dec 5 helpers** built as product components (below).
5. **Leave** case page, roadmap layout, library fold-in, Genie size, and copy style guide to C, E, F, J, I.

## Top 5 missing pieces (built)

| # | Piece | Why for Dec 5 | Where |
| --- | --- | --- | --- |
| 1 | Today focus (three things) | Removes decision fog on competition week | `/today` + `TodayFocus` |
| 2 | Pre-round 10-minute warm-up CTA | Speakers warm up the morning of a round | Today + Practice hub |
| 3 | One-tap Judges' Q&A drill | Most common weak APPE item; no mode picker | Today + Practice |
| 4 | First-visit Cruxy tour (3 steps) | New members stop bouncing off the program map | App shell |
| 5 | Win strip (days left + lead case + next drill) | Keeps Dec 5 in view without a second dashboard | Today header |

## Navigation (after)

Desktop: **Today**, Program map, My roadmap, Cases, Practice, Team chat. Mastery and Reading stay reachable from case / revision hubs (F/C/E may move them). Reports fixture link drops out of the primary list (still reachable from practice).

Phone: **Today** → `/today`, Cases, Practice, Team.

## Migration

No `00053`. Tour completion is local; checklist and roadmap already exist.

## How to check

1. Sign in as a member → land or tap Today → three actions and win strip in one glance.
2. First visit after passcode → Cruxy tour, three steps, dismissible.
3. Tap Judges' Q&A → drill starts without the mode dropdown.
4. Tap Warm-up → `/revision/warmup`.
5. 390px and 1280px: Today fits without a second scroll of duplicate panels.
