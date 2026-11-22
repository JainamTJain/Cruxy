# Writing in Crux

Use this for every heading, button, empty state, error and notification. Jainam will share Crux with people who have never seen it. Every screen must explain itself.

## Voice

- Short sentences. Plain words. No jargon.
- Say what it is, why it matters, and what to do next.
- No em dashes. No middle dots (·).
- Users never see "AI" or a model name. They see "Cruxy".
- Never show internal ids, table names, route paths or raw error codes.

## Same word for the same thing

| Say | Not |
| --- | --- |
| Evidence Library | Truth Sources, truth queue, shared facts store |
| Team Brief | case brain doc, working notes (when you mean the team's one place) |
| case | case file, problem set |
| round | practice bout, session segment (when you mean a scored practice round) |
| judge card | APPE card, scoring form (when shown to judges) |
| Cruxy | the AI, the model, Claude, GPT |
| passcode | PIN, password (for the 6-digit sign-in code) |

Reading room stays the name for Drive files and search. Evidence Library is the shared facts and citations (formerly Truth Sources).

## Page titles

Every signed-in page gets:

1. A clear title (what this place is).
2. One short explainer under it for a first-time visitor (why it matters and what to do).

Use `PageIntro` from `src/components/page-intro.tsx` when you add or rewrite a title block.

## Buttons

- Verb first: "Start practice", "Join with a code", "Open scoring card".
- Say what happens next, not the technical step: "Save passcode", not "Submit hash".

## Empty states

- Say what will show up here and how to get the first item.
- Offer one clear next action when you can.

## Errors and notifications

- What happened, in plain words.
- What to try next (retry, ask Jainam, pick a different case).
- Never dump stack traces or provider messages into the UI.

## Checklist when you edit copy

1. Would a first-time USC teammate understand this without a walkthrough?
2. Is the same idea called the same word elsewhere on this screen?
3. Does an error say what to do next?
