-- Workstream C (00013): Team 3 Case 9 waiting-queue examples for the CaseBrain
-- screen (Inspired by Team 1, practice transcript, Cruxy research) plus a peer
-- Team 1 decision on the same Louvre idea. Idempotent upserts.
-- Applied on live by Claude when this PR merges. Do not edit after apply.

insert into proposals (
  id, team_id, case_id, origin, origin_ref, text, cruxy_note, status,
  created_at, created_by, idea_key, inspired_from_team_id, kind,
  socratic_question, socratic_answered, updated_at
) values
  (
    'c9000001-0000-4000-8000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    (select id from cases where number = 9),
    'inspired_by_team',
    'France 24, 2009 · Team 1 edit by Ivan',
    'Egypt''s 2009 Louvre stand-off shows an early, voluntary return buys goodwill. Use it to back C2 S3.',
    null,
    'pending',
    '2026-11-12T00:00:00.000Z',
    'a1111111-1111-1111-1111-111111111102',
    'case9-louvre-2009-goodwill',
    '11111111-1111-1111-1111-111111111111',
    'example',
    'Does this fit your Claim 2 on Case 9, or does it pull against a principle you already use?',
    false,
    '2026-11-12T00:00:00.000Z'
  ),
  (
    'c9000001-0000-4000-8000-000000000002',
    '33333333-3333-3333-3333-333333333333',
    (select id from cases where number = 9),
    'transcript',
    'From practice · Nov 12 · 41:10 · Nick',
    'The Stone toured Chicago in the 1980s.',
    'Cruxy found no source: it left London only for wartime storage and one month in Paris (1972).',
    'pending',
    '2026-11-12T00:00:00.000Z',
    'a3333333-3333-3333-3333-333333333301',
    'case9-chicago-tour-false',
    null,
    'fact',
    null,
    true,
    '2026-11-12T00:00:00.000Z'
  ),
  (
    'c9000001-0000-4000-8000-000000000003',
    '33333333-3333-3333-3333-333333333333',
    (select id from cases where number = 9),
    'research',
    'Museums Association · The Art Newspaper',
    'UK Charities Act 2022 moral-obligation power took effect Nov 2025 but excludes the British Museum.',
    null,
    'pending',
    '2026-11-12T00:00:00.000Z',
    'a3333333-3333-3333-3333-333333333304',
    'case9-charities-act-exclusion',
    null,
    'fact',
    null,
    true,
    '2026-11-12T00:00:00.000Z'
  ),
  -- Peer copy so Team 1's decision shows next to Team 3's Inspired-by card
  (
    'c9000001-0000-4000-8000-000000000011',
    '11111111-1111-1111-1111-111111111111',
    (select id from cases where number = 9),
    'inspired_by_team',
    'France 24, 2009 · Team 1 edit by Ivan',
    'Egypt''s 2009 Louvre stand-off shows an early, voluntary return buys goodwill. Use it to back C2 S3.',
    null,
    'accepted',
    '2026-11-12T00:00:00.000Z',
    'a1111111-1111-1111-1111-111111111102',
    'case9-louvre-2009-goodwill',
    '11111111-1111-1111-1111-111111111111',
    'example',
    'Does this fit your Claim 2 on Case 9, or does it pull against a principle you already use?',
    true,
    '2026-11-12T00:00:00.000Z'
  )
on conflict (id) do update set
  text = excluded.text,
  cruxy_note = excluded.cruxy_note,
  origin_ref = excluded.origin_ref,
  socratic_question = excluded.socratic_question,
  socratic_answered = excluded.socratic_answered,
  status = excluded.status,
  updated_at = excluded.updated_at;

insert into decisions (
  id, proposal_id, person_id, team_id, verdict, reason, edited_text, created_at, created_by
) values (
  'c9000001-0000-4000-8000-000000000021',
  'c9000001-0000-4000-8000-000000000011',
  'a1111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111111',
  'accept',
  'use it in Q&A only',
  null,
  '2026-11-12T00:00:00.000Z',
  'a1111111-1111-1111-1111-111111111102'
)
on conflict (id) do update set
  reason = excluded.reason,
  verdict = excluded.verdict;
