-- Workstream K: practice save / resume (Wave 9 follow-up).
-- Drill UI checkpoint + phase clock so leave/return resumes mid-drill and
-- mid-round without inventing new session rows.

alter table rounds
  add column if not exists drill_checkpoint jsonb,
  add column if not exists phase_entered_at timestamptz;

comment on column rounds.drill_checkpoint is
  'Client drill UI state (phase, prompt, seconds left). Never stores audio.';
comment on column rounds.phase_entered_at is
  'When the current round phase began; used to resume the on-screen timer.';
