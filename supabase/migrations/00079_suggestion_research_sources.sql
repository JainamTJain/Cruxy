-- Outside sources Cruxy found while researching a teammate's idea
-- (encyclopedias of philosophy, papers, reports), shown as links on the card.
alter table working_doc_suggestions
  add column if not exists research_sources jsonb;
