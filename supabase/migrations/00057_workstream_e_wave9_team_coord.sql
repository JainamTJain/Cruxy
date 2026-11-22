-- Workstream E Wave 9: team coordination (calendar, polls, kudos).
-- Migration reserved in wave9.md: E = 00057.

-- Shared team calendar events
create table if not exists team_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null,
  kind text not null default 'practice'
    check (kind in ('practice', 'round', 'deadline', 'poll', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  place text,
  online boolean not null default false,
  body text,
  practice_session_id uuid references sessions(id) on delete set null,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists team_events_team_starts_idx
  on team_events (team_id, starts_at);

alter table team_events enable row level security;
revoke all on table team_events from anon, authenticated;

comment on table team_events is
  'Shared team calendar: practices, rounds, deadlines. Optional link to practice sessions for attendance.';

-- Personal calendar subscribe tokens (.ics)
create table if not exists calendar_feed_tokens (
  person_id uuid primary key references people(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table calendar_feed_tokens enable row level security;
revoke all on table calendar_feed_tokens from anon, authenticated;

comment on table calendar_feed_tokens is
  'Private token per person for unauthenticated .ics calendar subscribe.';

-- Availability polls
create table if not exists availability_polls (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null,
  slots jsonb not null default '[]'::jsonb,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  closes_at timestamptz,
  chosen_slot_id text,
  resulting_event_id uuid references team_events(id) on delete set null
);

alter table availability_polls enable row level security;
revoke all on table availability_polls from anon, authenticated;

comment on table availability_polls is
  'Lead proposes time slots; members tap which work; best becomes a calendar event.';

create table if not exists availability_poll_votes (
  poll_id uuid not null references availability_polls(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  slot_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (poll_id, person_id)
);

alter table availability_poll_votes enable row level security;
revoke all on table availability_poll_votes from anon, authenticated;

-- Kudos / peer notes (no ranking)
create table if not exists peer_kudos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  from_person_id uuid not null references people(id) on delete cascade,
  to_person_id uuid not null references people(id) on delete cascade,
  body text not null,
  round_id uuid,
  case_id uuid references cases(id) on delete set null,
  created_at timestamptz not null default now(),
  check (char_length(body) <= 500),
  check (from_person_id <> to_person_id)
);

create index if not exists peer_kudos_to_idx on peer_kudos (to_person_id, created_at desc);
create index if not exists peer_kudos_team_idx on peer_kudos (team_id, created_at desc);

alter table peer_kudos enable row level security;
revoke all on table peer_kudos from anon, authenticated;

comment on table peer_kudos is
  'Short peer notes after a round. Shown in notifications and on personal progress. No ranking.';
