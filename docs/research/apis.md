# Outside APIs: current notes (checked November 21, 2026)

These services changed recently. Use this file, not memory. Each section links the official page; re-check it if something fails.

## Supabase

**API keys changed.** Supabase is replacing the old `anon` and `service_role` keys with a publishable key (`sb_publishable_...`) and secret keys (`sb_secret_...`), and is deprecating the old ones by the end of 2026. The new values are drop-in replacements, so Crux keeps the variable names Track 0 already uses:

| Variable (as in the code) | Value to put in it |
| --- | --- |
| `SUPABASE_URL` | `https://jwqjxsjwglukpkokpmcb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the **secret** key `sb_secret_...` (server only, bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **publishable** key `sb_publishable_...` |

Don't paste the old JWT-style `service_role` or `anon` keys; they stop working when Supabase retires them.

Docs: [API keys](https://supabase.com/docs/guides/api/api-keys), [Migrating to publishable and secret keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

### How sign in works (built in Track 0)

Track 0 signs people in with its own session: the server checks the passcode (argon2), then sets an HS256 JWT cookie `crux_session` signed with `SESSION_SECRET` (`src/lib/auth/session.ts`). There is no Supabase Auth user, so `auth.uid()` is empty inside Postgres.

Rules that follow from that:

1. **All database access is server side**, through `src/lib/db/repository.ts` with the secret key. Never query Supabase from the browser for anything but public, non-personal data.
2. **Every server route checks the session and the person's role** before reading or writing, because the secret key bypasses RLS. Put those checks in one helper and use it everywhere.
3. **RLS stays on every table** as a backstop: deny by default for `anon`, so a leaked publishable key exposes nothing.
4. If a later track needs the browser to talk to Supabase directly (for example Realtime chat), switch that track to Supabase Auth sessions first: give each person a Supabase Auth user with a synthetic email and, after the passcode check, sign them in on the server with `auth.admin.generateLink({ type: 'magiclink' })` then `verifyOtp({ type: 'magiclink', token_hash })`. Test signing the same person in twice. Docs: [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).

## Vercel AI SDK and AI Gateway

- Pass a `creator/model` string (the exact strings are chosen by Jainam in the admin settings, never hardcoded by an agent) to `generateText`, `streamText` or `generateObject`; the SDK routes it through AI Gateway automatically.
- Auth: `AI_GATEWAY_API_KEY` locally; on Vercel deployments OIDC works without a key. The key belongs to whichever Vercel team created it.
- Don't hardcode model prices; the Gateway reports cost per generation. `callCruxy()` records what the Gateway reports.
- Check the model list in the Vercel dashboard (AI Gateway, Model List) before choosing model strings; names change often.
- Docs: [AI Gateway provider](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway), [Models and providers](https://vercel.com/docs/ai-gateway/models-and-providers).

## AssemblyAI (practice transcripts)

- Recommended pre-recorded model: `universal-3-5-pro` (set `speech_models: ["universal-3-5-pro", "universal-2"]` for an explicit fallback). Old ids `best` and `nano` are deprecated.
- Speaker labels: `speaker_labels: true`. Use `speakers_expected` when the round's seat count is known.
- Vocabulary: `keyterms_prompt: [...]` with case names, philosophers, team members' names and terms from the glossary (spec, "Transcription vocabulary"). On async Universal-3.5 Pro, `prompt` and `keyterms_prompt` can't be used in the same request; use `keyterms_prompt`.
- Don't put the word "speaker" in a prompt; it can inject speaker names into the text. Use `speaker_labels` instead.
- Workflow: upload chunks to Supabase Storage, give AssemblyAI a signed URL, receive the result by webhook, save `transcript_lines`, then delete the audio.
- There's also an AI SDK provider (`@ai-sdk/assemblyai`, `transcribe()`), but call it from the server, not through `callCruxy()`, and log its cost to `ai_calls` yourself.
- Docs: [Models](https://www.assemblyai.com/llms/models.md), [Pricing](https://www.assemblyai.com/pricing.md), [Keyterms and prompting](https://www.assemblyai.com/docs/pre-recorded-audio/universal-3-5-pro/prompting.md), [AI SDK integration](https://www.assemblyai.com/docs/integrations/vercel-ai-sdk).

## Google Drive (service account, read only)

- Auth with the service account JSON in `GOOGLE_SERVICE_ACCOUNT_JSON` (parse it server side) and scope `https://www.googleapis.com/auth/drive.readonly`, using `googleapis` (`google.drive({ version: 'v3', auth })`).
- The service account sees only what is shared with it. Jainam shares the Ethics Bowl folder (`DRIVE_ROOT_FOLDER_ID`) with `crux-drive-reader@crux-ethics-bowl-jainam-jain.iam.gserviceaccount.com` as Viewer.
- First sync: walk the folder tree with `files.list` (`q: "'<folderId>' in parents and trashed = false"`, `fields` including `id, name, mimeType, modifiedTime, md5Checksum, parents`), following `nextPageToken`.
- Nightly sync: store a start token from `changes.getStartPageToken`, then call `changes.list` with it and save the new token. Only re-digest files whose checksum or modified time changed.
- Google Docs, Sheets and Slides have no binary content: use `files.export` (Docs to `text/plain` or `text/markdown`, Sheets to `text/csv`). PDFs and .docx come from `files.get` with `alt: 'media'`.
- The Drive has no audio or video (decision), so skip those mime types.
- Docs: [Retrieve changes](https://developers.google.com/workspace/drive/api/guides/manage-changes).

## Recording in the browser (MediaRecorder)

- iPhone and Mac Safari record `audio/mp4` (AAC). Safari 18.4 and later can also record WebM. Chrome, Edge and Firefox record `audio/webm;codecs=opus`.
- Pick the type at runtime: try `audio/webm;codecs=opus`, then `audio/mp4`, using `MediaRecorder.isTypeSupported`. Store the mime type with each chunk.
- Use `recorder.start(10000)` (10 second chunks) and upload each chunk as it arrives so a crash loses at most 30 seconds. Keep a wake lock while recording on phones.
- Test on a real iPhone in Safari and on Android Chrome before calling Track 5 done.

## Flashcards (spaced repetition)

- Use `ts-fsrs` (FSRS algorithm, MIT licence, needs Node 20 or later): `fsrs()`, `createEmptyCard()`, `Rating.Again | Hard | Good | Easy`. Store the card state in `card_reviews`.
- Docs: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).

## Email

- Resend for reminder emails (only for people who added an email and opted in) and Dr. B's Sunday weekly summary (only if she opted in). `EMAIL_API_KEY`, sender on a verified domain or Resend's test sender until one exists.
