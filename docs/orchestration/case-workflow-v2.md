# Case workflow v2 (Jainam, Nov 21, 2026)

This replaces earlier case-page structure. Read it with `docs/decisions.md` ("Team privacy and shared ideas").
The point of Crux is to make a team's case preparation faster and better, alone or together. Every screen
must be obvious to someone who has never seen Crux.

## The flow in one paragraph

A team imports its working documents once (all cases in one file is normal). Crux splits them into one
working document per case. A team with no document gets one started for every case from the truth source.
The truth source gathers everything known about a case: the case set, the team prep material in
`docs/domain/cases`, research, practice transcripts, and ideas from every team that Cruxy judged worth
sharing. From it, Cruxy reviews each team's working document and raises suggestions beside it. The team
ticks or crosses them. The one pager is drawn from the team's working document plus the suggestions it
accepted, and updates as the working document changes. Flashcards and practice are built from the one
pagers and the case, weighted by each person's role.

## Case page: four tabs, nothing else

1. **Reading**
   - The case itself, cleaned (done: `src/lib/case-home/case-section.ts`).
   - Extra reading: Evidence Library items, quotes, examples, frameworks and materials found for this case,
     plus anything a team imports for reading. A team may share an imported reading with other teams; other
     teams see it under Extra reading only if they choose to.
   - Research: Cruxy's research brief for this case (at most three ranked sources per claim), right here,
     not hidden.
2. **Working document** (one per team per case)
   - The document on the left, suggestions on the right, always visible together.
   - Suggestions come from Cruxy, from another team (vetted, anonymous), and from team members (via
     "Tell Cruxy an idea"). Each has a tick and a cross (a reason is required, per `docs/decisions.md`).
   - Cruxy's suggestions do more than ask: each one makes a case. "Here is where your point is weak, here is
     why, here is a stronger version; what do you think?" It finds missing perspectives and stakeholders,
     counterarguments the team has not answered, logical fallacies, claims that do not connect to the answer,
     loose ends, and gaps in evidence. Socratic questions are one kind of suggestion, not the only kind.
3. **One pager** (one per team per case)
   - Drawn from the team's working document and its accepted suggestions. When the working document changes,
     Crux proposes the matching one pager update; the team accepts it. Editable in place (done).
   - The claim structure (claims, supports, counterclaim and reply) is shown here; there is no separate
     claim map tab.
4. **More**: only Ideas over time.

Remove from the case page: the Team Brief tab (its suggestions now live beside the working document), the
Claim map tab (folded into the one pager), the separate Evidence Library and Research tabs (now in Reading),
and Flashcards and Questions tabs (now in Practice; questions also appear in the working document's
"Questions judges may ask" section).

## Import: one button, Crux does the splitting

- One "Import our documents" action for the team (not per case). It takes one or more Google Docs or files.
- Crux splits the content by case (case numbers, titles, headings) and shows a short review: "Case 1: found,
  3 sections. Case 3: found. Case 6: not in this regional. Not matched: 2 paragraphs, choose a case." The
  team confirms; each case's working document fills in.
- Re-importing later updates the same working documents and shows what changed.

## No document yet

- "Start our working documents" creates a working document for every active case, filled from the truth
  source (the prep material in `docs/domain/cases`, disregarding its one-pager section), with new
  perspectives, analogies and research added, and suggestions already waiting.

## Truth source and suggestions

- The truth source is shared knowledge per case. It never shows one team's work to another team; it only
  feeds suggestions.
- When members of different teams highlight or comment on the same idea, or add a thought, Cruxy judges
  whether it holds value against the judging criteria. If it does, it becomes a suggestion for the other
  teams' working documents. Weak or wrong ideas never travel.

## Annotating (case text and working document)

- A clear Highlighter tool (a toggle in the reading toolbar). With it on, selecting text highlights it.
  With it off, selecting text does nothing until the person right clicks (long press on a phone).
- Right click or long press opens a small menu: Highlight, Comment, Explain this, Ask Cruxy.
  Explain this is strongest for ethical frameworks and terms (see the framework cards).
- Highlights stay visible. Each person has their own colour, shown in a small legend of who highlighted.
- Comments open a thread in place (E's discussion work).

## Practice: flashcards and questions live here

- Flashcards move into Practice. Decks are weighted by role:
  1. Cases you lead: know them inside out (case facts, stakeholders, claims, supports, counterclaims and
     replies, likely judge questions).
  2. Cases where you are counter-arguer: the case and the counterarguments.
  3. Cases where you support: the one pager.
  4. Everyone: the one pager of every case.
- Each card: Got it, Again, Practice more (spaced repetition).
- Solo question practice: moderator and judge questions for the cases you lead first, answered aloud or
  typed, with Cruxy feedback.

## Rules that still hold

Real data only; nothing invented about real people. Cruxy asks before it answers, cites or says it cannot.
Plain words, no em dashes, no middle dots. Teams do not see each other's work.
