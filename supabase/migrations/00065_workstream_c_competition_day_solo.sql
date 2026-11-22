-- Wave 9 C follow-up (solo principle): logistics is one plain page.
-- Carpool becomes a text list; packing ticks and carpool sign-up go away.

alter table competition_day_logistics
  add column if not exists packing_list text;
alter table competition_day_logistics
  add column if not exists carpool_list text;

-- Fold any existing packing_items array into the plain packing_list text.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'competition_day_logistics'
      and column_name = 'packing_items'
  ) then
    update competition_day_logistics
    set packing_list = coalesce(
      nullif(packing_list, ''),
      nullif(array_to_string(packing_items, E'\n'), '')
    )
    where packing_items is not null
      and cardinality(packing_items) > 0;

    alter table competition_day_logistics
      drop column packing_items;
  end if;
end $$;

drop table if exists competition_carpool_riders;
drop table if exists competition_carpools;
drop table if exists competition_packing_ticks;

comment on column competition_day_logistics.packing_list is
  'Plain packing notes Dr. B fills. Empty = Dr. B will add this.';
comment on column competition_day_logistics.carpool_list is
  'Simple who-drives / who-rides list. Not a sign-up system.';
