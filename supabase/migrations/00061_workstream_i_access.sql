-- Workstream I Wave 9: access prefs per person (display + motion).
-- Saved with floating Cruxy prefs on person_prefs.

alter table person_prefs
  add column if not exists text_size text not null default 'md'
    check (text_size in ('sm', 'md', 'lg', 'xl')),
  add column if not exists high_contrast boolean not null default false,
  add column if not exists readable_font boolean not null default false,
  add column if not exists reduce_motion text not null default 'system'
    check (reduce_motion in ('system', 'on', 'off'));

comment on column person_prefs.text_size is
  'Wave 9 I: four text sizes sm md lg xl.';
comment on column person_prefs.high_contrast is
  'Wave 9 I: stronger ink and borders for low vision.';
comment on column person_prefs.readable_font is
  'Wave 9 I: Lexend-style readable font (dyslexia-friendly option).';
comment on column person_prefs.reduce_motion is
  'Wave 9 I: system | on | off. Default follows prefers-reduced-motion.';
