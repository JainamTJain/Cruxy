-- Workstream I Wave 6: privacy policy stamp.
-- Route handlers enforce personal vs shared reads (service role bypasses RLS).
-- Shared across teams: claim nodes, robustness scores, arg_edges.
-- Personal (self + case leads where the plan says so + coach/tech admin view):
--   mastery, Brier, predictions, Socratic outcomes, phrasebook, private drift.
-- Tech only: auth_codes, passcode copies, ai_calls, book_requests, judge weights.
-- Helpers: src/lib/ops/privacy-scope.ts

insert into app_kv (key, value, updated_at)
values (
  'privacy_wave6',
  jsonb_build_object(
    'migration', '00036',
    'at', now(),
    'shared', jsonb_build_array(
      'claim_nodes',
      'claim_maps',
      'robustness_scores',
      'arg_edges'
    ),
    'personal', jsonb_build_array(
      'mastery',
      'brier',
      'predictions',
      'socratic_outcomes',
      'socratic_sessions',
      'phrasebook',
      'card_reviews',
      'private_drift_flags',
      'redos'
    ),
    'tech_only', jsonb_build_array(
      'auth_codes',
      'passcode_copies',
      'ai_calls',
      'book_requests',
      'judge_weights'
    )
  ),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

-- Re-assert: personal outcomes table stays closed to anon / authenticated.
alter table if exists cruxy_outcomes enable row level security;
revoke all on table cruxy_outcomes from anon, authenticated;

-- Graph spine (K 00028) is shared team content; keep revoke if present.
do $$
begin
  if to_regclass('public.arg_edges') is not null then
    execute 'alter table arg_edges enable row level security';
    execute 'revoke all on table arg_edges from anon, authenticated';
  end if;
end $$;
