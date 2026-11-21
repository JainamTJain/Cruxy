-- Workstream F: pin flashcards so they stay in a person's rotation.
alter table card_fsrs_states
  add column if not exists pinned boolean not null default false;

comment on column card_fsrs_states.pinned is
  'When true, the card stays in this person''s deck rotation (Keep in my deck).';
