-- Seed teams, cases, and people after migrations.
-- Passcode hashes are NOT seeded here — set MEMBER_STARTER_CODE_HASH and
-- INITIAL_ADMIN_CODE_HASH in env; app sample-data path seeds locally.

insert into teams (id, name, colour) values
  ('11111111-1111-1111-1111-111111111111', 'Team 1', '#9D2235'),
  ('22222222-2222-2222-2222-222222222222', 'Team 2', '#1B4F72'),
  ('33333333-3333-3333-3333-333333333333', 'Team 3', '#1F6F4A')
on conflict (id) do nothing;

insert into competitions (name, date, place) values
  ('California Regional', '2026-12-05', 'UCSB')
on conflict do nothing;

insert into cases (number, title, active) values
  (1, 'CTRL-ALT-DEFENSE', true),
  (2, '(inactive for California)', false),
  (3, 'Sister City No More', true),
  (4, 'Judging a Book by the Cover', true),
  (5, 'The Gambler', true),
  (6, '(inactive for California)', false),
  (7, 'Equal Access Activism', true),
  (8, '(inactive for California)', false),
  (9, 'GEM in the Rough', true),
  (10, 'Right to Be Forgotten', true),
  (11, 'The Cost of a Conscience', true),
  (12, 'Medicine and Misinformation', true),
  (13, 'Normally Distributed Violence', true),
  (14, 'The Allure of the Machine', true),
  (15, 'Udderly Conflicted', true)
on conflict (number) do update set title = excluded.title, active = excluded.active;

-- People (ids stable for docs). Jainam = tech_admin on Team 3. Dr. B = coach_admin.
insert into people (id, name, team_id, role) values
  ('a1111111-1111-1111-1111-111111111101', 'Serena', '11111111-1111-1111-1111-111111111111', 'member'),
  ('a1111111-1111-1111-1111-111111111102', 'Ivan', '11111111-1111-1111-1111-111111111111', 'member'),
  ('a1111111-1111-1111-1111-111111111103', 'Ashton', '11111111-1111-1111-1111-111111111111', 'member'),
  ('a1111111-1111-1111-1111-111111111104', 'Stolei', '11111111-1111-1111-1111-111111111111', 'member'),
  ('a1111111-1111-1111-1111-111111111105', 'Tri', '11111111-1111-1111-1111-111111111111', 'member'),
  ('a2222222-2222-2222-2222-222222222201', 'Lehar', '22222222-2222-2222-2222-222222222222', 'member'),
  ('a2222222-2222-2222-2222-222222222202', 'Camerin', '22222222-2222-2222-2222-222222222222', 'member'),
  ('a2222222-2222-2222-2222-222222222203', 'Jade', '22222222-2222-2222-2222-222222222222', 'member'),
  ('a2222222-2222-2222-2222-222222222204', 'Bethany', '22222222-2222-2222-2222-222222222222', 'member'),
  ('a2222222-2222-2222-2222-222222222205', 'Quixote', '22222222-2222-2222-2222-222222222222', 'member'),
  ('a3333333-3333-3333-3333-333333333301', 'Nick', '33333333-3333-3333-3333-333333333333', 'member'),
  ('a3333333-3333-3333-3333-333333333302', 'Daniel', '33333333-3333-3333-3333-333333333333', 'member'),
  ('a3333333-3333-3333-3333-333333333303', 'Katie', '33333333-3333-3333-3333-333333333333', 'member'),
  ('a3333333-3333-3333-3333-333333333304', 'Jainam', '33333333-3333-3333-3333-333333333333', 'tech_admin'),
  ('a0000000-0000-0000-0000-0000000000b0', 'Dr. B', null, 'coach_admin')
on conflict (id) do nothing;
