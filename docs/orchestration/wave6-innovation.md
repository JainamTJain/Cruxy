# Wave 6: the reasoning flywheel (starts only after F-001 to F-394 are all ticked)

Plan: [Crux innovation plan: the reasoning flywheel](https://claude.ai/artifact/1qjMc4bhjygv1T3jWvNbYX). Jainam's decisions (Nov 21): build after the checklist; score predictions are required for everyone; robustness scores are visible to all three teams.

Every use of Crux should make the next one better. Each piece below writes into, or reads from, one argument graph.

## Same rules

Real data only (empty states until real activity exists), `callCruxy` tiers only, no middle dots or em dashes, RLS on and `revoke all ... from anon, authenticated` on every new table, one PR per agent, green CI, check your preview at phone width. Migration numbers: K 00028, H 00029, C 00030, D 00031, F 00032, E 00033, G 00034, J 00035, I 00036.

## Owners

| Agent | Build | Done when |
| --- | --- | --- |
| K | **Graph spine.** `arg_edges` (from_kind, from_id, to_kind, to_id, type, weight, provenance: source_kind, source_id, round_id, line_id, created_by, created_at). Types: supports, attacks, concedes, distinguishes, rebuts, cites, contradicts, inspired_by, used_in_round, tested_by_question. Embeddings (vector 1536, `embed` tier) on claims, supports, counterclaims. Backfill edges from existing rows. Every existing write path (claim map edits, Truth Sources, proposals, transcript moments, judge comments) also writes its edge through one `recordEdge()` helper. | Editing a claim map or accepting a Truth Source creates edges; backfill counts shown in admin |
| H | **Robustness scores.** Gradual-semantics score per claim from the graph (DF-QuAD style: base score, supporters raise, unanswered attacks lower), computed in code, never asked of the model. Case brain shows per claim "N attacks answered, M open (from round X)" to all three teams. Judge questions asked in rounds are classified (small tier, with citations) to the node they attack. Team doc import writes candidate nodes. | A judge question in a real round shows up as an open attack on the right claim |
| C | **Calibrated judge.** Human card stored beside Cruxy's card per round; per-item Cohen's kappa; Cruxy's score shown with a bias-corrected interval (bootstrap over analysed human cards) on the feedback report. Uses `judge_card_analyses` from 00020. | The report shows "Cruxy 7.1 (6.4 to 7.8), agreement with human judges: kappa 0.42 over N cards" or "not enough human cards yet" |
| D | **Required score predictions.** Before each practice round every speaker predicts their score per card item and the question they expect. After judging: Brier score per person over time, compared only with their own past. | Round cannot start until each speaker has predicted; trend shows on the person's page |
| F | **Graph-aware flashcards.** Each card links to its node; node mastery per person from card_reviews; priority rises for cards on nodes with open attacks that the person leads; daily target rises toward Dec 5 with cram mode in the last 7 days. | Missing a card lowers that node's mastery; an attack in a round raises its cards for that case's leads |
| E | **Mastery map.** Person by claim-node grid per case, shaded by mastery; leads see their case, Dr. B and Jainam see all. | Grid fills from real reviews and rounds |
| G | **Flywheel dashboard in admin.** Edges added per day, open vs answered attacks, judge kappa trend, Brier trend, mastery coverage per case. | Every number links to the rows behind it |
| J | **Socratic outcomes.** After a Socratic exchange, record whether the person's next attempt on that claim improved (`cruxy_outcomes` from 00027). | Outcomes visible per person and in Cruxy's weekly self-review |
| I | **Privacy review** of every Wave 6 table and route: cross-team reads only where the plan says (robustness scores are shared; personal mastery and Brier are not). | Review notes in the PR, fixes merged |
