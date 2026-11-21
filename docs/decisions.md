# Decisions (what Jainam decided, and why)

Each line is a decision already made. Quotes are Jainam's own words. Don't reverse one of these to make the code simpler; if one seems wrong, ask.

## Scope and timing

- **Build everything now, in parallel.** "I want everything built NOW, no order only competition." "I need it asap. I have cursor and bolt and why can't I use them to finish it." No phases, no MVP cut.
- **Used beyond the regional.** "This is for the regionals, and semis and must then be used further as well." Season rollover and a competition log are in scope.
- **Web only, on phones too.** "on phone also, web only". Installable to the home screen; no native app.

## People, roles and access

- **Teams:** Team 1 Serena, Ivan, Ashton, Stolei, Tri; Team 2 Lehar, Camerin, Jade, Bethany, Quixote; Team 3 Nick, Daniel, Katie, Jainam.
- **Admins see everything.** "Dr B would not approve anything instead she and me we must both be able to see everything and I should also be able to see other technical stuff." Dr. B approves nothing; Jainam alone sees technical panels (spend, keys, calibration, book requests, passcodes, Is Crux working).
- **Dr. B uses the platform herself** and gets a weekly summary only if she consents.
- **Everything is visible to all teams.** "Everything." Each team decides for itself: "Anyone does it for themselves or their team."
- **USC teams never compete against each other.** No rankings between them.
- **Admins take attendance** and enter session dates; Cruxy only pre-fills.

## Sign in and passcodes

- **Name plus keypad.** "Others must have the ability to enter name and then have a passcode keypad below to enter."
- **Everyone chooses their own passcode after the first sign in**, and Jainam can see it "in case they forget". People are told this before they choose.
- **Jainam's own passcode is never written anywhere**: not in the spec, prompts, code or repo. It is set from an environment variable hash at deploy.

## Consent and recording

- **Consent at first sign in:** people are told what is recorded, when and why, and asked to agree. Cruxy is explained there too.
- **Voice sample is part of agreeing to be recorded**, not a separate optional step ("Not required to stay optional").
- **Delete audio once the transcript is made.**
- **Captions yes**; no other accessibility inclusions were requested.

## Cruxy

- **One name for all the AI: Cruxy.** Users never see "AI" or a model name.
- **Character:** "a wise super ethically-aligned learner with more questioning than answering." Asks first, answers after the person tries.
- **Socratic even when teams converge.** "cruxy must ask still in socratic fashion".
- **Look:** the blue genie and the blue and gold lamp in `public/cruxy/`. Moods are a nice to have. Cruxy can be dragged anywhere, sleeps in the lamp at the bottom right, and comes back when the lamp is tapped. **No face-only crop**; the lamp is the small icon.
- **Cruxy learns** good logic and ethical reasoning and improves with practice ("no need to mention it during consent").
- **Cruxy answers admins' program questions** (what is happening where, who is prepared, which team needs help).

## Library and research

- **The Drive is the base.** It has no audio or video and is "a bit scattered", so Cruxy sorts it.
- **Books:** Cruxy asks the admin for books it needs; it ingests open-source material itself.
- **Research is exhaustive in coverage and concise in what it shows.**
- **Ideas were discussed on the Drive, not in chat**, and that material is unstructured.

## Truth Sources and ideas

- **Each team has its own Truth Sources**, but other teams' additions and rejections are visible to all.
- **A reason is required** for every accept, reject or edit; a green tick or red cross is enough as the button ("No need for everytime saying it").
- **"Inspired by Team N"** proposals go to the other teams to tick or cross.
- **Teams must stay on the same page** as ideas evolve: versioned claim maps, confirmations, drift flags.

## Revision and practice

- **One-pagers must be visual** (tables, charts, graphics) and have no length cap.
- **Leads get flashcards automatically; anyone else can opt in**, and that shows.
- **Readings become flashcards** too.
- **All practice modes are available**, alone or with another team, in or out of admin sessions, in person or remote.
- **Sessions are created by admins**; a session can have several judges and moderators.
- **Personal roadmap per person** with recommended deadlines; people start whenever they want.
- **Reminders:** email only if the person adds an email and wants reminders; otherwise in the app. No calendar.
- **Feedback can sting.** "no it is okay let it sting". Honest, specific, with the better version.

## Judging and scoring

- **The scoring card copies the APPE Fillable Scoring Sheet in the Drive** (see `docs/domain/scoring-card.md`).
- **Cruxy grades both sides when there is no human judge.**
- **No static score boundaries.** "it is always about how much given person has improved from their own past."
- **No static judge weights.** Cruxy analyses each human card (mood, fatigue, bias toward a case idea) before learning from it. Experienced judges count more, without saying so.

## Design

- **v1 colours, text, order and placement were "super wrong".** v2 is the approved direction: cardinal #9D2235, Cruxy gold #F5B700, ink #111318; Bricolage Grotesque, Inter, IBM Plex Mono.
- **The launch screen must show what has been built so far**, not a generic landing page.
- **Session codes are visible to admins only.** Judges are asked in the app who is judging (in person, Cruxy, or both); a known judge enters a session code, a new judge scans a QR code.

## Budget and tools

- **About $20 to $30 a month in total**, just Jainam paying.
- **Tools:** Cursor and Bolt; GitHub; free APIs where possible.
- **Crux work must not live in the InnovateLA Vercel team** ("i dont want others to have this").
- **Drive access through a Google Cloud service account under the USC Google account.**

## Models (Jainam, Nov 21, 2026)

- Small tier: GPT-6 Luna, backup Gemini 3.8 Flash. Strong tier: GPT-6.2 Sol, backup Gemini 4 Carbon. Embeddings: OpenAI text-embedding-3-small. All through Vercel AI Gateway with per-request zero data retention. No Anthropic, no direct provider SDKs. Details: `docs/orchestration/model-routing.md`.
- Dr. B has his own starter code (`COACH_STARTER_CODE_HASH`), separate from the shared member starter code.
