-- Workstream I: privacy, operations and reliability.
-- Storage buckets for audio / voice samples / backups; judging portal
-- brute-force tracking; season export metadata. RLS deny by default.

-- ---------- Storage buckets (private; service role only) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio-chunks', 'audio-chunks', false, 52428800, array[
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'application/octet-stream'
  ]),
  ('voice-samples', 'voice-samples', false, 10485760, array[
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'application/octet-stream'
  ]),
  ('backups', 'backups', false, 104857600, array[
    'application/json', 'application/gzip', 'application/octet-stream', 'text/plain'
  ])
on conflict (id) do nothing;

-- Deny anon / authenticated direct storage access (server uses service role).
drop policy if exists audio_chunks_no_anon on storage.objects;
drop policy if exists voice_samples_no_anon on storage.objects;
drop policy if exists backups_no_anon on storage.objects;

-- No policies for anon/authenticated on these buckets → deny by default under RLS.
-- Keep buckets private; only the service role bypasses RLS.

-- ---------- Judging portal brute-force attempts ----------
create table if not exists portal_attempts (
  id uuid primary key default gen_random_uuid(),
  portal text not null check (portal in ('judging', 'session_code')),
  ip_hash text not null,
  target text,
  failures int not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists portal_attempts_portal_ip_uidx
  on portal_attempts (portal, ip_hash);

create index if not exists portal_attempts_locked_idx
  on portal_attempts (locked_until)
  where locked_until is not null;

alter table portal_attempts enable row level security;
revoke all on portal_attempts from anon;
revoke all on portal_attempts from authenticated;

-- ---------- Season export / archive metadata ----------
create table if not exists season_exports (
  id uuid primary key default gen_random_uuid(),
  season_label text not null,
  storage_path text not null,
  byte_size bigint not null default 0,
  table_counts jsonb not null default '{}'::jsonb,
  created_by uuid references people(id),
  created_at timestamptz not null default now()
);

alter table season_exports enable row level security;
revoke all on season_exports from anon;
revoke all on season_exports from authenticated;

-- Tech admin may read export metadata when using a future authenticated path.
create policy season_exports_tech_select on season_exports
  for select to authenticated
  using (public.is_tech_admin());

-- ---------- Logical backup run log ----------
create table if not exists backup_runs (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  byte_size bigint not null default 0,
  table_counts jsonb not null default '{}'::jsonb,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

alter table backup_runs enable row level security;
revoke all on backup_runs from anon;
revoke all on backup_runs from authenticated;

create policy backup_runs_tech_select on backup_runs
  for select to authenticated
  using (public.is_tech_admin());
