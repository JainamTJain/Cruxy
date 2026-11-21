# Crux

Web app for USC’s three Ethics Bowl teams.

**Building with Cursor:** start every chat by @-mentioning `AGENTS.md` and the track file in `docs/tracks/`. Everything about the product is indexed in `docs/README.md`. **Cruxy** is the built-in thinking partner (users never see “AI” or model names).

## Tracks landed

| Track | Status |
|-------|--------|
| **0 Foundation** | Auth, schema/RLS, `callCruxy`, activity log, design tokens |
| **1 Library** | Drive sync + digest, reading room, search, nightly research, book requests |
| **2 Case brain** | Claim maps, Truth Sources queue, Inspired-by, Analyst, opposing positions, robustness |
| **3 Revision** (this PR) | One-pagers, FSRS flashcards, Socratic drills, moderator bank, personal roadmaps |

### Local / sample-data path

Supabase, AI gateway, and `DRIVE_ROOT_FOLDER_ID` may still be missing. With `USE_SAMPLE_DATA=1` (default when Supabase is unset), the app uses a local JSON store under `.data/` (gitignored) and **sample Drive stubs** when the folder id is unset. Case brain and revision tools work in this path; Analyst / Coach / Librarian stubs use `callCruxy` when keys are missing.

```bash
cp .env.example .env.local
# fill SESSION_SECRET, PASSCODE_VIEW_KEY, INITIAL_ADMIN_CODE_HASH, etc.
npm install
npm run dev
```

**Sample member starter (local only):** `482913`  
Use it once per person, then choose your own 6-digit passcode.

### Acceptance checks

```bash
npm run check:track0
npm run check:track1
npm run check:track2
npm run check:track3
```

Track 1 checks: unchanged re-sync → 0 AI calls; every passage has Drive id + anchor; sorting queue lists confidence &lt; 0.7.

Drive one-pager export is a stub until `DRIVE_ROOT_FOLDER_ID` + service account are set.

### Library (Track 1)

- **Sync now** on `/library` (and Vercel cron `0 7 * * *` → `/api/cron/drive-sync`)
- Digests only new/changed files (checksum + modified time)
- Librarian tags case / type / confidence; passages ~600 words with anchors + stub embeddings
- Reading room: `/library/[fileId]` — case pane + file, highlights, comments, ask Cruxy, → flashcard / Truth Source proposal
- Search: `/library/search` · Sorting queue: `/library/sorting`
- Nightly research cron `30 7 * * *` → `/api/cron/research`; book requests at `/admin/books` (tech admin only)
- Research / reading / transcript ideas post into the shared Track 2 proposals queue

### Still needed from Jainam for production

1. **Supabase** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; apply `00001_track0_foundation.sql`, `00002_track2_case_brain.sql`, `00003_track1_library.sql`, `00004_track3_revision.sql`, and `supabase/seed.sql`
2. **AI gateway** — `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY` (Librarian/Researcher/Coach stub until set)
3. **Drive** — share the Ethics Bowl root folder with `crux-drive-reader@crux-ethics-bowl-jainam-jain.iam.gserviceaccount.com`, then set `DRIVE_ROOT_FOLDER_ID` (service account JSON via `GOOGLE_SERVICE_ACCOUNT_JSON`)
4. Optional: `CRON_SECRET` for cron routes

### Security

- Never commit `.env`, `.env.local`, service account JSON, or secrets
- `.env.example` has empty keys only
- Passcodes: argon2 hash + AES-GCM copy for tech-admin reveal; Jainam’s own is hash-only
- Book requests RLS / API: tech admin only

### Design tokens

- Cardinal `#9D2235` · Gold `#F5B700` · Ink `#111318`
- Fonts: Bricolage Grotesque, Inter, IBM Plex Mono
