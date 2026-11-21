-- Workstream F wave 5: moderator drill sessions scoped by session_key

alter table drill_session_seen
  add column if not exists session_key text not null default 'legacy';

alter table drill_session_seen drop constraint if exists drill_session_seen_pkey;

alter table drill_session_seen
  add primary key (person_id, session_key, question_id);

create index if not exists drill_session_seen_session_idx
  on drill_session_seen (person_id, session_key);