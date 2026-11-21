# Feature checklist (generated from docs/spec.md)

Every line below is something Jainam asked for. An agent ticks a box only when the feature works end to end in the running app, and writes where it lives: `- [x] F-012 ... (src/app/(app)/case-brain/[caseId]/page.tsx)`. Never delete a line. If one cannot be done, leave it unticked and add `BLOCKED: reason`.


## How to build it

- [x] F-001 0. Foundation · Next.js app, Supabase project, schema, sign in, roles, design tokens, activity log · Who uses it, Sign in, Data model, Privacy · Cursor [`src/lib/db/supabase/foundation.ts`, `src/lib/db/repository.ts`]
- [ ] F-002 1. Library · Drive sync, digesting, search, reading room with highlights and comments · Library, Research · Cursor
- [ ] F-003 2. Case brain · Claim maps, Truth Sources, Inspired by Team X, consistency checks · Case brain · Cursor
- [ ] F-004 3. Revision · One pagers, flashcards, Socratic drills, moderator bank, roadmap · Revision, Moderator bank, Roadmap · Bolt for screens, Cursor for logic
- [ ] F-005 4. Team space · Assignments, leads, team chat, Cruxy assistant · Assignments · Bolt for screens, Cursor for logic
- [ ] F-006 5. Practice · Sessions, judging portal, recording, transcripts, grading, feedback · Sessions, Practice, Judging, Feedback · Cursor
- [ ] F-007 6. Admin · Admin and coach console, spend caps, weekly summary · Admin console, Cost plan · Bolt
- [ ] F-008 Read this whole doc before writing code; paste the relevant sections into each session.
- [ ] F-009 Every AI output stores the ids of the sources it used. No citation, no display.
- [ ] F-010 Every AI call goes through one server function that logs tokens and cost and refuses calls over the cap.
- [ ] F-011 Secrets live only in environment variables. Never paste passcodes or API keys into prompts or commit them.
- [ ] F-012 Each track ends with the checks listed in Paste-ready prompts.
- [ ] F-013 **Going fast.** Run the tracks as parallel agents (several Cursor windows or background agents, Bolt for screens built from the canvas), all sharing one types file and the schema from Track 0. Merge into main at least daily, and keep each track's checks green before merging. Cursor reads its context from the repo itself (AGENTS.md, .cursor/rules and docs/ in JainamTJain/Cruxy), so start each chat by mentioning AGENTS.md and the track's file in docs/tracks/, and update docs/spec.md there whenever this doc changes.

## Who uses it

- [x] F-014 Technical admin · Jainam · Everything below, plus everyone's passcodes (see and reset), spend caps, API keys, feeding books, the full activity log [`src/lib/auth/capabilities.ts`, `src/lib/admin/permissions.ts`, admin routes gated by `adminView`]
- [x] F-015 Coach admin · Dr. B · See everything, create and run sessions, take attendance, see session codes, add moderator questions, get the weekly summary if she agrees · Change passcodes or spend caps, feed books [`src/lib/auth/capabilities.ts`, `src/lib/admin/permissions.ts`]
- [x] F-016 Member · Team 1: Serena, Ivan, Ashton, Stolei, Tri. Team 2: Lehar, Camerin, Jade, Bethany, Quixote. Team 3: Nick, Daniel, Katie, Jainam · Everything for their own team; read, comment on and borrow from every other team · Edit another team's Truth Sources, see session codes [`canEditTruthSources`, `canSeeSessionCodes` in `src/lib/auth/capabilities.ts`]
- [x] F-017 Judge · Guests or members, per session · Score the session they were let into · See anything else [`assertJudgeSessionAccess` in `src/lib/auth/capabilities.ts`; portal UI owned by D]
- [x] F-018 Team membership is set only by admins and can change at any time; history keeps the old team on old records. [`setTeamMembership` in `src/lib/db/supabase/auth-extra.ts`, migration `00018_workstream_j_auth_attendance.sql`]
- [x] F-019 Jainam appears twice (technical admin and Team 3 member). His member view shows only what any member sees; the admin view is a separate switch. [`effectiveRole`, Admin switch in `src/components/app-shell.tsx`, `/api/auth/admin-view`]
- [ ] F-020 Leads, counter-arguers and supporters are case roles inside a team, set and changed by the team (see Assignments). Note: UI and APIs owned by Workstream E (`src/app/api/team/roles`).

## Cruxy

- [ ] F-021 **Cites or stays quiet.** Every claim it shows links to a source, a transcript timestamp or a Truth Source. If it has none, it says "I couldn't find a source for this."
- [ ] F-022 **Honest over pleasant.** It names weak arguments plainly and never flatters. Praise is specific ("your thesis came at 0:22, under the 30 second goal").
- [ ] F-023 **Builds your reasoning, doesn't replace it.** It asks before it tells; Socratic questions come first, model answers second and only on request.
- [ ] F-024 **Even-handed.** It argues every side of a case at full strength, keeps its own politics out, and flags when an example leans one way.
- [ ] F-025 **Shows where things came from.** Items carry a small origin tag: Cruxy, Dr. B, a team member, Inspired by Team 1, APPE, or the case set.
- [ ] F-026 **Short.** Answers fit on a phone screen unless the user asks for more.

## Cruxy's character, floating Cruxy and the lamp

- [x] F-027 **Asks first.** When someone asks for an answer, Cruxy first asks one question that moves their thinking ("What would the other side say?", "Which fact matters most here?", "Does that fit your principle in Case 12?"). It gives its full answer once the person has tried, asks a second time, or is short on time. [`src/lib/cruxy/character.ts`, `src/components/cruxy/cruxy-drawer.tsx`]
- [x] F-028 **Answers directly** when asking would only waste time: lookups ("where is this in the Drive?"), schedule and logistics, admin questions, and anything during a timed round. [`decideCharacterMode` in `src/lib/cruxy/character.ts`]
- [x] F-029 **Hints one at a time**, never the whole answer at once. [`hint` mode + bubble "One hint, please" in `floating-cruxy.tsx` / drawer]
- [ ] F-030 **Honest and kind.** Says when an argument is weak, never flatters, never pressures, and says plainly when it doesn't know. Note: prompt wording owned by Workstream H; J ships the shell that calls H.
- [ ] F-031 **Ethically careful.** Argues every side at full strength, keeps its own politics out, never shames a person, and never takes sides between the USC teams. Note: Workstream H prompts.
- [ ] F-032 **A learner.** Follows the reasoning standard and the improvement loop in Cruxy's agents, models and prompts. Note: Workstream H agents.
- [x] F-033 Cruxy floats above every page, on computers and phones, with a gentle bob (still for people who turn on reduced motion). [`src/components/cruxy/floating-cruxy.tsx`]
- [x] F-034 Drag it anywhere with a mouse, a finger or the arrow keys. Its spot is saved per person and device. On phones it snaps to the nearest edge so it never covers a button. [`floating-cruxy.tsx` + `/api/prefs/cruxy`]
- [x] F-035 Tap Cruxy to open the drawer with its current question. A short speech bubble shows one question at a time, with "One hint, please" and "Back to the lamp". [`floating-cruxy.tsx`, `cruxy-drawer.tsx`]
- [x] F-036 During recording and timed rounds Cruxy hides automatically and only the lamp stays. [`recordingOrTimed` in `cruxy-context.tsx`; D can also call `setRecordingOrTimed`]
- [x] F-037 A setting turns the floating figure off for a person; the lamp always stays. [`settings` + prefs + `hideFigure`]
- [x] F-038 The lamp sits at the bottom right of every page and is Cruxy's home. [`src/components/cruxy/cruxy-lamp.tsx`]
- [x] F-039 Cruxy goes to sleep in it when the person presses "Back to the lamp", drops Cruxy on the lamp, taps the lamp while Cruxy is awake, or does nothing for 5 minutes. It shows the sleepy pose for a moment, then disappears into the lamp, which shows "z z". [`cruxy-context.tsx` sleep paths]
- [x] F-040 Tap the lamp to call Cruxy. It comes back to its saved spot and opens with a question ("You called. What are you trying to figure out?"). [`wake()` in `cruxy-context.tsx`]
- [x] F-041 Asleep means quiet: no bubbles or pop ups. Reminders still go to the bell. [`guardedSetBubble` / drawer + `NotificationBell`]
- [x] F-042 Curious (default) · cruxy-curious.png · Asking a question [`mood-events.ts` `ask.question`]
- [x] F-043 Listening · cruxy-neutral.png · While the person types, speaks or records [`listen.typing` / `listen.recording`]
- [x] F-044 Hint · cruxy-winking.png · Giving one hint [`hint.given`]
- [x] F-045 Pleased · cruxy-happy.png · The person did better than their own past, or answered well [`feedback.improved` / `feedback.answered_well`]
- [x] F-046 Excited · cruxy-excited.png · A personal best, or the team signs off a new version [`personal_best` / `version.signed_off`]
- [x] F-047 Surprised · cruxy-surprised.png · A drift flag, a new source, or an unexpected judge comment [`drift.flagged` / `source.new` / `judge.unexpected`]
- [x] F-048 Sad · cruxy-sad.png · A round went worse than the person's own past; Cruxy then asks what they'd change [`feedback.worse` bubble]
- [x] F-049 Sleepy · cruxy-sleepy.png · Going back to the lamp [`sleep` event]
- [x] F-050 Fierce · cruxy-angry.png · Only while Cruxy plays the other team in practice; never aimed at a person [`opponent.active` for D to emit]

## Sign in, consent and attendance

- [x] F-051 Pick your name from a list grouped by team (admins add names; no self sign up). [`listPeoplePublic` Supabase path]
- [x] F-052 Enter your own 6 digit passcode on a keypad. The very first time, enter the shared member code (Dr. B: her starter code); after consent Crux asks you to choose your own passcode. An admin's passcode also opens the admin switch. [`passcode-rules` + auth_codes bootstrap]
- [x] F-053 Stay signed in for 30 days on that browser; resetting someone's passcode signs that person out everywhere. [`sessionVersion` on JWT + `bumpSessionVersion` in reset; `src/lib/auth/session.ts`]
- [x] F-054 5 wrong tries on one name locks it for 10 minutes and writes an activity log entry. [`attemptSignIn` + `activity_log`]
- [x] F-055 Store each personal passcode twice: an argon2 hash used to check sign in, and a copy encrypted (AES-GCM) with a key in the PASSCODE_VIEW_KEY environment variable, which only the technical admin's Passcodes panel can decrypt. Jainam's own admin passcode is set from an environment variable at deploy, is stored as a hash only, and is never shown anywhere. [`replacePersonalCode` Supabase]
- [x] F-056 Right after consent on the first sign in (Dr. B included), Crux asks the person to choose a 6 digit passcode and type it twice. [`mustChoosePasscode` after starter]
- [x] F-057 Refused: the shared member code, one digit repeated (111111), and straight runs (123456, 654321). [`src/lib/auth/passcode-shape.ts`, `choose-passcode/page.tsx`]
- [x] F-058 The screen says plainly, before they choose: "Jainam, as technical admin, can see your passcode so he can help if you forget it. Don't reuse a code you use anywhere else." [`src/app/choose-passcode/page.tsx`]
- [x] F-059 After that, the shared member code no longer signs that name in. People can change their passcode any time in Settings by entering the current one. [`attemptSignIn` + `changePersonalPasscode` + Settings]
- [x] F-060 Forgot it? The keypad shows "Forgot your passcode? Ask Jainam." He can tell them, or reset it, which gives them a new one-time code and asks them to choose again. [`src/app/sign-in/page.tsx`; reset via `resetPersonPasscode` + G Passcodes panel]
- [ ] F-061 In the admin console, a Passcodes panel lists everyone by team: passcode hidden as dots, when it was set, and last sign in. Note: panel UI owned by Workstream G; J owns reveal/reset helpers.
- [ ] F-062 Show reveals one passcode for 20 seconds. The first reveal in 10 minutes asks Jainam to re-enter his own passcode. Note: Workstream G UI.
- [x] F-063 Reset gives that person a new one-time code and signs them out everywhere. The panel also changes the shared starter code for new members. [`resetPersonPasscode` + `bumpSessionVersion`; starter rotate helper `updateSharedStarterHash` for G to wire]
- [ ] F-064 Every reveal and reset goes in the activity log. Dr. B and members can't open the panel, and Jainam's own passcode never appears in it. Note: Workstream G UI; tech-only gate in `requireTechAdmin`.
- [x] F-065 **Consent (first sign in only, re-shown if the wording changes)** [`CONSENT_VERSION` gate on sign-in]
- [x] F-066 One screen, plain words: what is recorded, when, why, who sees it, where it goes, how long it stays, and what Cruxy is. [`src/app/consent/page.tsx`]
- [x] F-067 Two choices: "I agree to be recorded in practice" or "Not now: text only". Agreeing includes a 20 second voice sample, recorded right there, so transcripts can label who spoke. [`consent/page.tsx` + `uploadVoiceSample`]
- [x] F-068 Text only members use everything except being recorded; a session that includes them shows a banner so the room knows. [`sessionHasTextOnlyMembers` in `src/lib/attendance`; D Session screen consumes `/api/attendance`]
- [x] F-069 Consent, the date and the wording version are stored; anyone can change it in Settings; withdrawing deletes their voice sample. [`saveConsent` + `updateConsentChoice` + Settings + `deleteVoiceSample`]
- [x] F-070 Dr. B's weekly summary email is a separate opt in on her first admin sign in. [`/api/auth/digest-opt-in` + prompt in `app-shell.tsx`]
- [x] F-071 Every session has an attendance list. Either admin can mark present, late or absent; members can tap "I'm here" on the session page. [`src/lib/attendance` + `/api/attendance`; Session UI owned by D]
- [x] F-072 During a recorded session Cruxy pre-fills attendance from matched voices and joined devices; an admin confirms with one tap. [`prefillFromJoins` / `prefillFromVoiceMatches` / `confirmAttendanceSuggestions`]
- [x] F-073 Solo practice logs the person automatically. Attendance feeds the roadmap and the weekly summary. [`logSoloAttendance` + `attendanceForWeeklySummary`]
- [x] F-074 In the app by default: a bell, the home screen and the roadmap. [`NotificationBell` in app shell; home/roadmap already exist]
- [x] F-075 By email only if a person adds an email address and turns email reminders on. No calendar connection. [`Settings` reminders + `/api/settings/reminders`]
- [x] F-076 A 10 minute checklist on first sign in: confirm your cases and roles, open one reading, review 5 flashcards, answer one question out loud, and see your roadmap. [`/checklist` + `src/lib/auth/first-run.ts`; choose-passcode routes there]
- [x] F-077 One champion per team, chosen by the team, gets nudges when teammates haven't finished the checklist. [`/api/auth/champion` + notifications]

## Library and Drive sync

- [ ] F-078 Jainam connects the Ethics Bowl Drive folder once (Google sign in for the Drive API, read only scope).
- [x] F-079 A nightly job and a "Sync now" button list every file in the folder tree, including Google Docs, PDFs, Sheets and Slides. [src/app/api/cron/drive-sync/route.ts, src/app/api/library/sync/route.ts]
- [x] F-080 Only new or changed files are processed (compare Drive's modified time and checksum); unchanged files cost nothing. [src/lib/library/sync.ts]
- [ ] F-081 Files added inside Crux (uploads, books) are also written back to a "Crux uploads" folder in the Drive, so the Drive stays the full archive.
- [x] F-082 Extract text: Docs and Slides via Drive export, PDFs via text extraction (scanned PDFs flagged for Jainam). [src/lib/library/drive.ts]
- [x] F-083 Sort: a small model tags each file with its cases (1, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, or "general"), its type (case set, practice transcript, team notes, rules, research, coach guidance) and a confidence score. Under 0.7 goes to a sorting queue for Jainam. [src/lib/library/digest.ts]
- [x] F-084 Split into passages of about 600 words with page or heading anchors, embed each, and store them for search. [src/lib/library/digest.ts]
- [ ] F-085 Extract from each file: ideas raised, who raised them, frameworks named, facts with sources, moderator style questions, and coach decisions. Ideas from practice transcripts become Truth Source proposals for the team that raised them.
- [ ] F-086 Write a 5 line file card: what it is, which case, what's new in it, open questions.
- [x] F-087 **Reading room** (any time except while you are in a live practice) [src/app/(app)/library/[fileId]/page.tsx]
- [x] F-088 Open any case or resource full screen, with the case set page and the file side by side. [src/app/(app)/library/[fileId]/page.tsx]
- [x] F-089 Highlight text and leave a comment; highlights and comments are visible to all three teams, with names and team colours. [src/app/(app)/library/[fileId]/page.tsx]
- [x] F-090 Ask Cruxy about a highlight: "explain this", "find a counterexample", "is this cited elsewhere in our Drive?" [src/app/api/library/ask/route.ts]
- [x] F-091 Turn a highlight into a flashcard or a Truth Source proposal in one tap. [src/app/api/library/highlight-actions/route.ts]
- [ ] F-092 Search across everything (passages, transcripts, Truth Sources, comments) with filters by case, team and type.

## Research

- [ ] F-093 **Nightly loop per case (batch mode, cheapest rates)**
- [ ] F-094 Gap check: compare the case's claim maps across all three teams with the case set. List supports with no backing, outside facts not yet verified, counterclaims with no answer, and moderator questions with no prepared answer.
- [ ] F-095 Search free sources for each gap (list in Stack): encyclopedias, academic indexes, court opinions, open books, recent news. Prefer the last 2 years for anything that changes; keep classics for frameworks.
- [ ] F-096 Read the best 3 to 5 results per gap in full, not snippets.
- [ ] F-097 Verify: every fact needs two independent sources or one primary source; mark single-source facts "needs check".
- [ ] F-098 Write each finding as one card: the point in under 40 words, why it matters to which claim, the exact quote location, and the link.
- [ ] F-099 Deduplicate against the library and against yesterday's findings.
- [ ] F-100 Post cards to each team's Truth Sources queue as proposals, tagged Cruxy research.
- [ ] F-101 Coverage is measured: each case shows a research map of every claim, support and counterclaim with a filled, thin or empty dot.
- [ ] F-102 Display is capped: a finding card is at most 40 words; the full source is one tap away.
- [ ] F-103 Stop rule: a gap closes once it has two verified sources; Cruxy stops searching it.
- [ ] F-104 When a gap points to a book the team doesn't own, Cruxy files a book request with the title, why it matters and the chapter.
- [ ] F-105 Only Jainam sees and handles book requests. He uploads the PDF, which goes to the Drive's Crux uploads folder and is digested like any file.
- [ ] F-106 Open books (public domain, open access) are fetched and digested automatically.
- [ ] F-107 **Copyright rule:** Cruxy stores passages for citation inside Crux, shows short quotes only, and paraphrases the rest.

## Case brain and Truth Sources

- [x] F-108 Case card: facts from the case set with page numbers, the crux, the trap, stakeholders, likely moderator questions. · [src/lib/seed/, supabase/seed/, src/lib/db/sample-store.ts]
- [x] F-109 Claim map: at least 2 claims, each with a logic line and 3 supports; each support with its backing (case fact, source, example or framework); at least 1 counterclaim with concede, distinguish and rebut. The same structure as the prep doc. · [src/lib/seed/build-content.ts, supabase/seed/02_claims.sql]
- [x] F-110 Truth Sources: every fact, quote, example and framework the team has accepted, each linked to its passage, timestamp or page. · [src/lib/seed/build-content.ts, supabase/seed/03_truth_items.sql]
- [x] F-111 Case roles: Lead 1, Lead 2, counter-arguer, supporter, shown at the top and editable by any team member (see Assignments). · [src/lib/seed/build-content.ts, supabase/seed/06_flashcards_roles_proposals.sql]
- [x] F-112 **Likely opposing positions.** For each case, Cruxy builds the 3 or 4 positions other universities are most likely to present, each with its strongest support, its weak point, and two commentary angles. Teams add positions they hear at competitions. This is what the commenter prepares from. · [src/lib/seed/build-content.ts, supabase/seed/05_opposing_and_one_pagers.sql]
- [x] F-113 Proposals come from four places: practice transcripts, research, the reading room, and other teams' edits ("Inspired by Team 1"). · [src/lib/seed/build-content.ts (Inspired by Team 3 proposals)]
- [ ] F-114 Each proposal shows the idea, its origin tag, its source, and a one line Cruxy note only when there's a problem (unverified, contradicts a Truth Source, weak support). No note means it passed the acceptable, relevant, sufficient check.
- [ ] F-115 A member decides with ✅, ❌ or edit, and must write a reason (one line minimum). Decisions are by anyone on the team.
- [ ] F-116 Every team sees every other team's decisions and reasons next to the same idea, so disagreements are visible and useful.
- [ ] F-117 Full history per item: who proposed, who decided, when, why, and every edit. Anything can be reopened.
- [ ] F-118 **Socratic before borrowing.** Before a team decides on an "Inspired by Team N" proposal, Cruxy asks one question first ("Does this fit your Claim 2, or does it pull against your principle in Case 12?"), so teams think it through rather than copy.
- [ ] F-119 A robustness bar per claim: supports backed, counterclaims answered, moderator questions answered, unverified facts open.
- [ ] F-120 Consistency check across cases: Cruxy flags when a team's principle in one case clashes with another case (for example, least restrictive tool in Case 12 versus Case 13), using the cross-case principles table.
- [ ] F-121 Change the facts check: Cruxy lists the single facts that, if changed, would flip each claim, so the team prepares those answers.

## Revision

- [x] F-122 Cruxy drafts each team's one pager per case from its claim map, in the 2 claims, 3 supports, counterclaim format. The team edits it; Cruxy only re-drafts on request. · [src/lib/seed/build-content.ts, supabase/seed/05_opposing_and_one_pagers.sql]
- [ ] F-123 Shown as a printable page and exported to the Drive as a Google Doc and PDF.
- [ ] F-124 A diff view shows what changed since the last version and who changed it.
- [ ] F-125 **Visual one pagers.** One pagers are built to be seen, not just read: the claim map as connected boxes, a values-in-tension scale, a stakeholder grid, a timeline of the case facts, a framework strip with one line each, and a table of likely questions with our one line answers. Cruxy picks the visual for each part and the team edits it. There is no limit on how much Cruxy drafts; the team signs it off.
- [x] F-126 Generated from readings, Truth Sources and the case card: facts with page numbers, claims and their logic lines, frameworks in one sentence, counterclaim responses, and change the facts answers. · [src/lib/seed/build-content.ts, supabase/seed/06_flashcards_roles_proposals.sql]
- [x] F-127 Assigned by role: leads get their cases' decks automatically. Anyone else can add any deck, and their profile shows "studying Case 9 (not assigned)". · [src/lib/seed/build-content.ts deck_opt_ins for leads]
- [x] F-128 Spaced repetition: cards come back sooner when missed (SM-2 or FSRS scheduling), and answers can be typed or spoken. [src/lib/revision/fsrs.ts]
- [ ] F-129 Cruxy asks one question at a time aimed at the weakest link in the claim map, then follows up on the answer ("why does that follow?", "what would your opponent say?").
- [ ] F-130 Ends with a 3 line summary of what held and what didn't, linked to the claim map.
- [ ] F-131 For each claim, Cruxy suggests: a plain sentence version under 25 words, 2 everyday analogies, 1 vivid example from the Truth Sources, and phrases to avoid (jargon, hedges, loaded words).
- [ ] F-132 Members save their favourite phrasings to their personal phrasebook.
- [x] F-133 A 10 minute warm up for the morning of a round: 5 flashcards, 2 moderator questions answered out loud, 1 counterclaim rebuttal, on cases picked at random. [src/app/(app)/revision/warmup/page.tsx]

## Moderator question bank

- [ ] F-134 **Dr. B adds freely.** She can paste unstructured text (an email, a list, a voice note transcript); Cruxy splits it into single questions, tags each with its case, type and difficulty, and shows the result for her to confirm.
- [ ] F-135 **Cruxy adds** using the five question types judges are trained to ask: follow ups on skipped issues, pushback on our own view, the other team's points re-asked, change the facts hypotheticals, and "state your view and main reasons". It also writes the case's own closing question in several wordings.
- [x] F-136 **Members add** questions they heard or imagined; real regional questions get the tag "Asked at UCSB" afterwards. · [src/lib/seed/build-content.ts questions origin member]
- [x] F-137 **Difficulty** 1 to 3, set by Cruxy and corrected by how people actually score on it. · [src/lib/seed/build-content.ts difficulty 1–3]
- [ ] F-138 **Random serve** in drills and practice: weighted toward unseen questions, questions you scored low on, and your cases; never the same question twice in a session.
- [ ] F-139 **Answer log:** every answer (spoken or typed) is kept with its score and feedback, so the bank shows each question's best team answer, linked to its timestamp.
- [ ] F-140 **Robustness meter per case:** share of bank questions each member now answers better than their own first attempt, per team.

## Personal roadmap and deadlines

- [ ] F-141 Read · Case set page and every file Cruxy tagged "core" opened for at least 60% of reading time · Everyone, all 12 cases
- [ ] F-142 Map · Person has contributed to or reviewed every claim on their team's map · Leads, counter-arguer
- [ ] F-143 One pager · Team one pager has no empty rows and the person has signed it off · Leads, supporter
- [ ] F-144 Flashcards · 90% of the case deck recalled correctly twice · Leads; anyone who opts in
- [ ] F-145 Question drill · 10 bank questions answered, with your average above your own first attempts on this case · Leads, counter-arguer
- [ ] F-146 Practiced · Spoke in at least one recorded round on the case · Everyone with a role on it
- [ ] F-147 Judged · Judged at least twice (human or Cruxy judge), with your latest score above your own earlier one on this case · Leads
- [x] F-148 **No fixed score cutoffs anywhere in Crux.** Every threshold compares a person with their own past (their first attempt, recent average or best), never with a set number or with other people. Judges still score on the APPE 1 to 10 scale, because that is how the regional is scored; progress, stages and "weak" flags are always measured as change from the person's own history. [src/lib/revision/roadmap.ts]
- [ ] F-149 **Recommended deadlines (default for the December 5 regional; each team can edit theirs)**
- [ ] F-150 Read all 12 cases · Nov 24
- [ ] F-151 Map own cases · Nov 25
- [ ] F-152 One pagers · Nov 28
- [ ] F-153 Flashcards · Dec 2
- [ ] F-154 Question drill · Dec 2
- [ ] F-155 Practiced · Dec 3
- [ ] F-156 Judged · Dec 4
- [x] F-157 A track per case with seven stations, a "today" line and a flag on each deadline; stations fill as work happens, and overdue ones turn red. [src/app/(app)/revision/roadmap/page.tsx]
- [ ] F-158 A readiness number per case (share of required stages done, weighted toward judged and practiced) and per team.
- [ ] F-159 "Do next": the three most useful actions for this person today, picked from overdue stages, weak feedback areas, and assignments.

## Assignments, team chat and the Cruxy assistant

- [ ] F-160 An Assign button on every case, flashcard deck, one pager, reading and practice slot. Pick a person (or several), a role or task, and an optional due date.
- [ ] F-161 Case roles (Lead 1, Lead 2, counter-arguer, supporter) are set per team per case; any team member can change them, in two taps, from the case brain or the team board. The change is logged and announced in team chat.
- [ ] F-162 Everything assigned appears on the person's profile and roadmap, with who assigned it.
- [ ] F-163 A team board shows the 12 cases by role and person, so gaps (a case with no lead) are visible at a glance.
- [ ] F-164 One channel per team plus one all-program channel; every channel is readable by everyone; posting is for members of that team (admins can post anywhere).
- [ ] F-165 Messages can mention people, link a case, a passage, a timestamp or a Truth Source.
- [ ] F-166 Chat does not create tasks by itself; assignments stay explicit.
- [ ] F-167 **One current position per case.** The claim map is versioned (v1, v2, ...). Any change to a claim, logic line or counterclaim response creates a new version with a one line "what changed and why", written by whoever changed it.
- [ ] F-168 **Changes reach everyone.** A new version posts to team chat and to each member's home screen as a short diff (old wording struck through, new wording shown).
- [ ] F-169 **Read and confirm.** Each member taps "I've got v7" after reading the diff. The case board shows who is still on an older version; a session start warns the admin if anyone in that round hasn't confirmed.
- [ ] F-170 **Alignment check.** After a change, Cruxy asks each member 2 or 3 quick questions ("What is our Claim 2 now?", "How do we answer Waldron?"). Answers that drift from the current version are flagged to that person and the leads, privately at first.
- [ ] F-171 **Drift in practice.** In transcripts, Cruxy flags lines where someone argues an older version or contradicts the current one ("Katie used the v5 wording of C2 at 12:40"), and links the current wording.
- [ ] F-172 **State of the case, out loud.** Every team session can open with a 2 minute read-aloud of the current one pager by the supporter, so the room starts from the same version.
- [ ] F-173 **Bigger changes need two people.** Changing a claim itself (not its supports) needs the lead plus one more team member to accept, so a position never shifts on one person's say-so.
- [ ] F-174 **Cruxy assistant (drawer on every page)**
- [ ] F-175 Knows where you are (case, page, highlight) and answers from your team's Truth Sources first, then the library, then the web, citing each.
- [ ] F-176 Can: explain a passage, quiz you, find a source, draft a one pager row for your review, summarize what changed since your last visit, and tell you what to do next.
- [ ] F-177 Won't: decide Truth Sources, change roles, or speak for the team.
- [ ] F-178 Follows the Cruxy rules (cites, honest, even-handed, short) and has its own mark and colour so it is recognizable.
- [ ] F-179 **What's happening where:** "What did the teams do this week?", "Which sessions ran today and who came?", "What changed in Case 12 since Monday?"
- [ ] F-180 **Who is prepared:** "Who is ready to lead Case 9?", "Who hasn't practised Case 5?", "Who is behind their roadmap?" Readiness here means progress against each person's own path and history, not a fixed bar.
- [ ] F-181 **Which team needs help:** "Which team is weakest on Case 13, and why?", "Where do the teams disagree?", "Which cases have no counterclaim answered?" Cruxy names the gap, the people involved and one suggested next step (a session, a drill or a pairing).
- [ ] F-182 **Before a competition:** "Give me a readiness brief for Dec 5" returns a one page summary by team and case, with risks first.
- [ ] F-183 It answers only from Crux's own records (roadmaps, attendance, scores, Truth Sources, chat), shows the numbers it used, and says when data is missing. Members can't use this mode.

## Sessions

- [ ] F-184 Date, time, place or online.
- [ ] F-185 The day's split: one or more rounds, each with a case, the teams in it, who presents and who comments, and timings (defaults follow the regional rules: presentation 7 to 12 minutes, commentary 5 to 8, Q&A 10 to 15; edit per round).
- [ ] F-186 Who moderates: a person (named) or the Cruxy moderator.
- [ ] F-187 Who judges: any number of human judges, the Cruxy judge, or both. When no human judge is present, Cruxy judges every team in the round.
- [ ] F-188 Crux creates a session code. Only admins see it.
- [ ] F-189 Members see today's sessions on their home screen and tap Join; Crux sends them to the presenter, commenter, observer or moderator screen for their round.
- [ ] F-190 Online members join from a link and record from their own device.
- [ ] F-191 The admin's session screen shows who joined, attendance, the round clock, and a "Next round" button.
- [ ] F-192 **Judging portal (replaces the QR-only flow)**
- [ ] F-193 When a round starts, Crux asks the admin: who is judging? In person, Cruxy judge, or both.
- [ ] F-194 In person, then: someone already in Crux, or someone new?
- [ ] F-195 Someone in Crux (a member or a returning judge) opens the Judging portal, enters the session code the admin reads to them, and lands on the scoring card for that round.
- [ ] F-196 Someone new scans a QR code on the admin's screen, types their name and judging background, and lands on the same scoring card. No account needed.
- [ ] F-197 Behind the scenes both paths attach the card to the right session, round and teams; the admin sees each judge's card arrive.
- [ ] F-198 **Practice outside admin sessions (no admin needed)**
- [ ] F-199 Any member can start a practice from the Practice page at any time: solo, with their own team, or with another team.
- [ ] F-200 Invite another team (or named people from it); they get a notice on their home screen and accept in one tap. Online members join from a link.
- [ ] F-201 The starter picks the case, mode and timings, and who moderates and judges: a member from any team through the Judging portal, the Cruxy moderator, the Cruxy opponent team, the Cruxy judge, or none.
- [ ] F-202 Attendance is logged from who joined; no admin confirmation is needed.
- [ ] F-203 Recordings, transcripts, reports, redos, Truth Source proposals and roadmap progress work exactly as in admin sessions.
- [ ] F-204 Admins see these practices on the program map and in the activity log, but they don't have to set them up or approve them.

## Practice and recording

- [ ] F-205 Mode · What happens · Who plays the other side
- [ ] F-206 Full round · Presentation, commentary, response, judges' Q&A, timed to the round's settings · Another team, or Cruxy as the other team
- [ ] F-207 Moderator drill · Random bank questions read aloud; answer out loud within a set time · Cruxy moderator
- [ ] F-208 Commentary drill · Cruxy presents a case position for 7 to 12 minutes; you deliver commentary on it · Cruxy as the presenting team
- [ ] F-209 Judges' Q&A drill · Rapid follow ups, pushback and change the facts questions on your own claims · Cruxy judge panel
- [ ] F-210 Solo speech · Deliver your part (a claim, the intro, the counterclaim) and get it scored · None
- [ ] F-211 Free record · Record any discussion; Cruxy pulls out ideas for Truth Sources · None
- [ ] F-212 **Conferral drill:** an unseen question, 60 seconds to confer with scratch paper only (as the rules allow), then answer. Crux times it and checks who spoke.
- [ ] F-213 **Thesis in 30 seconds:** a fresh wording of a case question; answer in one sentence. Times are tracked against your own past times.
- [ ] F-214 **Q&A routing:** each team sets who takes which kind of judge question (facts, framework pushback, change the facts, practical). Reports check whether the right person answered.
- [ ] F-215 Every screen works on a phone browser; Crux can be added to the home screen like an app.
- [ ] F-216 Recording is tested on iPhone Safari and Android Chrome before release.
- [ ] F-217 Captions: live captions during practice, and everything Cruxy says aloud also appears as text.
- [ ] F-218 One device in the room: one microphone; speakers labelled from voice samples and round roles; an admin confirms labels on one screen after.
- [ ] F-219 Everyone on their own device: each device records its owner, so labels are exact; best for online sessions.
- [ ] F-220 Mixed is allowed; Crux lines recordings up by timestamps.
- [ ] F-221 Browser records in 30 second chunks and uploads each chunk as it goes, so a crash loses at most 30 seconds.
- [ ] F-222 Optional free live captions in Chrome from the browser's speech recognition (rough, on screen only).
- [ ] F-223 At the end, the full audio goes to the transcription service with speaker labels and word timestamps.
- [ ] F-224 Speakers are matched to people; the transcript is stored with every line timestamped.
- [ ] F-225 The audio file is deleted immediately after the transcript is saved. Only text remains.
- [ ] F-226 A glossary is built automatically per case from the case set, the Drive and the Truth Sources: philosophers, court cases, laws, organisations, places, coined terms (Nozick, Brandenburg, Kalshi, NAGPRA, looksmaxxing), plus every member's name and team names.
- [ ] F-227 Each round sends that case's glossary and the names of the people present to the transcription service as key terms.
- [ ] F-228 A correction pass then fixes glossary words from context, marks every correction, and flags uncertain words for a quick check. It never changes meaning.
- [ ] F-229 When anyone fixes a word in a transcript, the correct term and the misheard form are added to the glossary, so the next transcript gets it right.
- [ ] F-230 Unusual names get a pronunciation note taken from each person's voice sample.
- [ ] F-231 Quality check: Jainam sees an accuracy estimate on glossary terms per round, and a short test clip per case is re-run whenever the glossary changes.
- [ ] F-232 Phase strip with the round clock; a hard stop at time ("that's time"), as at the regional.
- [ ] F-233 A red recording bar on every participant's screen while recording.
- [ ] F-234 Talk analytics per person: talk time, words per minute, filler words, time to first answer, and interruptions.

## Judging and calibration

- [x] F-235 **The scoring card: a copy of the one in your Drive (same for humans and Cruxy)** · [src/lib/seed/scoring-card.ts, supabase/migrations/00009_workstream_b_content.sql]
- [ ] F-236 **Built from the Drive.** The Librarian reads the APPE IEB Fillable Scoring Sheet (August 2020) in the Drive's Training Documents folder and builds the card from it: the same items, the same question wording, the same order, the same 1 to 10 scales and the same totals. The score bands and the Guide to Scoring from the same folder sit beside the card as a judge's guide. If a newer sheet appears in the Drive, Crux shows Jainam the differences and switches after he confirms.
- [ ] F-237 **Laid out like the paper sheet.** One card per judge per round, with a column for each team, so the judge scores both teams side by side, as on the original:
- [x] F-238 Presentation A · Was the presentation clear and systematic? · 1 to 10 · 1 to 10 · [src/lib/seed/scoring-card.ts]
- [ ] F-239 Presentation B · Did the presentation clearly identify and thoroughly discuss the central moral dimensions of the case? · 1 to 10 · 1 to 10
- [ ] F-240 Presentation C · Did the presentation show awareness of and thoughtful consideration for different viewpoints, especially those that would weigh heavily for those who disagree? · 1 to 10 · 1 to 10
- [ ] F-241 Presentation total · A + B + C · 3 to 30 · 3 to 30
- [ ] F-242 Commentary · The team's commentary on the other team's presentation · 1 to 10 · 1 to 10
- [ ] F-243 Response to commentary · The team's response to the other team's commentary · 1 to 10 · 1 to 10
- [ ] F-244 Response to judges · The team's answers to the judges' questions · 1 to 10 · 1 to 10
- [ ] F-245 Team total · All of the above · up to 60 · up to 60
- [ ] F-246 **Spirit points (1 to 5)** go on a separate feedback sheet, as in the APPE materials, with its own comment box.
- [ ] F-247 **Comments and moments.** A comment box per item and an overall comment, as on the sheet; humans can also tap "mark this moment", which pins a note to the transcript time.
- [ ] F-248 **Rounds with one presenting team** (solo or a team against Cruxy) show only the columns and items that apply, with the rest marked "not scored this round".
- [ ] F-249 **The Cruxy judge fills the identical card**, adding 1 to 3 quoted lines as evidence for each score.
- [ ] F-250 Scores every item with 1 to 3 quoted lines and their timestamps as evidence; any score without evidence is not shown.
- [ ] F-251 Asks judges' Q&A questions out loud in Cruxy judge mode, one question and one follow up per judge seat, as the rules describe.
- [ ] F-252 Before any human cards exist, it is grounded in the APPE Guide to Scoring, the score bands, the judges' question guide, your Nationals notes and Dr. B's practice guidance from the Drive.
- [ ] F-253 **Peer judging of recordings.** Any member can judge another team's recorded round later, on the same card, from its transcript. Peer cards count as judged rounds for the speakers and go through the same analysis before they tune Cruxy.
- [ ] F-254 **Predict your score first.** Before a speaker opens their report, they guess their own score on each item. The gap between guess and score is tracked over time as a skill of its own.
- [ ] F-255 **No fixed weights.** A judge's background (past APPE judge, faculty, debater, team member) is only a starting guess, and each card's influence is decided afresh from evidence.
- [ ] F-256 **Analyse the card first.** Before using a card, Cruxy checks it against the transcript and writes a short note:
- [ ] F-257 **Evidence:** do the judge's comments point to things that were actually said, and do the scores match the comments?
- [ ] F-258 **Position lean:** do scores follow whether the judge agrees with a team's conclusion rather than the quality of its reasoning? Judges are told to separate the two, so Cruxy compares scores with how each side's reasoning held up.
- [ ] F-259 **Drift:** does this judge score harsher or kinder as the session goes on, late at night, or after a long day? Cruxy compares rounds within the session and with the judge's earlier cards.
- [ ] F-260 **Agreement:** where there are other judges, how far apart are they, and on which items?
- [ ] F-261 **Conflicts:** is the judge a member of a competing team, or have they argued a side of this case themselves?
- [ ] F-262 **Decide what to learn.** Each item on the card is then used fully, used with less influence, or kept as feedback for the speakers only and left out of calibration, with the reason recorded.
- [ ] F-263 **Update slowly.** Cruxy's correction for each scoring item moves only when several analysed cards agree, so one unusual round can't swing it.
- [ ] F-264 **Worked examples.** Rounds whose cards passed the analysis well become worked examples the Cruxy judge reads before scoring similar rounds.
- [ ] F-265 **Who sees what.** Members see scores and reasons only. The technical admin sees each card's analysis note, what was used and why, and can override a decision.

## Feedback reports and the bank

- [ ] F-266 **Headline:** the round's result and the single biggest fix, in one sentence.
- [ ] F-267 **Scorecard:** each item with Cruxy's score and every human judge's score side by side, and one line of reasoning per item linked to its timestamp.
- [ ] F-268 **Each person, in their own section** (visible to everyone):
- [ ] F-269 What worked: one or two quoted moments and why they scored.
- [ ] F-270 The one thing to fix: the quote and timestamp; the scoring item it cost; why, in two or three sentences of reasoning a judge would recognise; and what the audience likely heard.
- [ ] F-271 The better version: the same moment rewritten in their own style, under 40 words.
- [ ] F-272 Redo now: a 60 to 90 second re-take of that moment, recorded on the spot and re-scored. It stays open until it scores higher, and it returns in their drills over the next week.
- [ ] F-273 Talk analytics: talk time, pace, filler words, time to first answer.
- [ ] F-274 **Transcript:** full, speaker labelled, with every feedback point pinned to its line.
- [ ] F-275 **Socratic follow ups:** two or three questions to answer before the next round.
- [ ] F-276 **New ideas:** ideas raised in the round, already sent to the team's Truth Sources queue.
- [ ] F-277 Each person has a skills chart (answer first, explain frameworks, engage objections, stay under time, commentary focus) that updates after every scored redo and round.
- [ ] F-278 A skill that doesn't improve on the person's own recent average for two rounds becomes a roadmap task with a specific drill.
- [ ] F-279 Cruxy proposes a bank entry when the same issue appears in two or more rounds, or a human judge writes it; an admin or any member adds it with one tap.
- [ ] F-280 Every entry has: the lesson in one line; a vivid real example (quoted line, speaker, team, case, timestamp); why it cost points (the scoring item and any judge comment); the improved version; a linked drill to practise it; and how often it has been seen.
- [ ] F-281 Members can mark "I do this" to add the drill to their own roadmap.

## Program map, admin console and weekly summary

- [x] F-282 **Program map (everyone's launch screen)** [src/app/(app)/home/page.tsx]
- [x] F-283 A 12 case by 3 team grid: each cell shows readiness, the case's leads, and the latest event ("Team 2 graded 41/60 yesterday"). [src/app/(app)/home/page.tsx]
- [x] F-284 Running totals that grow: Drive files digested, passages cited, ideas accepted, sources verified, questions in the bank, rounds graded, redo improvements. [src/app/(app)/home/page.tsx]
- [x] F-285 What changed since your last visit, across all teams, newest first. [src/app/(app)/home/page.tsx]
- [x] F-286 Days to the next competition, and your own top three next actions. [src/app/(app)/home/page.tsx]
- [ ] F-287 Area · Jainam · Dr. B
- [ ] F-288 Teams and people: add, move, remove · Yes · Yes
- [ ] F-289 Sessions: create, run, see codes, take attendance · Yes · Yes
- [ ] F-290 Moderator questions: add, edit · Yes · Yes
- [ ] F-291 Consent status per person · Yes · Yes
- [ ] F-292 Program analytics: readiness, attendance, score trends per person and team · Yes · Yes
- [ ] F-293 Passcodes (Jainam only): see or reset anyone's passcode, change the shared starter code · Yes · No
- [ ] F-294 Spend: caps, ledger by feature, pause research · Yes · No
- [ ] F-295 Book requests and the Drive sorting queue · Yes · No
- [ ] F-296 Calibration view: judge weights, Cruxy score gaps · Yes · No
- [ ] F-297 Activity log: every sign in, edit, decision, recording, failed passcode · Yes · Read only
- [ ] F-298 **Weekly summary for Dr. B (Sunday 6 pm, only if she opted in)**
- [ ] F-299 One email: attendance by person, rounds and scores by team, biggest improvements, cases at risk (low readiness near a deadline), open disagreements between teams' Truth Sources, and Things to take care of added that week.
- [ ] F-300 Each line links into Crux. Jainam gets the same email plus spend and errors.
- [ ] F-301 Use against improvement: do people who drill, redo and read more improve faster on their own scores?
- [ ] F-302 Which features are used, by whom, and which are ignored; which Cruxy outputs are marked useful.
- [ ] F-303 Shown only on Jainam's portal.
- [ ] F-304 During and after each competition, a quick log per round: case, opponent, moderator question, judges' questions, judge comments, scores and result. Real questions enter the bank tagged "Asked at UCSB".
- [ ] F-305 Season rollover: archive the season to the Drive, import the next case set, add or move members, reset roles and roadmaps, and keep the Things to take care of bank, Cruxy's example library and the glossary.

## Data model

- [ ] F-306 people · name, team_id, role (member, coach_admin, tech_admin), consent_version, consent_at, recording_ok, voice_sample_path, digest_opt_in · Team history kept in team_memberships
- [ ] F-307 teams, team_memberships · name, colour; person_id, team_id, from, to
- [x] F-308 auth_codes · kind (starter, personal, admin), person_id, hash, encrypted_copy (personal only), must_choose (bool), set_at, last_revealed_at · Hash to check; encrypted copy only for the technical admin to view; Jainam's own is hash only [`bootstrapAuthCodes` + repository]
- [ ] F-309 competitions · name, date, place, timings · Drives deadlines and round defaults
- [x] F-310 cases · number, title, case_set_page, crux, trap, closing_question, active · Cases 2, 6, 8 inactive for California · [supabase/seed.sql, src/lib/seed/build-content.ts]
- [ ] F-311 files · drive_id, path, mime, modified_at, checksum, case_ids\[\], type, confidence, card · One row per Drive file version
- [ ] F-312 passages · file_id, anchor (page or heading), text, embedding vector · Search and citations
- [ ] F-313 highlights, comments · passage_id, range, person_id, body, thread_id · Reading room, visible to all
- [x] F-314 claims, supports, backings, counterclaims · team_id, case_id, text, logic_line, order, citation_ids\[\] · The claim map · [supabase/seed/02_claims.sql]
- [x] F-315 truth_items · team_id, case_id, kind (fact, quote, example, framework), text, citation_ids\[\], status · Accepted items · [supabase/seed/03_truth_items.sql]
- [ ] F-316 proposals · team_id, case_id, origin (transcript, research, reading, inspired_by_team), origin_ref, text, cruxy_note, status · Queue items
- [ ] F-317 decisions · proposal_id, person_id, verdict (accept, reject, edit), reason (required), edited_text · Visible to all teams
- [ ] F-318 case_roles, assignments · team_id, case_id, person_id, role; task, due, assigned_by, status
- [x] F-319 one_pagers, flashcards, card_reviews · team_id, case_id, version, body; deck, front, back, citation_ids\[\]; person_id, card_id, grade, next_due · Spaced repetition · [supabase/seed/05_opposing_and_one_pagers.sql, 06_flashcards_roles_proposals.sql]
- [ ] F-320 questions, answers · case_id, text, type, difficulty, origin (dr_b, cruxy, member, asked_at_round); question_id, person_id, transcript_ref, score, feedback · Moderator bank
- [ ] F-321 sessions, rounds · date, place, online, code_hash, created_by; session_id, case_id, teams, sides, moderator, judges, timings · Codes hashed, shown to admins only
- [ ] F-322 attendance · session_id, person_id, status, source (admin, self, voice)
- [ ] F-323 recordings · round_id, chunk_paths\[\], status, deleted_at · Rows stay, audio deleted
- [ ] F-324 transcript_lines · round_id, start_ms, end_ms, speaker_person_id, text · Every citation into practice points here
- [ ] F-325 judges, judge_cards, card_scores · name, background, weight; round_id, judge_id or cruxy, team_id; item, score, comment, evidence_line_ids\[\]
- [ ] F-326 feedback_items, redos · round_id, person_id, kind, quote_line_id, reasoning, better_version; feedback_item_id, transcript_ref, score_before, score_after
- [ ] F-327 bank_entries · lesson, example_line_id, why, improved, drill_id, seen_count · Things to take care of
- [ ] F-328 roadmap_stages · person_id, case_id, stage, required, due, done_at
- [ ] F-329 chats, messages · channel (team or program), person_id or cruxy, body, refs\[\]
- [ ] F-330 research_runs, book_requests · case_id, gaps\[\], findings\[\]; title, reason, chapter, status · Book requests visible to Jainam only
- [ ] F-331 ai_calls · feature, model, tokens_in, tokens_out, cost_usd, person_id · The cost ledger
- [ ] F-332 activity_log · person_id, action, target, ip_hash, at · Admin view

## Cruxy's agents, models and prompts

- [ ] F-333 Agent · Job · Model tier · Runs
- [ ] F-334 Librarian · Sort files, split passages, write file cards, extract ideas · Small · On sync, batch
- [ ] F-335 Researcher · Find gaps, search, read, verify, write finding cards · Small for search and reading, strong for verification · Nightly, batch
- [ ] F-336 Analyst · Check proposals (acceptable, relevant, sufficient), consistency across cases, change the facts list · Strong · On each proposal
- [ ] F-337 Coach · One pagers, flashcards, Socratic drills, language and analogies · Small for cards, strong for Socratic · On demand
- [ ] F-338 Moderator · Pick and phrase bank questions, write new ones · Small · On demand, nightly
- [ ] F-339 Opponent · Write and read the other team's presentation or commentary · Strong · Practice
- [ ] F-340 Judge · Score cards with evidence, ask Q&A questions, write reports and redos · Strong · After each round
- [ ] F-341 Assistant · The chat drawer · Small by default, strong when asked to reason · On demand
- [ ] F-342 **Model routing.** Call every model through one gateway (the Vercel AI SDK with AI Gateway, or OpenRouter) so models can be swapped from an admin setting without code changes. Use paid tiers that don't train on your data for anything containing transcripts.
- [ ] F-343 **Context packing (the main cost and quality lever)**
- [ ] F-344 Never send the whole library. Each call gets: the Cruxy rules, the case card, the relevant claim map nodes, and the top 8 to 12 passages by search, about 6,000 to 12,000 tokens.
- [ ] F-345 The Cruxy rules and case card are a fixed prefix, so prompt caching applies.
- [ ] F-346 Transcripts are sent whole only to the Judge, once per round.
- [ ] F-347 Every agent returns JSON in a fixed schema; every claim carries citation ids (passage, transcript line or truth item).
- [ ] F-348 The server checks that each id exists and that a quoted string appears in the cited text; anything failing is dropped and logged.
- [ ] F-349 **Shared system prompt (start of every call)**
- [ ] F-350 **The reasoning standard (taught to every agent)**
- [ ] F-351 **Logical structure:** claim → logic line ("because S1, S2 and S3, therefore the claim") → three supports, each with backing → at least one counterclaim answered by concede, distinguish or rebut. Every support passes the acceptable, relevant, sufficient test; if the supports could all be true and the claim still false, a support is missing.
- [ ] F-352 **Ethical analysis:** name the values in tension, the stakeholders (including the voiceless), one or two frameworks explained in plain words with their limits, principle and consequences together, and what we concede.
- [ ] F-353 **Stress tests:** counterexample, flip test, slope test, second order effects, and change the facts.
- [ ] F-354 **Checks Cruxy runs on any argument:** a catalogue of common fallacies (false dilemma, slippery slope without a stopping point, post hoc, appeal to authority, equivocation on a key term), circular supports, unexplained theory, and a gap between principle and case facts.
- [ ] F-355 **Growing example library.** Arguments that held up (accepted claim maps, moments judges praised, redos that scored higher) are stored as worked examples; weak ones are stored with what went wrong. Agents read the most similar examples before they work.
- [ ] F-356 **People grade Cruxy.** Every critique, Socratic question and model answer has "useful" and "not useful" buttons with an optional reason; leads and admins can mark a Cruxy point as wrong.
- [ ] F-357 **Outcomes grade Cruxy.** Cruxy's advice is checked against what happened next: did following it raise the person's next score, and did judges later agree?
- [ ] F-358 **A fixed test set.** A set of past transcripts and arguments with agreed critiques is re-run whenever prompts or examples change; a change ships only if Cruxy does at least as well on it.
- [ ] F-359 **Weekly review.** Cruxy drafts updates to its examples and checks from the week's feedback; the technical admin approves them in the console.

## Cost plan and caps

- [ ] F-360 Transcription with speaker labels · AssemblyAI Universal-3.5 Pro at $0.21 an hour plus $0.02 for speaker labels and $0.05 for key terms (Universal-2 at $0.15 an hour for solo drills) ([pricing](https://www.assemblyai.com/pricing.md)); $50 free credit at sign up · About $9 to $15; the first months are covered by the credit
- [ ] F-361 Drive digesting (one time, then changes only) · Small model, such as Gemini Flash-Lite at $0.25 per million input tokens ([pricing](https://ai.google.dev/pricing)) · Under $1 once; cents after
- [ ] F-362 Judging and reports · Strong model, one call per round with the whole transcript · About $4 to $15
- [ ] F-363 Nightly research · Small model in batch mode, strong model only to verify · About $2 to $5
- [ ] F-364 Assistant, drills, flashcards · Mostly small model · About $1 to $3
- [ ] F-365 Hosting, database, email · Vercel and Supabase free tiers; a free email service tier for the weekly summary · $0 at this size
- [ ] F-366 **Caps (enforced in the one AI gateway function)**
- [ ] F-367 Monthly hard cap: $30. At 80% Jainam gets an alert; at 100% everything except reading and flashcard review pauses.
- [ ] F-368 Per round cap: $0.75. Per research night: $0.25. Per person per day for the assistant: $0.20.
- [ ] F-369 Every call is logged in ai_calls; the admin console shows spend by feature and by person.
- [ ] F-370 **What keeps it cheap:** digest once and only re-digest changed files; search before sending context; cache the fixed prompt prefix; batch overnight work; delete audio after transcription; never send a whole library.

## Stack, services and repos

- [ ] F-371 App · Next.js (App Router, TypeScript), Tailwind, shadcn/ui as a base restyled to the Crux look · Bolt and Cursor both handle it well
- [ ] F-372 Hosting · Vercel · Already connected; cron for nightly jobs
- [ ] F-373 Database, files, search · Supabase: Postgres with pgvector, Storage for audio chunks, row level security, scheduled functions · One service for data, files and search
- [ ] F-374 Drive · Google Drive API, read only, through the service account crux-drive-reader (Google Cloud project crux-ethics-bowl-jainam-jain), which the Ethics Bowl folder is shared with · Base library
- [ ] F-375 Transcription · AssemblyAI Universal-3.5 Pro (speaker labels, key terms, word timestamps); Universal-2 for solo drills · Cheapest with labels
- [ ] F-376 Models · Through the Vercel AI SDK and AI Gateway, or OpenRouter · Swap models without code changes
- [ ] F-377 Embeddings · A small embedding model through the same gateway, or Supabase's built-in embedding function · Cheap search
- [ ] F-378 In browser · MediaRecorder for audio, SpeechSynthesis to read questions aloud, SpeechRecognition for rough live captions · Free
- [ ] F-379 Email · A transactional email service's free tier (for example Resend) · Weekly summary
- [ ] F-380 PDF text · A server-side PDF text extractor; scanned PDFs flagged
- [ ] F-381 **Free research sources:** OpenAlex, Semantic Scholar and Crossref (academic papers), Open Library and Google Books (book records), Project Gutenberg (public domain texts), the Stanford Encyclopedia of Philosophy and Internet Encyclopedia of Philosophy (frameworks), CourtListener (court opinions), Wikipedia (orientation only, never a final source), arXiv, and news sites' own APIs where free (for example the Guardian's).
- [ ] F-382 [open-notebook](https://github.com/lfnovo/open-notebook): open source alternative to NotebookLM with cited answers and a REST API; a model for the library and assistant.
- [ ] F-383 [Debby](https://github.com/RutanshP/Debby): records speeches in the browser, transcribes with AssemblyAI, plays an AI opponent and writes a judge decision; a model for the practice loop.
- [ ] F-384 [debate-lab](https://github.com/dinesh-git17/debate-lab): Next.js debate engine with judge and summary views.
- [ ] F-385 These are small projects: read their code and licence, borrow patterns, and don't depend on them.

## Privacy and security

- [ ] F-386 **Consent before recording.** Nobody is recorded without stored consent; a session with a text only member shows that on every screen, and their own device never records.
- [ ] F-387 **Audio is temporary.** Chunks are deleted right after the transcript is saved; a nightly job deletes any audio older than 24 hours as a backstop.
- [ ] F-388 **Voice samples** are used only to label speakers, stored privately, and deleted on withdrawal or at season end.
- [ ] F-389 **No training.** Transcripts go only to paid service tiers that don't train on customer data.
- [ ] F-390 **Codes and keys.** Session codes stored as hashes; personal passcodes stored as a hash plus an encrypted copy only the technical admin can view, which people are told before they choose one; API keys only in Vercel environment variables; nothing secret in the repo, prompts or client code.
- [ ] F-391 **Brute force limits** on sign in, session codes and the judging portal; failures go to the activity log.
- [ ] F-392 **Guest judges** see only their round's scoring card, and their link expires when the session ends.
- [ ] F-393 **Deletion on request.** Admins can delete a person's transcript lines, voice sample and comments in one action; aggregate scores remain anonymous.
- [ ] F-394 **Season end.** An export of everything to the Drive, then deletion of transcripts older than the season unless the admins keep them.
