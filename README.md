# Crux

Web app for USC’s three Ethics Bowl teams.

**Building with Cursor:** start every chat by @-mentioning `AGENTS.md` and the track file in `docs/tracks/`. Everything about the product is indexed in `docs/README.md`. **Cruxy** is the built-in thinking partner (users never see “AI” or model names).

## Tracks landed

| Track | Status |
|-------|--------|
| **0 Foundation** | Auth, schema/RLS, `callCruxy`, activity log, design tokens |
| **1 Library** | Drive sync + digest, reading room, search, nightly research, book requests |
| **2 Case brain** | Claim maps, Truth Sources queue, Inspired-by, Analyst, opposing positions, robustness |
| **6 Admin** (this branch) | Program map, admin console, spend, consent/activity, calibration, weekly email, Cruxy admin mode, competition log |

### Local / sample-data path

Supabase, AI gateway, and `DRIVE_ROOT_FOLDER_ID` may still be missing. With `USE_SAMPLE_DATA=1` (default when Supabase is unset), the app uses a local JSON store under `.data/` (gitignored) and **sample Drive stubs** when the folder id is unset.

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
npm run check:track6
```

Track 6 checks: Dr. B cannot change codes/caps; weekly email only to opted-in admins; spend totals match `ai_calls`.

### Library (Track 1)

- **Sync now** on `/library` (and Vercel cron `0 7 * * *` → `/api/cron/drive-sync`)
- Digests only new/changed files (checksum + modified time)
- Reading room, search, sorting queue; nightly research cron; book requests at `/admin/books`

### Weekly summary cron (Track 6)

`vercel.json` also schedules `GET /api/cron/weekly-summary` for Monday 02:00 UTC (Sunday 6 pm Pacific). Set `CRON_SECRET`. Without `EMAIL_API_KEY`, sends are stubbed into the activity log — only opted-in admins.

### Still needed from Jainam for production

1. **Supabase** — apply `00001_track0_foundation.sql`, `00002_track2_case_brain.sql`, `00003_track1_library.sql`, `00004_track6_admin.sql`, and `supabase/seed.sql`
2. **AI gateway** — `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY`
3. **Drive** — share the Ethics Bowl root with the service account, set `DRIVE_ROOT_FOLDER_ID`
4. **Email** — `EMAIL_API_KEY` (Resend) for live weekly summary
5. Optional: `CRON_SECRET` for cron routes

### Security

- Never commit `.env`, `.env.local`, service account JSON, or secrets
- `.env.example` has empty keys only
- Passcodes: argon2 hash + AES-GCM copy for tech-admin reveal; Jainam’s own is hash-only
- Dr. B cannot change passcodes, spend caps, books, or calibration
- Book requests RLS / API: tech admin only

### Design tokens

- Cardinal `#9D2235` · Gold `#F5B700` · Ink `#111318`
- Fonts: Bricolage Grotesque, Inter, IBM Plex Mono
