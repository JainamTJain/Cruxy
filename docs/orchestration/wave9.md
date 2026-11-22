# Wave 9: user-centred gaps

Jainam: "we are missing some user-centred features; account for everything and all aspects."

Wave 8 made each page clearer. Wave 9 covers what a real person needs across the whole season,
not just on one page. Each row below came from walking a journey as a specific person and asking
"where does this person get stuck, worried, left out, or have to leave Crux to finish the job?"

13 days to Dec 5. Everything that helps on competition day ships first in each row.

## The principle (Jainam, Nov 21)

With so few days left, people will prepare **alone and asynchronously**, not together. So every
feature is judged by: does it help one person, working alone at odd hours, make real progress in
the time they have? Group features (calendar, availability polls, kudos, workload) stay in the app
but quiet: no nav items, no big cards, one small "More team tools" link from the Team page.
Coordination happens through the work itself (Team Brief, async comments, handoff notes), not
through meetings.

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
| Staying informed | No shared calendar or availability poll (built, kept quiet: async matters more now) | E (done, tucked away) |
| Doing the work | No search across cases, library, chat and cards | F |
| Doing the work | Nothing works offline; UCSB wifi is unreliable | F |
| Doing the work | No live round timer with APPE timings; no phone "in the room" card | C |
| Getting better | No personal progress over time; no quick reflection after a round; no goals with Dr. B | D |
| Getting better | Kudos and workload (built, kept quiet) | E (done, tucked away) |
| Working alone | No single "my part" list: what I personally deliver on each case, done and left, minutes each | E |
| Working alone | No "I have 15 minutes" picker that builds a session from my part | E |
| Working alone | No solo mock round where Cruxy plays the other team, the moderator and the judges | E |
| Working alone | No async review: record my part, teammates and Dr. B leave timed comments whenever | E |
| Working alone | No handoff note when I stop, no "what changed on my case since I last looked" | E |
| Competition day | Round-day card + APPE timer first; logistics = one plain Dr. B page (carpool list, not sign-up) | C |
| Competition day | Real rounds logged: drawn case, opponent, moderator question, judge comments, scores, short debrief | C |
| Competition day | Nerves: no short calm routine before a round | J |
| After the regional | No retrospective, no season archive, no handoff for next year or Nationals | H |
| Trust | No page that shows what Crux stores about me, with download and delete | D |
| Trust | No "report a problem or suggest something" button; Jainam hears about bugs by text message | G |
| Access | No text size, contrast, dyslexia-friendly font; untested screen reader and keyboard paths; no "explain this term" | I |
| Coaching | Attendance exists but no "who is behind" view, nudge, or printable team report | K |

## Rows (one PR each, pull main first, green CI, 390px and 1280px shots)

| Agent | Row | Migration |
| --- | --- | --- |
| C | Competition day: round-day card and APPE timer first; real-round log; short debrief; logistics as one plain page | 00055 + 00065 |
| D | Personal growth and privacy: my progress, round reflection, goals with Dr. B, privacy centre | 00056 |
| E | Done (00057, kept quiet). Next: solo async prep: my part, minutes picker, solo mock round, async review, handoff notes | 00064 |
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

## C → H handoff: real-round log fields (for the retrospective)

Row C writes competition-day round logs into `competition_logs` (migration `00055` adds columns;
`00065` simplifies logistics to plain text lists). H should read these for the after-regional
retrospective. Empty logistics fields mean "Dr. B will add this" and are never invented.

| Field | Column | Meaning |
| --- | --- | --- |
| Competition | `competition_id` | Usually California Regional 2026-12-05 |
| Team | `team_id` | Which USC team logged the round |
| Round number | `round_number` | Prelims 1–3, then SF/F as numbered |
| Side | `side` | `presenting` or `commenting` |
| Case | `case_id`, `case_number` | Drawn case |
| Opponent school | `opponent` | As reported by the team |
| Moderator question | `moderator_question` | Also banked as `asked_at_round` / "Asked at UCSB" |
| Judges' questions | `judges_questions` | Optional free text |
| Judge comments | `judge_comments` | As reported |
| Scores | `score_us`, `score_them` | As reported |
| Result | `result` | `win` / `loss` / `tie` / `pending` |
| Debrief worked | `debrief_worked` | One thing that worked (between-round) |
| Debrief change | `debrief_change` | One thing to change (between-round) |
| Round card link | `day_round_id` | Optional link to `competition_day_rounds` |
| Who logged | `created_by`, `created_at` | Person and time |

Related tables for the day itself (not the retrospective core, but useful):

- `competition_day_logistics`: one plain page Dr. B fills (schedule, departure, meeting,
  dress, venue, rooms, packing list text, carpool list text). Empty = "Dr. B will add this".
- `competition_day_rounds`: round-day card (drawn case, side, speakers, key points, room)

No carpool sign-up system and no per-person packing ticks: carpool is a simple list field
on the logistics page. No new nav items for `/regional`; entry is a quiet link from Today.

Member hub: `/regional`. Tab order (solo-first): Round day → APPE timer → Real-round log →
Debrief → Day info. APPE timer phases (offline): presentation 10:00, conferral 1:00,
commentary 5:00, response 3:00, judges' questions 10:00 (from `docs/domain/ethics-bowl.md` ranges).
