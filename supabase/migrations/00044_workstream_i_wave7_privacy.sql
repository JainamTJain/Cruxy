-- Workstream I Wave 7: privacy and licence policy stamp.
-- Research: store full text only for open licence / public domain sources;
--   paywalled material is citation + short quote, or a material request for Jainam.
-- Roles board: team-scoped edits; notify only people whose role cell changed.
-- Mood events: no personal fields in payloads.
-- Voice samples: private voice-samples bucket; person may delete their own sample.
-- Helpers: src/lib/ops/privacy-licence.ts, privacy-scope.ts

insert into app_kv (key, value, updated_at)
values (
  'privacy_wave7',
  jsonb_build_object(
    'migration', '00044',
    'at', now(),
    'research', jsonb_build_object(
      'full_text', 'open_licence_or_public_domain_only',
      'closed', 'citation_plus_short_quote',
      'paywall', 'never_fetch_past',
      'material_requests', 'tech_admin_jainam_only'
    ),
    'roles_board', jsonb_build_object(
      'edit', 'own_team_or_admin_view',
      'notify', 'affected_people_only'
    ),
    'mood_events', 'no_personal_data',
    'voice_samples', jsonb_build_object(
      'bucket', 'voice-samples',
      'public', false,
      'self_delete', true
    )
  ),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

-- Re-assert private voice-samples bucket (service role only; no anon policies).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-samples',
  'voice-samples',
  false,
  10485760,
  array[
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set public = false;

drop policy if exists voice_samples_no_anon on storage.objects;
drop policy if exists voice_samples_anon_read on storage.objects;
drop policy if exists voice_samples_authenticated_read on storage.objects;

-- When H lands material_requests, keep it closed to client JWT roles.
do $$
begin
  if to_regclass('public.material_requests') is not null then
    execute 'alter table material_requests enable row level security';
    execute 'revoke all on table material_requests from anon, authenticated';
  end if;
end $$;

-- book_requests stay tech-only (existing pattern for Jainam's queue).
alter table if exists book_requests enable row level security;
revoke all on table book_requests from anon, authenticated;
