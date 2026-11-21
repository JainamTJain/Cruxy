# How Crux gets finished (read before any work)

Claude coordinates; Cursor agents build. Tracks 0 to 6 exist as plumbing, but the product does not yet look or behave like what Jainam designed and asked for. The job now is **parity**: every feature in the spec and every element of every design screen, working with real content. New ideas come only after parity.

## The two checklists are the definition of done

- `feature-checklist.md`: 394 items generated from `docs/spec.md` (F-001 to F-394).
- `design-parity.md`: 942 items generated from `docs/design/screens/*.html` (D-0001 to D-0942).

Rules:
1. Tick an item only when it works in the running app (sample data mode is fine) and write the file that implements it in brackets after it.
2. Never delete or reword an item. If it can't be done, leave it unticked and add `BLOCKED: reason`.
3. Each pull request lists the item ids it ticks in its description.
4. A pull request that changes UI must include before and after screenshots from `npm run shots` (both 1440 and 390 wide) next to the reference.

## What "match the design" means

The reference HTML is the layout, not a mood board. For each screen:
- Same regions in the same places (sidebar, header block, grids, panels), same order, same hierarchy of type sizes.
- Same copy where the reference has fixed labels; sample names and numbers are replaced by real data, but the element exists.
- Tokens only: cardinal `#9D2235`, Cruxy gold `#F5B700`, ink `#111318`, paper `#F3F4F6`, white cards with 20px radius, lines `#E3E5E9`, muted `#5A606B`; Team 1 `#0F7B6C`, Team 2 `#4F46E5`, Team 3 `#C2410C`. Bricolage Grotesque 800 for display (the "crux" wordmark, big numbers, page titles), Inter for text, IBM Plex Mono for numbers, codes and citations.
- No cream backgrounds, no gradient washes, no default shadcn look, no placeholder dots labelled "lamp": use the PNGs in `public/cruxy/`.
- Empty states are a last resort. Pages show real content from the seeded cases (see Wave 1, B).

## Screens and routes

| Reference | Route |
| --- | --- |
| Main.html | /sign-in and /consent |
| ChooseCode.html | /choose-passcode |
| Home.html | /home |
| TodayPhone.html | /home at 390px |
| Roadmap.html | /revision/roadmap |
| CaseBrain.html | /case-brain/[caseId] |
| OnePager.html | /revision/one-pagers (and per case) |
| Reading.html | /library/[fileId] |
| Session.html | /practice/sessions/[id] (admin) |
| Practice.html | /practice/rounds/[id] |
| Feedback.html | /practice/rounds/[id]/report |
| JudgePhone.html | /judging at 390px |
| DrillPhone.html | the thesis drill at 390px |
| FlashPhone.html | /revision/flashcards at 390px |
| TeamBoard.html | /team |
| Drawer.html | Cruxy drawer, admin mode |
| Admin.html | /admin |
| Cruxy.html, CruxyMoods.html | floating Cruxy and lamp on every page |

## Checking your work

`npm run shots` signs in with sample data, screenshots every route above at 1440 and 390 wide, renders the matching reference beside it, and writes pairs to `.shots/` (gitignored). Look at every pair before opening a pull request.

## Merge order

Wave 1 (Supabase wiring, design foundation and content) merges first; Workstream 0 is the most urgent because the live site cannot sign anyone in until it lands. Wave 2 agents start from main after that and each owns one group of screens, so they don't collide. Claude reviews every pull request against the checklists and screenshots before it merges.
