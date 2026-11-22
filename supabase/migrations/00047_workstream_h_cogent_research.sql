-- Wave 8 H: cogent research briefs and per-claim ranked dossiers.
-- Finding bibliographic fields stay in findings JSONB (00040).

alter table research_runs
  add column if not exists brief jsonb,
  add column if not exists claim_dossiers jsonb;

comment on column research_runs.brief is
  'Nightly short brief: at most 3 findings, judgment of what changes and what does not.';
comment on column research_runs.claim_dossiers is
  'Per-claim top 3 ranked sources + steelman + More fold (Wave 8 rubric).';
