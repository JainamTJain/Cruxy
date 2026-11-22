# Wave 7 privacy notes (Workstream I)

Jainam's Wave 7 focus for I: research ingestion licences, the roles board, mood events, and voice samples. Migration stamp: `00044_workstream_i_wave7_privacy.sql`. Helpers: `src/lib/ops/privacy-licence.ts` and additions in `privacy-scope.ts`.

## Classification

| Kind | Examples | Who can read / what is allowed |
| --- | --- | --- |
| Shared research card | Title, authors, year, link, DOI, licence, 40-word card | Every signed-in member |
| Full stored passage | Passage / full text from a source | Only when licence is open or public domain (see helpers). Never fetch past a paywall. |
| Short quote only | At most `MAX_CLOSED_QUOTE_WORDS` from a closed / unknown licence | Citation plus short quote; no full text |
| Material request | Paywalled or book source that still matters | Jainam only (tech admin queue + his notifications). Mark done when the file lands in the Ethics Bowl Drive folder. |
| Roles board | Who holds lead / counter / support per case | Team members and admins may edit that team's grid (same as F-014). Notify only the people whose role cell changed, plus the actor in the activity log. |
| Mood events | `useCruxyMood` / Genie pose triggers | Event keys and generic bubble copy only. No person names, scores, Brier, mastery, transcript lines, or other personal fields in the event payload. |
| Voice samples | Consent enrollment audio | Private `voice-samples` bucket (service role only). Person can delete their own sample (Settings / consent withdraw). Admin delete and season end still apply. |

## Open licences (store full text)

Helpers treat these (and public domain / CC0 / CC BY / CC BY-SA and common open-access flags) as storeable. Anything else is citation + short quote, or a material request.

- `public-domain`, `cc0`, `cc-by`, `cc-by-sa`, `open-access`, `arxiv`, `pmc`, `unpaywall-oa`
- Explicit `licence` / `license` strings that match the allow list in `isOpenOrPublicDomainLicence`

## Never

- Fetch or scrape past a paywall or login wall.
- Store full text / long passages from closed, unknown, or all-rights-reserved sources.
- Show material requests to coach admin, members, or other teams.
- Put personal learning data inside mood event objects.
- Expose voice sample bytes through a public URL or anon Storage policy.

## PR review checklist (H, E, G, D, and others)

1. New tables: RLS on, `revoke all ... from anon, authenticated`.
2. H research: every finding has licence; full text only when `canStoreFullText`; otherwise citation + short quote or material request for Jainam.
3. H material requests: tech admin (Jainam) only; not in member APIs.
4. E roles board: edits limited to the actor's team (or admin view); notifications only to affected people.
5. G mood: event payloads have no PII; bubbles stay generic.
6. D voice: private bucket; Done-to-save; self-delete path works.
7. No middle dots or em dashes in UI copy.

## Reviews so far

| PR | Verdict |
| --- | --- |
| #59 voice enrollment (D) | Wave 6 OK; Wave 7 voice criteria re-checked on this branch |
