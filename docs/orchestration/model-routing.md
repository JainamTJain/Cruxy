# Workstream M: Cruxy model routing (decided by Jainam, Nov 21, 2026)

Jainam chose these models. Do not substitute, add or "improve" them. Changing them later is an admin setting, not a code change.

| Tier | Primary | Backup (only if every provider of the primary fails) | Used for |
| --- | --- | --- | --- |
| `small` | `openai/gpt-6-luna` | `google/gemini-3.8-flash` | Librarian, Moderator, Coach cards, Assistant default, Researcher search and reading, digests, tagging, flashcards |
| `strong` | `openai/gpt-6.2-sol` | `google/gemini-4-carbon` | Judge, Opponent, Analyst, Coach Socratic, Researcher verification, Assistant when asked to reason |
| `embed` | `openai/text-embedding-3-small` (1536 dims, matches `vector(1536)`) | `google/text-embedding-005` is NOT a drop-in (different vectors); no embedding fallback, fail and retry instead | Library and passage search |

Reasoning effort per call: Luna `none` for tagging and sorting, `low` for the assistant and moderator; Sol `low` for live practice turns (opponent, moderator during a round, so latency stays near a second), `medium` for judging, analyst and coaching.

## Hard rules

1. **One path only.** All calls go through `callCruxy()` and the Vercel AI SDK (`ai` package) using AI Gateway model strings with `AI_GATEWAY_API_KEY`. Remove the unused `@ai-sdk/openai` dependency from `package.json` and the lockfile. No provider SDKs, no provider keys, no Anthropic anywhere, no OpenRouter path (delete the `OPENROUTER_API_KEY` branch in `hasAiKey`).
2. **Privacy on every request:** pass AI Gateway per-request zero data retention in `providerOptions.gateway` (see https://vercel.com/docs/ai-gateway/security-and-compliance/zdr and the AI SDK gateway ZDR example). It is free per request once the team has purchased credits. If ZDR leaves no provider, the call must fail and be logged, never silently route elsewhere.
3. **No batch API.** ZDR rejects batch jobs, so nightly work uses normal requests.
4. **Fallbacks** via `providerOptions.gateway.models` (https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks), read from settings, not hardcoded in call sites.
5. **Real cost.** Log the cost the Gateway returns (`providerMetadata.gateway.cost`) and the model that actually answered (primary or backup) to `ai_calls`. Keep the existing caps and refusal logic exactly; only replace the stub branches.
6. **Prompt caching:** keep the Cruxy rules and case card as a fixed prefix so cached input pricing applies.

## Data

- Migration `00010_model_settings.sql`: table `model_settings (tier text primary key check (tier in ('small','strong','embed')), model text not null, fallbacks text[] not null default '{}', effort_default text, updated_at timestamptz, updated_by uuid)`. Seed the three rows above. RLS on, no anon or authenticated policies, `revoke all ... from anon, authenticated` (server uses the service role). Every change writes `activity_log`.
- Settings are read through a small cached function (60 s) in `src/lib/cruxy/models.ts`. Use the shared Supabase server client from Workstream 0 once it is on `main`; until then read the same defaults from a constant so sample mode works.

## Call sites

Existing call sites pass ad hoc names. Normalize: `small`, `analyst-small`, `cruxy-default`, `cruxy-admin` → `small`; `strong` → `strong`. Add a `tier` field to `CallCruxyInput` (`'small' | 'strong'`) and an optional `effort`. Keep `model` out of call sites.

## Done means

- `npm run typecheck`, `npm run build` pass.
- `scripts/cruxy-live-check.ts`: with a real `AI_GATEWAY_API_KEY`, one tiny `small` call and one tiny `strong` call succeed, ZDR is set, cost is logged, and a forced-failure test (bad primary id in a temp setting) proves the fallback answers. Prints model used and cost; never prints keys.
- `git grep -i "anthropic\|openrouter\|@ai-sdk/openai"` in `src/` and `package.json` returns nothing.
- The admin model settings UI belongs to Workstream G (Admin); expose `getModelSettings()` and `updateModelSettings()` for it and do not build UI here.

Owns: `src/lib/cruxy/callCruxy.ts`, `src/lib/cruxy/models.ts`, `supabase/migrations/00010_model_settings.sql`, `scripts/cruxy-live-check.ts`, `package.json` (dependency removal only), and the one-line tier changes at existing call sites.
