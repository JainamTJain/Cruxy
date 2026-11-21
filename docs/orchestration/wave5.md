# Wave 5: close the checklist (Nov 21, 2026)

Jainam's call: finish every remaining F item first, then the innovation plan. Vercel is on Pro now, so every branch gets a preview again: open your preview and check your screens on a phone width before you say done.

## Rules (same as before, read AGENTS.md)

- Real data only. Never invent rounds, messages, scores, transcripts or edits attributed to real people. Empty states are fine.
- Only Vercel AI Gateway through `callCruxy` tiers (`small`, `strong`). No provider SDKs, no Anthropic.
- No middle dots and no em dashes anywhere in the UI. For an empty value, write "Not set" or leave it blank.
- New migration? Next free numbers: 00020 onward, one per agent, say which in your PR. Every new table: RLS on, `revoke all ... from anon, authenticated`. (K: **00022** transcript quality.)
- Tick an item only when the code is on your branch and you can name the file. Add `[path]` after the item.
- One PR per agent. Keep it green on CI.

## Who owns what

| Agent | Items |
| --- | --- |
| D (practice) | F-189, F-190, F-200, F-204, F-216, F-217, F-218, F-219, F-220, F-222, F-276, F-278, F-281 |
| C (case brain) | Judge card analysis: F-251, F-252, F-255, F-256, F-257, F-258, F-259, F-260, F-261, F-262, F-263, F-264, F-265 |
| G (admin) | Drills and scoring sheet: F-207, F-208, F-209, F-211, F-212, F-214, F-236 |
| K (data model) | F-002 to F-007 (tick each when its section's items are all ticked), F-378, transcript glossary F-226, F-228, F-229, F-230, F-231, talk analytics F-234 |
| F (revision, library) | F-078, F-081, F-085, F-086, F-092, F-129, F-130, F-131, F-132, F-134, F-135, F-138, F-139, F-140 |
| E (team space) | Roadmap stages and readiness: F-141, F-142, F-144, F-145, F-146, F-147, F-149 to F-156, F-158, F-159 |
| H (Cruxy's brain) | F-021 to F-026, F-093, F-096, F-099, F-101, F-102, F-105, F-106, F-107, F-333, F-357 |
| I (privacy) | F-386, F-389, F-390, F-392 |
| J (auth) | F-020 |

## Decisions already made for later (do not build yet)

- Score predictions before each practice round will be required for everyone.
- Claim robustness scores will be visible to all three teams.
