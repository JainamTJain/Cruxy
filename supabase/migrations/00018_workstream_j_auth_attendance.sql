-- Workstream J: roles history, attendance confirm flow, champions, in-app notifications.
-- Applied tables from 00001 stay; this hardens and adds what F-018 / F-071–F-077 need.

-- Team membership history: one open row per person, backfill from people.team_id
insert into team_memberships (person_id, team_id, from_at, to_at, created_by)
select p.id, p.team_id, coalesce(p.created_at, now()), null, null
from people p
where p.team_id is not null
  and not exists (
    select 1 from team_memberships tm
    where tm.person_id = p.id and tm.to_at is null
  );

create unique index if not exists team_memberships_one_open_per_person
  on team_memberships (person_id)
  where to_at is null;

-- Close old row + open new when people.team_id changes (admins only via service role)
create or replace function crux_sync_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.team_id is distinct from old.team_id then
    update team_memberships
      set to_at = now()
      where person_id = new.id and to_at is null;
    if new.team_id is not null then
      insert into team_memberships (person_id, team_id, from_at, created_by)
      values (new.id, new.team_id, now(), new.created_by);
    end if;
  elsif tg_op = 'INSERT' and new.team_id is not null then
    if not exists (
      select 1 from team_memberships tm
      where tm.person_id = new.id and tm.to_at is null
    ) then
      insert into team_memberships (person_id, team_id, from_at, created_by)
      values (new.id, new.team_id, now(), new.created_by);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists people_team_membership_sync on people;
create trigger people_team_membership_sync
  after insert or update of team_id on people
  for each row execute function crux_sync_team_membership();

-- Attendance: statuses, sources, unique row, optional Cruxy suggestion + admin confirm
do $$ begin
  alter table attendance
    add column if not exists suggested boolean not null default false;
exception when others then null;
end $$;

do $$ begin
  alter table attendance
    add column if not exists confirmed_by uuid references people(id);
exception when others then null;
end $$;

do $$ begin
  alter table attendance
    add column if not exists confirmed_at timestamptz;
exception when others then null;
end $$;

-- Tighten status / source when present (null allowed for legacy empty rows)
do $$ begin
  alter table attendance drop constraint if exists attendance_status_check;
  alter table attendance
    add constraint attendance_status_check
    check (status is null or status in ('present', 'late', 'absent'));
exception when others then null;
end $$;

do $$ begin
  alter table attendance drop constraint if exists attendance_source_check;
  alter table attendance
    add constraint attendance_source_check
    check (source is null or source in ('admin', 'self', 'voice', 'join'));
exception when others then null;
end $$;

create unique index if not exists attendance_session_person_uidx
  on attendance (session_id, person_id)
  where session_id is not null and person_id is not null;

-- One champion per team (F-077)
do $$ begin
  alter table teams
    add column if not exists champion_person_id uuid references people(id);
exception when others then null;
end $$;

-- In-app reminders / champion nudges (F-074, F-077); email stays on people prefs
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists notifications_person_unread_idx
  on notifications (person_id, created_at desc)
  where read_at is null;

alter table notifications enable row level security;
revoke all on table notifications from anon, authenticated;

-- First-admin digest prompt (F-070) and first-run completion
do $$ begin
  alter table people
    add column if not exists digest_prompted_at timestamptz;
exception when others then null;
end $$;

do $$ begin
  alter table people
    add column if not exists first_run_completed_at timestamptz;
exception when others then null;
end $$;

-- Voice sample paths use Storage object keys voice-samples/{person_id}.webm
-- (bucket provisioned in the Supabase project; app uploads with the service role).
