-- Judging robustness: one human card per judge per team per round,
-- and one Cruxy card per team per round. Re-submits update in place.

create unique index if not exists judge_cards_human_round_judge_team_uidx
  on judge_cards (round_id, judge_id, team_id)
  where cruxy = false and judge_id is not null and team_id is not null;

create unique index if not exists judge_cards_cruxy_round_team_uidx
  on judge_cards (round_id, team_id)
  where cruxy = true and team_id is not null;

-- RLS already enabled on judge_cards (00001). No new table.
