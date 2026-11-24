-- 00093 Cruxy can reply in discussion threads (on suggestions: @Cruxy pushes back,
-- and notes when it redrafts). A Cruxy reply has no person.

alter table discussion_replies alter column person_id drop not null;
alter table discussion_replies
  add column if not exists author text not null default 'person'
  check (author in ('person', 'cruxy'));
alter table discussion_replies drop constraint if exists discussion_replies_author_person_check;
alter table discussion_replies
  add constraint discussion_replies_author_person_check
  check ((author = 'person' and person_id is not null) or (author = 'cruxy' and person_id is null));
