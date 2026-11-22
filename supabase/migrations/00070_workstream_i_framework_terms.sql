-- Workstream I: in-place framework / term explainers.
-- Cache Cruxy's "how this applies to this case" lines (cited only).

create table if not exists framework_case_applies (
  id uuid primary key default gen_random_uuid(),
  term_id text not null,
  case_id uuid not null references cases (id) on delete cascade,
  apply_text text not null,
  citation_ids text[] not null default '{}',
  source_url text not null,
  created_at timestamptz not null default now(),
  created_by uuid references people (id) on delete set null,
  unique (term_id, case_id),
  constraint framework_case_applies_has_citations
    check (cardinality(citation_ids) > 0)
);

create index if not exists framework_case_applies_case_idx
  on framework_case_applies (case_id);

alter table framework_case_applies enable row level security;
revoke all on table framework_case_applies from anon, authenticated;

comment on table framework_case_applies is
  'Wave 9 I: cached, cited lines for how a framework applies to one case. Empty citation_ids never stored.';
