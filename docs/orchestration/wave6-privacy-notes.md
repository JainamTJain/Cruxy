# Wave 6 privacy notes (Workstream I)

Jainam's rule (Nov 21): robustness scores and claim nodes are shared across the three teams. Personal mastery, Brier scores, predictions and Socratic outcomes are visible only to that person, the leads of their case where the plan says so, Dr. B and Jainam.

## Classification

| Kind | Examples | Who can read |
| --- | --- | --- |
| Shared | `arg_edges`, claim / support / counterclaim nodes, robustness scores | Every signed-in member |
| Personal learning | mastery, Brier, score predictions, Socratic sessions/outcomes, phrasebook, FSRS `card_reviews`, private drift flags, redo scores | Self; case leads (`lead_1` / `lead_2`) for that case; coach or tech in admin view |
| Tech only | `auth_codes`, encrypted passcodes, `ai_calls`, `book_requests`, judge weights / calibration | Tech admin in admin view (coach never for passcodes/spend/books) |

## Helpers

Import from `@/lib/ops/privacy-scope` (also re-exported from `@/lib/ops`):

- `canViewPersonalLearning` / `canViewMasteryMap` / `isCaseLead`
- `redactPredictions` on judge cards
- `filterDriftFlagsForViewer` for `private_to_leads`
- `privacyClassFor(field)` for quick classification

Migration stamp: `00036_workstream_i_wave6_privacy.sql` (`app_kv.privacy_wave6`).

## PR review checklist (for K, H, C, D, F, E, G, J)

1. New tables: RLS on, `revoke all ... from anon, authenticated`.
2. Shared graph / robustness routes: OK to return across teams.
3. Personal routes: filter by `session.personId` unless lead/admin helper allows.
4. Admin dashboards (G): Brier and mastery trends must not name another member to non-admins; aggregates OK.
5. No middle dots or em dashes in UI copy.
