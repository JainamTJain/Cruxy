-- Workstream K Wave 7: flywheel spin cleanup.
-- Drop per-edge activity spam; track stub embeddings for re-embed.

-- ---------- 1. Clear arg_edge_recorded noise from Since you were here ----------
delete from activity_log
where action = 'arg_edge_recorded';

-- ---------- 2. Stub flags so re-embed can find gateway-rejected vectors ----------
alter table passages
  add column if not exists embedding_stub boolean not null default false;

alter table claims
  add column if not exists embedding_stub boolean not null default false;

alter table supports
  add column if not exists embedding_stub boolean not null default false;

alter table counterclaims
  add column if not exists embedding_stub boolean not null default false;

create index if not exists passages_embedding_stub_idx
  on passages (id)
  where embedding_stub = true;

create index if not exists claims_embedding_stub_or_null_idx
  on claims (id)
  where embedding is null or embedding_stub = true;

create index if not exists supports_embedding_stub_or_null_idx
  on supports (id)
  where embedding is null or embedding_stub = true;

create index if not exists counterclaims_embedding_stub_or_null_idx
  on counterclaims (id)
  where embedding is null or embedding_stub = true;

insert into app_kv (key, value, updated_at)
values (
  'graph_flywheel_spin',
  jsonb_build_object('migration', '00041', 'at', now()),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;
