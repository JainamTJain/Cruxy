# Crux

Web app for USC’s three Ethics Bowl teams.

**Building with Cursor:** start every chat by @-mentioning `AGENTS.md` and the track file in `docs/tracks/`. Everything about the product is indexed in `docs/README.md`. **Cruxy** is the built-in thinking partner (users never see “AI” or model names).

## Tracks landed

- **Track 0 Foundation** — auth, schema/RLS, `callCruxy`, design tokens, Passcodes panel, checklist
- **Track 2 Case brain** — per-team claim maps, Truth Sources queue (propose → human decide with reason), Inspired-by fan-out, Analyst notes, opposing positions, robustness / consistency / change-the-facts, full item history
- **Track 3 Revision** (this PR) — one-pagers (visual + diff + Drive export stub), FSRS flashcards synced from Truth Sources, Socratic drills, language/phrasebook, 10-minute warm-up, moderator bank (paste → confirm), personal roadmaps with auto stage marking

### Local / sample-data path

Supabase and AI gateway keys may still be missing. With `USE_SAMPLE_DATA=1` (default when Supabase is unset), the app uses a local JSON store under `.data/` (gitignored). Case brains and revision tools work in this path; Analyst / Coach drafts use `callCruxy` stubs when keys are missing.

```bash
cp .env.example .env.local
# fill SESSION_SECRET, PASSCODE_VIEW_KEY, INITIAL_ADMIN_CODE_HASH, etc.
npm install
npm run dev
```

**Sample member starter (local only):** `482913`  
Use it once per person, then choose your own 6-digit passcode.

Jainam signs in with the admin starter whose hash is `INITIAL_ADMIN_CODE_HASH` (never commit plaintext).

### Acceptance checks

```bash
npm run check:track0
npm run check:track2
npm run check:track3
```

Drive one-pager export is a stub until `DRIVE_ROOT_FOLDER_ID` + service account are set.

Apply migrations when Supabase is connected:

- `supabase/migrations/00001_track0_foundation.sql`
- `supabase/migrations/00002_track2_case_brain.sql`
- `supabase/migrations/00003_track3_revision.sql`
- `supabase/seed.sql`

### Still needed from Jainam for production

1. **Supabase** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. **AI gateway** — `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY`
3. **Drive** — share the Ethics Bowl root folder with the service account email (see secrets inventory), then set `DRIVE_ROOT_FOLDER_ID`

### Security

- Never commit `.env`, `.env.local`, service account JSON, or secrets
- `.env.example` has empty keys only
- Passcodes: argon2 hash + AES-GCM copy for tech-admin reveal; Jainam’s own is hash-only

### Design tokens

- Cardinal `#9D2235` · Gold `#F5B700` · Ink `#111318`
- Fonts: Bricolage Grotesque, Inter, IBM Plex Mono
