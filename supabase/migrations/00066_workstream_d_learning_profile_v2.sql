-- Workstream D: concrete learning profile (time, focus, explanations, feedback).
-- Keep legacy slider columns for backfill; new columns drive the product.
-- Starting APPE level comes from the first real judge card, not self-ratings.

alter table learning_profiles
  add column if not exists daily_minutes int
    check (daily_minutes is null or daily_minutes in (10, 20, 45, 60)),
  add column if not exists focus_areas text[] not null default '{}',
  add column if not exists explanation_style text
    check (explanation_style is null or explanation_style in ('example_first', 'steps_first')),
  add column if not exists feedback_tone text
    check (feedback_tone is null or feedback_tone in ('blunt', 'gentle')),
  add column if not exists learned_prefs jsonb not null default '{}'::jsonb;

-- Map old sliders into the new fields where empty.
update learning_profiles
set
  daily_minutes = coalesce(daily_minutes, 20),
  explanation_style = coalesce(
    explanation_style,
    case
      when analogies_formal <= 40 then 'example_first'
      when analogies_formal >= 60 then 'steps_first'
      when visual_verbal <= 40 then 'example_first'
      else 'example_first'
    end
  ),
  feedback_tone = coalesce(
    feedback_tone,
    case
      when direct_gentle >= 60 then 'gentle'
      when direct_gentle <= 40 then 'blunt'
      else 'gentle'
    end
  ),
  learned_prefs = case
    when learned_prefs is null or learned_prefs = '{}'::jsonb then
      jsonb_build_object(
        'prefer_shorter', coalesce(short_deep, 50) <= 40,
        'prefer_more_detail', coalesce(short_deep, 50) >= 60,
        'prefer_example', coalesce(analogies_formal, 50) <= 40
      )
    else learned_prefs
  end
where completed_at is not null;

comment on column learning_profiles.daily_minutes is
  'Wave 9 D v2: weekday minutes until Dec 5 (10/20/45/60). Sizes Today and roadmap.';
comment on column learning_profiles.focus_areas is
  'Wave 9 D v2: up to two round parts to improve. Weights drills and roadmap.';
comment on column learning_profiles.explanation_style is
  'Wave 9 D v2: example_first or steps_first.';
comment on column learning_profiles.feedback_tone is
  'Wave 9 D v2: blunt or gentle.';
comment on column learning_profiles.learned_prefs is
  'Wave 9 D v2: prefs learned from Shorter / Example / More detail chips.';
