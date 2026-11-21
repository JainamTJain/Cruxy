# Crux

Web app for USC’s three Ethics Bowl teams. **Cruxy** is the built-in thinking partner (users never see “AI” or model names).

## Tracks

**Track 0 Foundation** (merged): Next.js App Router, design tokens, full schema SQL + RLS, name + 6-digit passcode auth, consent, Passcodes panel (tech admin), activity log, admin switch, `callCruxy` with monthly cap, first-run checklist, mobile layouts, and PWA installability.

**Track 5 Practice**: admin/member sessions with hashed join codes, six practice modes + drills, chunked 30s recording, AssemblyAI transcription (speaker labels) then immediate audio delete, judging portal (known + guest/QR), APPE scoring card, Cruxy judge with evidence-linked scores, feedback reports, scored redos, skills, and the Things to take care of bank.

### Local / sample-data path

Supabase and AI gateway keys may still be missing. With `USE_SAMPLE_DATA=1` (default when Supabase is unset), the app uses a local JSON store under `.data/` (gitignored).

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
npm run check:track5
```

Track 5 checks: mid-round chunk loss ≤30s; audio gone after transcription; every feedback point cites a transcript line; rounds with no human judge get Cruxy scores for every team.

### Still needed from Jainam for production

1. **Supabase** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; apply `supabase/migrations/00001_track0_foundation.sql`, `00002_track5_practice.sql` + `supabase/seed.sql`
2. **AI gateway** — `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY` (Cruxy judge/feedback stubs until set; AssemblyAI key may already be present)
3. **Drive** — share the Ethics Bowl root folder with the service account email (see secrets inventory), then set `DRIVE_ROOT_FOLDER_ID`

### Security

- Never commit `.env`, `.env.local`, service account JSON, or secrets
- `.env.example` has empty keys only
- Passcodes: argon2 hash + AES-GCM copy for tech-admin reveal; Jainam’s own is hash-only

### Design tokens

- Cardinal `#9D2235` · Gold `#F5B700` · Ink `#111318`
- Fonts: Bricolage Grotesque, Inter, IBM Plex Mono
