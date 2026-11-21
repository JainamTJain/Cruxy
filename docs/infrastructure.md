# Infrastructure that already exists

No secrets here. Secret values live only in Vercel's environment variables and in a local `.env.local` that is never committed.

| Service | What exists | Notes |
| --- | --- | --- |
| GitHub | Repo `JainamTJain/Cruxy` (public, by Jainam's choice) | Never commit secrets: anyone can read it. |
| Supabase | Organization "USC Ethics Bowl (Crux)", project `crux`, ref `jwqjxsjwglukpkokpmcb`, region West US (Oregon) us-west-2, free plan | URL `https://jwqjxsjwglukpkokpmcb.supabase.co`. Row level security is on by default for new tables. Use the new publishable and secret key values in the variables Track 0 named `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. |
| Google Cloud | Project `crux-ethics-bowl-jainam-jain` under the usc.edu organization; Google Drive API enabled | Service account `crux-drive-reader@crux-ethics-bowl-jainam-jain.iam.gserviceaccount.com`, no project roles. Its JSON key goes in `GOOGLE_SERVICE_ACCOUNT_JSON`. The Drive folder "Ethics Bowl 2026 CA Regional" (`DRIVE_ROOT_FOLDER_ID=107T2YG-6MWUhRzy_EM_k2t4x5eyJQh64`, owned by Dr. B, Jainam is an editor) is shared with it as Viewer since Nov 21, 2026. |
| AssemblyAI | Account with API key | $50 free credit on sign up. |
| Vercel | Team "Jainam Jain" (`vercel.com/jainam-jain`, Hobby, renamed from InnovateLA), project `cruxy` importing `JainamTJain/Cruxy`, deploys from `main` | AI Gateway key is created in the same team. |
| Resend | Account | Sender domain not set up yet; use Resend's test sender until it is. |

## Environment variables

See `.env.example` (from Track 0) for the full list and what each one is. Where each value comes from:

| Variable | Where to get it |
| --- | --- |
| `SUPABASE_URL` | `https://jwqjxsjwglukpkokpmcb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, project `crux`, Project Settings, API Keys, the **secret** key (`sb_secret_...`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page, the **publishable** key (`sb_publishable_...`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud, IAM, Service accounts, `crux-drive-reader`, Keys, Add key, JSON; paste the whole file contents |
| `DRIVE_ROOT_FOLDER_ID` | `107T2YG-6MWUhRzy_EM_k2t4x5eyJQh64` (Ethics Bowl 2026 CA Regional) |
| `ASSEMBLYAI_API_KEY` | AssemblyAI dashboard |
| `AI_GATEWAY_API_KEY` | Vercel, team Jainam Jain (`vercel.com/jainam-jain`), AI Gateway, API Keys, key `crux-production` (on Vercel deployments OIDC also works) |
| `EMAIL_API_KEY` | Resend, API Keys, sending access |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `PASSCODE_VIEW_KEY` | `openssl rand -base64 32` (32 bytes for AES-256-GCM) |
| `INITIAL_ADMIN_CODE_HASH` | argon2id hash of Jainam's admin passcode, made on his own computer |
| `MONTHLY_CAP_USD` | `30` |
