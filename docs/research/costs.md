# Costs (checked November 21, 2026)

Budget: about $15 to $30 a month in total, with a hard cap of $30 enforced in `callCruxy()`. Assumes 55 hours of recorded practice a month and about 40 graded rounds or drills.

## Transcription changed since the spec was written

AssemblyAI now recommends Universal-3.5 Pro, which costs more than the Universal-2 figure the spec used.

| Option | Base | Speaker labels | Key terms | Per hour | 55 hours a month |
| --- | --- | --- | --- | --- | --- |
| Universal-3.5 Pro | $0.21 | +$0.02 | +$0.05 | $0.28 | about $15.40 |
| Universal-2 | $0.15 | +$0.02 | not offered | $0.17 | about $9.35 |

New accounts get $50 of free credit, which covers the first three or four months at this volume. Sources: [AssemblyAI pricing](https://www.assemblyai.com/pricing.md), [AssemblyAI pricing explainer, Nov 3, 2026](https://assemblyai.com/blog/speech-to-text-api-pricing).

**Recommendation:** Universal-3.5 Pro with key terms for rounds that will be graded (accuracy on names and philosophers matters there), Universal-2 for solo drills. Make the model a setting per round type so Jainam can change it in the admin console. Count transcription spend against the same $30 cap.

## Everything else (from the spec's Cost plan, unchanged)

| Item | Monthly estimate |
| --- | --- |
| Drive digesting (one time, then changes only) | under $1 once, cents after |
| Judging and reports (strong model) | $4 to $15 |
| Nightly research | $2 to $5 |
| Assistant, drills, flashcards (mostly small model) | $1 to $3 |
| Vercel, Supabase, Resend | $0 on free tiers at this size |

Caps: monthly $30 hard cap (alert at 80%, pause everything except reading and flashcards at 100%); $0.75 per round; $0.25 per research night; $0.20 per person per day for the assistant.

Model prices change often. Read them from the AI Gateway at run time and record the actual cost of each call; never hardcode them.

## Vercel plan

A free (Hobby) Vercel account has one team. A second team needs Pro, which costs $20 a month and would use most of the budget. Crux runs on Jainam's personal Hobby team, renamed from "InnovateLA - Jainam Jain" (see `docs/infrastructure.md`).
