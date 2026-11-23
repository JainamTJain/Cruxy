-- Working document suggestions: logic chains, missing links, and Take with undo.
-- missing_link: a step in the argument's chain (A then B, B then C) that needs
-- an unstated premise. logic_chain: the chain Cruxy reconstructed, shown on the
-- card. prev_body / applied_at: the section text before Take applied the
-- suggestion, so the team can undo it.

alter table working_doc_suggestions
  drop constraint if exists working_doc_suggestions_kind_check;

alter table working_doc_suggestions
  add constraint working_doc_suggestions_kind_check
  check (kind in (
    'evidence',
    'gap',
    'counter',
    'sharper',
    'question',
    'missing_perspective',
    'missing_stakeholder',
    'unanswered_counter',
    'logical_fallacy',
    'disconnected_claim',
    'loose_end',
    'evidence_gap',
    'sharper_wording',
    'missing_link'
  ));

alter table working_doc_suggestions
  add column if not exists logic_chain text,
  add column if not exists applied_at timestamptz,
  add column if not exists prev_body text;
