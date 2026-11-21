-- Workstream M: model tier settings (primary + fallbacks), chosen by Jainam.
-- Server-only via service role; no anon / authenticated access.

create table if not exists model_settings (
  tier text primary key check (tier in ('small', 'strong', 'embed')),
  model text not null,
  fallbacks text[] not null default '{}',
  effort_default text,
  updated_at timestamptz not null default now(),
  updated_by uuid references people(id)
);

insert into model_settings (tier, model, fallbacks, effort_default) values
  ('small', 'openai/gpt-6-luna', array['google/gemini-3.8-flash'], 'low'),
  ('strong', 'openai/gpt-6.2-sol', array['google/gemini-4-carbon'], 'medium'),
  ('embed', 'openai/text-embedding-3-small', '{}', null)
on conflict (tier) do update set
  model = excluded.model,
  fallbacks = excluded.fallbacks,
  effort_default = excluded.effort_default,
  updated_at = now();

alter table model_settings enable row level security;

-- No policies for anon or authenticated: only the service role (server) can read/write.
revoke all on model_settings from anon, authenticated;
