-- Track 4 Team space: versioned claim maps, confirmations, chat extras, prefs, drift
-- Builds on 00001_track0_foundation.sql (case_roles, assignments, chats, messages).

-- Unique role slots per team/case (Lead 1, Lead 2, counter-arguer, supporter)
create unique index if not exists case_roles_team_case_role_uidx
  on case_roles (team_id, case_id, role);

-- Person prefs (floating Cruxy position + hide figure)
create table if not exists person_prefs (
  person_id uuid primary key references people(id) on delete cascade,
  hide_floating_cruxy boolean not null default false,
  cruxy_x real,
  cruxy_y real,
  cruxy_device text,
  updated_at timestamptz not null default now()
);

-- Versioned claim maps ("Staying on the same page")
create table if not exists claim_map_versions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  version int not null,
  body jsonb not null default '{}'::jsonb,
  change_summary text not null,
  created_by uuid references people(id),
  created_at timestamptz not null default now(),
  unique (team_id, case_id, version)
);

create table if not exists claim_map_confirmations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references claim_map_versions(id) on delete cascade,
  person_id uuid not null references people(id),
  confirmed_at timestamptz not null default now(),
  unique (version_id, person_id)
);

-- Two-person approval for changing a claim (not supports)
create table if not exists claim_change_proposals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  claim_key text not null,
  old_text text not null,
  new_text text not null,
  reason text not null,
  proposed_by uuid not null references people(id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  lead_accepter_id uuid references people(id),
  second_accepter_id uuid references people(id),
  resulting_version_id uuid references claim_map_versions(id),
  created_at timestamptz not null default now()
);

-- Alignment questions after a version change
create table if not exists alignment_questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references claim_map_versions(id) on delete cascade,
  person_id uuid not null references people(id),
  questions jsonb not null,
  answers jsonb,
  drifted boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

-- Drift flags (practice transcripts + alignment)
create table if not exists drift_flags (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  person_id uuid references people(id),
  version_id uuid references claim_map_versions(id),
  source text not null check (source in ('alignment', 'transcript', 'manual')),
  detail text not null,
  transcript_ref text,
  private_to_leads boolean not null default true,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Chat message extras: idea flag + mentions / case links
alter table messages add column if not exists is_idea boolean not null default false;
alter table messages add column if not exists mention_ids uuid[];
alter table messages add column if not exists case_id uuid references cases(id);
alter table messages add column if not exists link_refs jsonb;

-- Channel uniqueness helper
create unique index if not exists chats_channel_uidx on chats (channel);

alter table person_prefs enable row level security;
alter table claim_map_versions enable row level security;
alter table claim_map_confirmations enable row level security;
alter table claim_change_proposals enable row level security;
alter table alignment_questions enable row level security;
alter table drift_flags enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'person_prefs','claim_map_versions','claim_map_confirmations',
    'claim_change_proposals','alignment_questions','drift_flags'
  ]
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (true);',
      t || '_select_all', t
    );
  end loop;
end $$;

create policy person_prefs_upsert on person_prefs
  for all to authenticated
  using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id());
