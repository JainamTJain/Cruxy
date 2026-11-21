# Crux design

The approved direction is v2: cardinal, Cruxy gold and ink; Bricolage Grotesque for display, Inter for text, IBM Plex Mono for numbers and citations. Jainam rejected a generic first version ("colours, text, order and placement super wrong"), so match these references closely rather than falling back to default shadcn styling.

- Tokens: `tokens.css` (Track 0 copied these into `src/app/globals.css`; keep the two in sync). Rules: `.cursor/rules/10-design.mdc`.
- Screens: `screens/*.html` are the reference for every page. Open one in a browser to see it; image paths point to `/cruxy/...`, so they render when served from the app's `public/` folder. The markup is inline styled HTML inside a `<x-dc>` wrapper from the design tool: copy the structure, hierarchy, spacing and copy into React and Tailwind. All names and numbers in them are sample data.
- The live design canvas (to view, comment and play prototypes): https://claude.ai/artifact/Wn6DyDVHszTeXyd61jh9rN

## Screen index

| Reference | What it is | Route (suggested) | Track |
| --- | --- | --- | --- |
| `Main.html` | Sign in: name chips by team, keypad, Meet Cruxy consent | `/sign-in` | 0 |
| `ChooseCode.html` | First sign in: choose your passcode (working prototype) | `/sign-in/choose` | 0 |
| `Home.html` | Program map, the launch screen: what's been built so far, 12 cases by 3 teams, your next three | `/` | 6 |
| `Roadmap.html` | Personal roadmap with deadline ribbon and stations per case | `/roadmap` | 3 |
| `CaseBrain.html` | Case brain: claims, counterclaim, flashcards strip, proposals queue with tick, cross and reason, Inspired by Team N | `/cases/[n]` | 2 |
| `Reading.html` | Reading room: file beside its case, highlights, cross-team comments, Cruxy actions | `/reading/[fileId]` | 1 |
| `Session.html` | Admin session control: code, rounds, who is judging, attendance | `/admin/sessions/[id]` | 5 |
| `Practice.html` | Practice stage: phases, timer, captions, judges | `/practice/[roundId]` | 5 |
| `Feedback.html` | Round report: scorecard, per-person feedback, redo, transcript, bank entry | `/rounds/[id]/report` | 5 |
| `Admin.html` | Admin console: readiness, rosters and consent, Jainam-only panels (spend, books, calibration, passcodes), activity log | `/admin` | 6 (passcodes panel: 0) |
| `TeamBoard.html` | Team board: roles by case, versions confirmed, assign, team chat with version diffs | `/team` | 4 |
| `OnePager.html` | Visual one-pager | `/cases/[n]/one-pager` | 3 |
| `Drawer.html` | Cruxy drawer in admin mode | component | 4 and 6 |
| `JudgePhone.html` | Judge's scoring card on a phone | `/judge/[sessionCode]` | 5 |
| `FlashPhone.html` | Flashcards with spaced repetition, phone | `/revise/cards` | 3 |
| `DrillPhone.html` | Thesis in 30 seconds drill, phone | `/practice/drills/thesis` | 5 |
| `TodayPhone.html` | Phone home: next three, version to confirm, reminders, tab bar | `/` on phones | 0 shell, 6 content |
| `Cruxy.html` | Floating Cruxy: drag anywhere, Socratic bubble, sleeps in the lamp, tap lamp to call (working prototype) | root layout | 4 |
| `CruxyMoods.html` | The 9 moods and when each shows; Cruxy's character | reference | 4 |

## Cruxy's images (`public/cruxy/`)

Transparent PNGs, labels removed. Moods are a nice to have; if they aren't built, Cruxy stays `cruxy-curious.png`.

| File | Use |
| --- | --- |
| `cruxy-curious.png` | Default; asking a question |
| `cruxy-neutral.png` | Listening while someone types, speaks or records |
| `cruxy-winking.png` | Giving one hint |
| `cruxy-happy.png` | Did better than their own past |
| `cruxy-excited.png` | Personal best, or the team signed off a version |
| `cruxy-surprised.png` | Drift flag, new source, unexpected judge comment |
| `cruxy-sad.png` | A round went worse than the person's own past |
| `cruxy-sleepy.png` | Going back to the lamp |
| `cruxy-angry.png` | "Fierce": only while Cruxy plays the other team; never aimed at a person |
| `cruxy-lamp.png` | The lamp (bottom right of every page) and Cruxy's small icon everywhere |

The mood images were cut from a small poster, so they look soft above about 150px. Show Cruxy at 120 to 150px.
