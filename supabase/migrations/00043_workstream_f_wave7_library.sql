-- Workstream F Wave 7: library unreadable reason for Drive files
-- that could not be digested as text (scanned PDFs, slides, images).

alter table files
  add column if not exists unreadable_reason text;

comment on column files.unreadable_reason is
  'Why text could not be extracted (scanned_pdf, image, slides, binary, extract_failed). Null when readable.';

-- No new table; files already has RLS. Keep column server-written only.
