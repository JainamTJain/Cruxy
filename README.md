# Crux

Web app for USC’s three Ethics Bowl teams. **Cruxy** is the built-in thinking partner (users never see “AI” or model names).

## Tracks

- **Track 0 Foundation** — auth, schema/RLS, `callCruxy`, design tokens, sample-data path
- **Track 4 Team space** — assignments/roles, team board + chat, floating Cruxy/lamp + drawer, versioned claim maps + drift

### Local / sample-data path

Supabase and AI gateway keys may still be missing. With `USE_SAMPLE_DATA=1` (default when Supabase unset), the app uses a local JSON store under `.data/` (gitignored).

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
npx tsx scripts/track0-checks.ts
npx tsx scripts/track4-checks.ts
```

### Still needed from Jainam for production

1. **Supabase** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; apply `supabase/migrations/00001_track0_foundation.sql` + `00002_track4_team_space.sql` + `supabase/seed.sql`
2. **AI gateway** — `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY`
3. **Drive** — share the Ethics Bowl root folder with the service account email (see secrets inventory), then set `DRIVE_ROOT_FOLDER_ID`
4. **Cruxy art** — replace placeholder PNGs in `/public/cruxy/` with final transparent sprites when available

### Security

- Never commit `.env`, `.env.local`, service account JSON, or secrets
- `.env.example` has empty keys only
- Passcodes: argon2 hash + AES-GCM copy for tech-admin reveal; Jainam’s own is hash-only

### Design tokens

- Cardinal `#9D2235` · Gold `#F5B700` · Ink `#111318`
- Fonts: Bricolage Grotesque, Inter, IBM Plex Mono
