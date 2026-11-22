-- Workstream D: voiceprint embeddings for group speaker matching.
-- Raw enrollment audio is deleted after the embedding is stored (same rule as practice audio).
-- RLS: deny anon by default; all access is server-side via the service role.

alter table people
  add column if not exists voiceprint real[],
  add column if not exists voiceprint_at timestamptz,
  add column if not exists voiceprint_meta jsonb not null default '{}'::jsonb;

comment on column people.voiceprint is
  'ECAPA-TDNN 192-dim unit voiceprint; raw enrollment audio deleted after this is set.';
comment on column people.voiceprint_meta is
  'Enrollment quality notes (parts, voiced seconds, consistency). No audio bytes.';

-- Pending low-confidence speaker matches: 5s clip kept until the session confirms Who is this?
create table if not exists speaker_match_pending (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  speaker_label text not null,
  clip_path text,
  candidates jsonb not null default '[]'::jsonb,
  embedding real[],
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_person_id uuid references people(id) on delete set null,
  unique (round_id, speaker_label)
);

alter table speaker_match_pending enable row level security;

drop policy if exists "deny anon speaker_match_pending" on speaker_match_pending;
create policy "deny anon speaker_match_pending"
  on speaker_match_pending
  for all
  to anon
  using (false)
  with check (false);

-- Wave 7: revoke client roles; all access is service-role server side.
revoke all on table speaker_match_pending from anon, authenticated;

-- Re-assert: Who-is-this clips live in private audio-chunks (no public URL).
-- voice-samples remains private (00012 / 00044). No getPublicUrl for either.

-- Confidence + source on speaker_confirms mappings (jsonb already flexible; document shape).
comment on column speaker_confirms.mappings is
  '[{speaker_label, person_id, confidence?, source?: voiceprint|name|role|manual}]';

create index if not exists speaker_match_pending_round_idx
  on speaker_match_pending (round_id)
  where resolved_at is null;
