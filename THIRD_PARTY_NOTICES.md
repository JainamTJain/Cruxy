# Third-party notices

Crux does **not** depend on these projects at runtime. They are listed in the
spec and `docs/orchestration/assignments.md` as code to learn from. Check each
licence before copying anything; prefer MIT or Apache 2.0 and credit here.

| Project | Licence (as published upstream) | What we studied | Status in Crux |
| --- | --- | --- | --- |
| [open-notebook](https://github.com/lfnovo/open-notebook) | MIT | Cited answers, library/assistant patterns | Patterns only; not vendored |
| [Debby](https://github.com/RutanshP/Debby) | Check repo | Browser recording, AssemblyAI, judge-style feedback | Patterns only; not vendored |
| [debate-lab](https://github.com/dinesh-git17/debate-lab) | Check repo | Judge and summary views | Patterns only; not vendored |
| [supabase-community/chatgpt-your-files](https://github.com/supabase-community/chatgpt-your-files) | Apache-2.0 | pgvector chunk/match | Patterns only; AI calls go through `callCruxy` |
| [supabase-community/nextjs-openai-doc-search](https://github.com/supabase-community/nextjs-openai-doc-search) | Apache-2.0 | Embed/match/cite pipeline | Patterns only |
| [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT | Spaced repetition math | Used via the `ts-fsrs` npm package |
| [ishiko732/ts-fsrs-demo](https://github.com/ishiko732/ts-fsrs-demo) | MIT | Next.js + FSRS review flow | Patterns only |
| [zsh-eng/spaced](https://github.com/zsh-eng/spaced) | Check repo | Phone flashcard swipe gestures | Patterns only |

Never paste code that calls a provider SDK directly, stores data in
`localStorage` instead of Supabase, or skips `activity_log`.
