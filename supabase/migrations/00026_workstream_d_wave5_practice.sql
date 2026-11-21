-- Workstream D Wave 5: recording layouts, per-device ownership, bank commitments.
-- RLS deny by default; service role only.

alter table rounds
  add column if not exists recording_layout text not null default 'room';

do $$ begin
  alter table rounds
    drop constraint if exists rounds_recording_layout_check;
  alter table rounds
    add constraint rounds_recording_layout_check
    check (recording_layout in ('room', 'own_device', 'mixed'));
exception when others then null;
end $$;

alter table recordings
  add column if not exists owner_person_id uuid references people(id),
  add column if not exists started_at timestamptz;

create table if not exists bank_commitments (
  id uuid primary key default gen_random_uuid(),
  bank_entry_id uuid not null references bank_entries(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  roadmap_stage_id uuid references roadmap_stages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bank_entry_id, person_id)
);

alter table bank_commitments enable row level security;
revoke all on table bank_commitments from anon, authenticated;
