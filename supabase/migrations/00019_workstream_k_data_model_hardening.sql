-- Workstream K: data model hardening (F-306–F-332, stack F-373).
-- Applied after 00001–00012 and 00018. Never edit those.
--
-- Crux has no Supabase Auth users: every route uses the service role
-- after checking crux_session. Client roles (anon, authenticated) must
-- not read or write any app table. Newer migrations already follow that
-- pattern; this brings 00001–00007 tables into line, adds hot-path
-- indexes, and tightens origin checks from the Data model section.

-- ---------- 1. Drop client JWT policies (deny by default under RLS) ----------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  end loop;
end $$;

-- Storage object policies (if any) for our private buckets: keep deny-by-default.
drop policy if exists audio_chunks_no_anon on storage.objects;
drop policy if exists voice_samples_no_anon on storage.objects;
drop policy if exists backups_no_anon on storage.objects;

-- ---------- 2. Revoke anon + authenticated on every public table ----------
do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p') -- tables / partitioned
  loop
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end $$;

-- Security-definer helpers and views: no direct client use.
revoke all on function public.current_person_id() from anon, authenticated;
revoke all on function public.current_role() from anon, authenticated;
revoke all on function public.is_admin() from anon, authenticated;
revoke all on function public.is_tech_admin() from anon, authenticated;

do $$ begin
  revoke all on table judges_public from anon, authenticated;
exception when undefined_table then null;
end $$;

do $$ begin
  revoke all on table sessions_public from anon, authenticated;
exception when undefined_table then null;
end $$;

do $$ begin
  revoke all on table library_sorting_queue from anon, authenticated;
exception when undefined_table then null;
end $$;

-- match_passages already service_role-only in 00011; re-assert.
do $$ begin
  revoke all on function match_passages(vector, uuid, int) from public, anon, authenticated;
  grant execute on function match_passages(vector, uuid, int) to service_role;
exception when undefined_function then null;
end $$;

-- ---------- 3. Hot-path indexes (team/case/person/round filters) ----------
create index if not exists people_team_id_idx on people (team_id);
create index if not exists people_role_idx on people (role);

create index if not exists team_memberships_person_idx on team_memberships (person_id);
create index if not exists team_memberships_team_idx on team_memberships (team_id);

create index if not exists auth_codes_person_kind_idx on auth_codes (person_id, kind);

create index if not exists claims_team_case_idx on claims (team_id, case_id);
create index if not exists supports_team_case_idx on supports (team_id, case_id);
create index if not exists supports_claim_id_idx on supports (claim_id);
create index if not exists backings_support_id_idx on backings (support_id);
create index if not exists counterclaims_team_case_idx on counterclaims (team_id, case_id);

create index if not exists truth_items_team_case_idx on truth_items (team_id, case_id);
create index if not exists proposals_team_case_status_idx on proposals (team_id, case_id, status);
create index if not exists decisions_proposal_id_idx on decisions (proposal_id);

create index if not exists case_roles_team_case_idx on case_roles (team_id, case_id);
create index if not exists assignments_team_case_idx on assignments (team_id, case_id);
create index if not exists assignments_person_idx on assignments (person_id);

create index if not exists flashcards_team_case_idx on flashcards (team_id, case_id);
create index if not exists card_reviews_person_card_idx on card_reviews (person_id, card_id);
create index if not exists questions_case_id_idx on questions (case_id);
create index if not exists answers_question_id_idx on answers (question_id);
create index if not exists roadmap_stages_person_case_idx on roadmap_stages (person_id, case_id);

create index if not exists rounds_session_id_idx on rounds (session_id);
create index if not exists rounds_case_id_idx on rounds (case_id);
create index if not exists attendance_session_idx on attendance (session_id);
create index if not exists recordings_round_id_idx on recordings (round_id);
create index if not exists transcript_lines_round_id_idx on transcript_lines (round_id);
create index if not exists judge_cards_round_id_idx on judge_cards (round_id);
create index if not exists card_scores_card_id_idx on card_scores (card_id);
create index if not exists feedback_items_round_id_idx on feedback_items (round_id);
create index if not exists feedback_items_person_idx on feedback_items (person_id);
create index if not exists redos_feedback_item_idx on redos (feedback_item_id);

create index if not exists messages_chat_id_idx on messages (chat_id);
create index if not exists research_runs_case_id_idx on research_runs (case_id);

create index if not exists ai_calls_created_at_idx on ai_calls (created_at desc);
create index if not exists ai_calls_feature_created_idx on ai_calls (feature, created_at desc);
create index if not exists ai_calls_person_created_idx on ai_calls (person_id, created_at desc);
create index if not exists activity_log_at_idx on activity_log (at desc);
create index if not exists activity_log_person_at_idx on activity_log (person_id, at desc);

create index if not exists highlights_passage_id_idx on highlights (passage_id);
create index if not exists comments_passage_id_idx on comments (passage_id);

-- ---------- 4. Spec origin / status checks (null kept for legacy empty rows) ----------
-- Proposal origins from Data model + app's "member" origin used in seed/case-brain.
do $$ begin
  alter table proposals drop constraint if exists proposals_origin_check;
  alter table proposals
    add constraint proposals_origin_check
    check (
      origin is null
      or origin in (
        'transcript',
        'research',
        'reading',
        'inspired_by_team',
        'member'
      )
    );
exception when others then
  raise notice 'proposals_origin_check skipped: %', sqlerrm;
end $$;

do $$ begin
  alter table proposals drop constraint if exists proposals_status_check;
  alter table proposals
    add constraint proposals_status_check
    check (
      status is null
      or status in ('pending', 'accepted', 'rejected', 'edited')
    );
exception when others then
  raise notice 'proposals_status_check skipped: %', sqlerrm;
end $$;

-- Moderator bank origins from Data model.
do $$ begin
  alter table questions drop constraint if exists questions_origin_check;
  alter table questions
    add constraint questions_origin_check
    check (
      origin is null
      or origin in ('dr_b', 'cruxy', 'member', 'asked_at_round')
    );
exception when others then
  raise notice 'questions_origin_check skipped: %', sqlerrm;
end $$;

-- Decisions: reason must be non-empty when present (NOT NULL already in 00001).
do $$ begin
  alter table decisions drop constraint if exists decisions_reason_nonempty;
  alter table decisions
    add constraint decisions_reason_nonempty
    check (length(trim(reason)) > 0);
exception when others then
  raise notice 'decisions_reason_nonempty skipped: %', sqlerrm;
end $$;

-- Record that this hardening migration is the contract for server-only RLS.
insert into app_kv (key, value, updated_at)
values (
  'data_model_hardening',
  jsonb_build_object(
    'migration', '00019',
    'rls', 'revoke_anon_authenticated',
    'at', now()
  ),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;
