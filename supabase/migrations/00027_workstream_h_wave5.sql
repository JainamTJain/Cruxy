-- Workstream H Wave 5: book upload metadata + Cruxy outcomes grading
-- Next free migration after 00019.

alter table book_requests
  add column if not exists upload_path text;

alter table book_requests
  add column if not exists library_file_id uuid;

create table if not exists cruxy_outcomes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id),
  feedback_id uuid,
  advice_ref text,
  agent text not null,
  case_id uuid references cases(id),
  round_id uuid,
  followed boolean,
  score_before numeric,
  score_after numeric,
  score_delta numeric,
  judge_agreed boolean,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references people(id)
);

create index if not exists cruxy_outcomes_person_idx
  on cruxy_outcomes (person_id, created_at desc);

create index if not exists cruxy_outcomes_agent_idx
  on cruxy_outcomes (agent, created_at desc);

alter table cruxy_outcomes enable row level security;
revoke all on table cruxy_outcomes from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'crux-uploads',
    'crux-uploads',
    false,
    52428800,
    array['application/pdf', 'text/plain', 'application/octet-stream']
  )
on conflict (id) do nothing;

drop policy if exists crux_uploads_no_anon on storage.objects;
create policy crux_uploads_no_anon on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'crux-uploads' and false)
  with check (bucket_id = 'crux-uploads' and false);
