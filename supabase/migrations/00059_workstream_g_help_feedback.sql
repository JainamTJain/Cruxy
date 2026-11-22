-- Wave 9 G: product feedback queue (report a problem / suggest something).
-- Server uses service role. Deny anon/authenticated by default.

create table if not exists product_feedback (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  kind text not null
    check (kind in ('problem', 'suggestion')),
  page_path text not null,
  what_doing text not null,
  details text,
  screenshot_path text,
  status text not null default 'open'
    check (status in ('open', 'fixed', 'wont_fix', 'duplicate')),
  admin_note text,
  fixed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_feedback_status_created_idx
  on product_feedback (status, created_at desc);

create index if not exists product_feedback_person_idx
  on product_feedback (person_id, created_at desc);

alter table product_feedback enable row level security;
revoke all on table product_feedback from anon, authenticated;

comment on table product_feedback is
  'Wave 9 G: member reports and suggestions. Jainam triages; reporter is notified when fixed.';
