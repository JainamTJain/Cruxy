# Crux

Web app for USC’s three Ethics Bowl teams. **Cruxy** is the built-in thinking partner (users never see “AI” or model names).

## Tracks

- **Track 0 Foundation** (merged): schema, auth, consent, Passcodes, `callCruxy`, activity log, design tokens.
- **Track 6 Admin** (this branch): program map, admin console, spend dashboard, consent/activity, calibration, weekly summary email, Cruxy admin mode, competition log, Is Crux working?

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
npx tsx scripts/track6-checks.ts
```

Track 6 checks: Dr. B cannot change codes/caps; weekly email only to opted-in admins; spend totals match `ai_calls`.

### Weekly summary cron

`vercel.json` schedules `GET /api/cron/weekly-summary` for Monday 02:00 UTC (Sunday 6 pm Pacific). Set `CRON_SECRET` and send `Authorization: Bearer $CRON_SECRET`. Without `EMAIL_API_KEY`, sends are stubbed and logged to the activity log — still only for admins with `digest_opt_in` + email.

### Still needed from Jainam for production

1. **Supabase** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; apply `supabase/migrations/00001_track0_foundation.sql`, `00002_track6_admin.sql` + `supabase/seed.sql`
2. **AI gateway** — `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY`
3. **Drive** — share the Ethics Bowl root folder with the service account email (see secrets inventory), then set `DRIVE_ROOT_FOLDER_ID`
4. **Email** — `EMAIL_API_KEY` (Resend) for live weekly summary

### Security

- Never commit `.env`, `.env.local`, service account JSON, or secrets
- `.env.example` has empty keys only
- Passcodes: argon2 hash + AES-GCM copy for tech-admin reveal; Jainam’s own is hash-only
- Dr. B cannot change passcodes, spend caps, books, or calibration

### Design tokens

- Cardinal `#9D2235` · Gold `#F5B700` · Ink `#111318`
- Fonts: Bricolage Grotesque, Inter, IBM Plex Mono
