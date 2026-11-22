# Wave 9: user-centred gaps

Jainam: "we are missing some user-centred features; account for everything and all aspects."

Wave 8 made each page clearer. Wave 9 covers what a real person needs across the whole season,
not just on one page. Each row below came from walking a journey as a specific person and asking
"where does this person get stuck, worried, left out, or have to leave Crux to finish the job?"

13 days to Dec 5. Everything that helps on competition day ships first in each row.

## Who we walked as

| Person | What they need most |
| --- | --- |
| New member, never seen Ethics Bowl | Understand the event, find their case, not feel lost |
| Returning member | Know what changed, do the next useful thing, see they are improving |
| Case lead | Keep the team's stance together, spread the work fairly |
| Dr. B (coach) | Who is here, who is behind, what to say in practice, one report |
| Jainam (tech admin and member) | Hear about problems before others do, keep data safe |
| Guest practice judge (alum or professor) | Judge a round from a phone with no account |
| Someone with access needs (low vision, dyslexia, screen reader, English as a second language) | Use every screen without friction |
| Anyone at UCSB on Dec 5 | Bad wifi, nerves, a tight schedule, a phone in hand |

## Journey gaps

| Stage | Gap today | Row |
| --- | --- | --- |
| Getting in | Forgot passcode means "Ask Jainam"; no list of signed-in devices | K |
| Getting in | No "what is Ethics Bowl in 90 seconds"; jargon on day one | G |
| Staying informed | Mentions and assignments only reach the in-app bell; nothing reaches a closed phone | J |
| Staying informed | No shared calendar of practices and deadlines; no way to say when you are free | E |
| Doing the work | No search across cases, library, chat and cards | F |
| Doing the work | Nothing works offline; UCSB wifi is unreliable | F |
| Doing the work | No live round timer with APPE timings; no phone "in the room" card | C |
| Getting better | No personal progress over time; no quick reflection after a round; no goals with Dr. B | D |
| Getting better | No kudos or peer notes; workload is invisible, so the same people carry everything | E |
| Competition day | No logistics hub: schedule, departure, carpool, dress, packing, rooms | C |
| Competition day | Real rounds are not logged: drawn case, opponent, moderator question, judge comments, scores | C |
| Competition day | Nerves: no short calm routine before a round | J |
| After the regional | No retrospective, no season archive, no handoff for next year or Nationals | H |
| Trust | No page that shows what Crux stores about me, with download and delete | D |
| Trust | No "report a problem or suggest something" button; Jainam hears about bugs by text message | G |
| Access | No text size, contrast, dyslexia-friendly font; untested screen reader and keyboard paths; no "explain this term" | I |
| Coaching | Attendance exists but no "who is behind" view, nudge, or printable team report | K |

## Rows (one PR each, pull main first, green CI, 390px and 1280px shots)

| Agent | Row | Migration |
| --- | --- | --- |
| C | Competition day: logistics hub, round-day mode, APPE timers, real-round log, between-round debrief | 00055 |
| D | Personal growth and privacy: my progress, round reflection, goals with Dr. B, privacy centre | 00056 |
| E | Team coordination: calendar with .ics, availability poll, kudos, workload balance | 00057 |
| F | Search and offline: one search box, installable app with offline case packets, print packet | 00058 |
| G | Help: Ethics Bowl in 90 seconds, glossary, help page, report a problem, what's new | 00059 |
| H | After the regional: results, retrospective, season archive, next-year and Nationals handoff | 00060 |
| I | Access: text size, contrast, readable font, screen reader and keyboard pass, explain-this-term | 00061 |
| J | Reach and calm: web push and email digest with per-kind settings and quiet hours, notifications page, pre-round calm routine | 00062 |
| K | Account and coaching: passcode reset with coach approval, devices, coach "who is behind" and team report, wiring check for all Wave 9 pieces | 00063 |

## Rules carried over

Real data only; never invent records about real people. Gateway only for AI. Deny-by-default RLS,
service role server-side. Secrets only in Vercel env (name any new env var in the PR so Jainam can
add it; features must degrade quietly without it). No em dashes or middle dots in copy. Follow
docs/design/writing.md. New pieces in new files where another row owns the page.

## Agreed field names: real-round log (C owns, H reads)

H reads `competition_logs` (and any Wave 9 C round-day writes into the same table). Do not rename
these columns without updating both rows:

| Field | Meaning |
| --- | --- |
| `id` | Round log id (cited from retro themes) |
| `competition_id` | Competition (e.g. California Regional) |
| `case_id`, `case_number` | Drawn / assigned case |
| `opponent` | Opposing school name |
| `moderator_question` | Moderator question text |
| `judges_questions` | Judges' questions (free text) |
| `judge_comments` | Judge comments (free text; H groups into themes) |
| `score_us`, `score_them` | Numeric scores |
| `result` | `win` / `loss` / `tie` / `pending` |
| `team_id` | USC team |
| `created_at`, `created_by` | Audit |

Team-level advancement and win/loss rollups for the hub live in H's `competition_team_results`
(migration `00060`), entered only by Dr. B or Jainam.
