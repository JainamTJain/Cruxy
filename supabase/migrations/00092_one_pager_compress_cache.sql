-- Cache for Cruxy-compressed one-pager section lines (keyed by content hash).
create table if not exists public.one_pager_compress_cache (
  id uuid primary key,
  content_hash text not null unique,
  section_key text not null,
  source_preview text,
  compressed text not null,
  case_id uuid references public.cases (id) on delete set null,
  team_id uuid references public.teams (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists one_pager_compress_cache_hash_idx
  on public.one_pager_compress_cache (content_hash);

alter table public.one_pager_compress_cache enable row level security;

revoke all on public.one_pager_compress_cache from anon, authenticated;

-- Server uses the service role; deny client roles by default.
