-- Workstream K Wave 9: passcode reset requests, signed-in devices.
-- RLS on; client JWT roles revoked (server uses service role).

create table if not exists passcode_reset_requests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'completed', 'denied', 'expired')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references people (id) on delete set null,
  completed_at timestamptz,
  expires_at timestamptz not null,
  ip_hash text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists passcode_reset_requests_person_created_idx
  on passcode_reset_requests (person_id, created_at desc);

create index if not exists passcode_reset_requests_status_idx
  on passcode_reset_requests (status)
  where status in ('pending', 'approved');

alter table passcode_reset_requests enable row level security;
revoke all on table passcode_reset_requests from anon, authenticated;

comment on table passcode_reset_requests is
  'Wave 9 K: forgot-passcode requests. Coach or tech admin approves; person sets a new code. Never stores or reveals the old passcode.';

create table if not exists auth_devices (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  label text not null default 'Browser',
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists auth_devices_person_active_idx
  on auth_devices (person_id, last_seen_at desc)
  where revoked_at is null;

alter table auth_devices enable row level security;
revoke all on table auth_devices from anon, authenticated;

comment on table auth_devices is
  'Wave 9 K: signed-in devices. Revoking signs that browser out; session JWT carries device id.';
