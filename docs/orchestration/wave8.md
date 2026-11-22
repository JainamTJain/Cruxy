# Wave 8: finish everything, wire it perfectly, make it cogent (Nov 21 night)

From Jainam while using the live app. Same rules: real data only, `callCruxy` tiers only, no middle dots and no em dashes in the UI, RLS on and client roles revoked on new tables, one PR per agent, green CI, check 390px and 1280px, skip Vercel and Supabase sign-in prompts. Next free migrations: J 00046, H 00047, D 00048, E 00049, C 00050, I 00051, K 00052, G 00053, F 00054.

Every word shown to people must be clear: short sentences, say what it is and what to do next, no internal names or ids, the same word for the same thing everywhere.

## Decided design: Team Brief plus Evidence Library (no team is forced to use Crux's document)

- **Evidence Library** (today's central Truth Sources): shared facts, sources and citations for all three teams. Evidence only, never a stance.
- **Team Brief**: exactly one per team per case, the one place a team works from. Each team picks the mode per case and can switch:
  - **Our own doc**: link an existing Google Doc from the Ethics Bowl Drive folder. Crux reads it on every sync and never writes to it.
  - **Build it in Crux**: the claim map and one pager, drafted from the Evidence Library (Team 3 starts here).
- **Suggestions margin** beside the Brief: new evidence, Cruxy's questions, counter-arguments, "Inspired by another team". Nothing changes the Brief until the team accepts. In "Our own doc" mode an accepted suggestion becomes a checklist item to add to their doc.
- **Back to the Library**: facts with citations found in a team's doc become candidate Library entries (facts only). Other teams see the fact, not the team's stance, unless the team chooses to share.
- **Agreed stance bar** at the top of the Brief: thesis, version, who has confirmed it. Crux flags drift when someone's notes, drills or round answers contradict it.

## Owners

| Agent | Build |
| --- | --- |
| C | **Team Brief plus Evidence Library** as decided above, end to end: mode choice per case, Google Doc link and read on sync (reuse H's team-doc-import), suggestions margin, accept flow, back-to-Library candidates, Agreed stance bar and drift flag. Rename user-facing Truth Sources to Evidence Library consistently. |
| H | **Cogent research, like an esteemed philosopher.** Never dump 15 papers on a case. Per claim at most 3 sources, ranked by a written rubric (relevance to the exact claim, argumentative force, credibility: peer review, venue, citations, primary over secondary, recency where it matters). Show one best source, why each of the 3 earns its place in one sentence, and the strongest opposing source (steelman). Everything else folds under More. The nightly run produces a short brief per case (at most 3 findings a night) with Cruxy's judgment: what changes in our argument and what does not. |
| D | **Learning profile**, asked right after voice enrollment and editable any time in Settings (with re-record voice and consent changes). Quantitative sliders 0 to 100 with a sensible default: visual vs verbal, analogies vs formal logic, ethical analysis vs logical mechanization, short vs deep answers, direct vs gentle feedback. A baseline self-rating per APPE scoring item, later compared with judge cards to calibrate. Cruxy reads the profile in every answer, drill, flashcard and explanation (inject through Cruxy's context builder), and the roadmap leans toward the weakest scoring item. |
| E | **Roadmap redesign** (it looks badly formatted): one clear timeline to Dec 5 per person, stages as rows with due dates, status and the one next action, readable at 390px. **Roles board additions**: each person marks "any case is fine" or ranks cases; one Random fair split button fills leads for the "any case" people after honoring preferences; **Lock for Regionals 2026** saves the season's leads as a snapshot that stays put. |
| J | **One Genie size everywhere.** The floating Genie, the popped-out Genie and every pose render at the same size (150px wide desktop, 96px phone), normalised by pose aspect. The lamp hides or tucks behind while the Genie is out; they never appear as two big figures. Confirm the new wordmark in the side nav, phone header and Cruxy panel. |
| I | **Plain-language pass** over every screen, button, empty state, error and notification: what it is, why it matters, what to do next. Humane error messages. Keep a short style guide in docs/design/writing.md. |
| K | **Wiring audit.** Every button and form calls a route that exists, every route uses a repository wired to Supabase, every write shows up where people expect it. Script it (extend check:supabase-wired with a route and UI map), fix every gap, and list them in the PR. Admin health shows the last 24 hours with a short note, so old errors do not look like current ones. |
| G | **Product audit.** Walk every feature as a member, a lead, Dr. B and the tech admin. Score each on impact and clarity, cut or merge what does not earn its place, and build the top 5 missing pieces that would most help a team win on Dec 5 (for example a "Today" focus card, a pre-round warmup, a one-tap judge question drill). Write the audit in docs/orchestration/product-audit.md. |
| F | **Speed and loading.** Every page under 2 seconds on a phone, the LoadingGenie for waits, no layout jumps, cache what can be cached, and no request waterfalls. |
