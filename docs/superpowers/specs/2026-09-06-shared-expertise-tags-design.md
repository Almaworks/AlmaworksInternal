# Shared Expertise Tags

**Status:** Proposed for review
**Date:** 2026-09-06

## Goal

Give mentors and startups one shared, self-extending expertise vocabulary. A person may create a previously unknown tag without administrator intervention, while matching continues to use a stable canonical tag identity rather than fragile string equality.

## User experience

The existing tag inputs remain free-form. As a user types, the interface suggests existing tags in this order:

1. Exact normalized name.
2. Prefix and word-prefix match.
3. Registered aliases and acronyms, such as `GTM` for `Go-to-market`.
4. Fuzzy typo matches.

Choosing a suggestion attaches its canonical tag. If there is no suitable result, the interface offers **Create “…”**. Creation immediately creates a shared tag and attaches it to the current mentor or startup; future users see it as a suggestion. A close result is never silently merged: the user chooses the existing suggestion or deliberately creates a distinct tag.

## Data model

`expertise_tags` is a global taxonomy/configuration table and is explicitly exempt from `semester_id`, like other global catalog data.

| Table | Responsibility |
| --- | --- |
| `expertise_tags` | Canonical name, normalized search name, creator, timestamps. |
| `expertise_tag_aliases` | Optional normalized aliases/acronyms mapped to one canonical tag. |
| `mentor_expertise_tags` | Durable mentor-profile-to-tag assignments. |
| `startup_mentor_need_tags` | Semester-specific startup-to-tag assignments, including priority. |

The canonical record owns normalization. Unique normalized names prevent duplicate spellings from becoming distinct tags. Alias rows are unique by normalized alias and can only resolve to one tag.

## Authorization

Authenticated participants may read catalog tags and aliases. A participant may create a tag and attach it only to their own eligible profile/startup record under existing membership RLS. Assignment rows remain RLS-scoped: mentors can alter only their own expertise; startup team members can alter only their own startup’s needs; admins retain cohort management access. No service key is exposed to the browser.

## Migration and compatibility

Existing `mentor_profiles.expertise_tags`, `startup_semesters.mentorship_needs`, and `startup_semesters.preferred_expertise_tags` are normalized and backfilled into the catalog and join tables. Duplicate normalized values become one canonical tag. `preferred_expertise_tags` is retired from matching after its values are migrated; `mentorship_needs` is retained only temporarily as a compatibility projection until every reader uses the join table.

## Matching and gap analysis

Matching compares tag IDs. Startup primary/secondary priorities remain in `startup_mentor_need_tags`; mentor expertise is durable in `mentor_expertise_tags`. The mentor-needs board and gap analysis aggregate canonical tag IDs, so alias or punctuation differences cannot create false gaps.

## Delivery slices

1. Add catalog and assignment schema, RLS, backfill, and database tests.
2. Add tag search/create API and a shared tag-input adapter with search, alias, and explicit-create behavior.
3. Move mentor onboarding/profile and startup Mentor Needs screens to the adapter.
4. Move matching, scheduling, dashboard reads, and gap analysis to tag IDs; remove legacy field use.
5. Verify desktop and narrow responsive flows for mentor and startup tag selection.

## Acceptance criteria

- Typing `GTM` suggests `Go-to-market` when that alias exists.
- Typing a near spelling suggests the canonical existing tag without silently replacing a choice.
- A user can create a new tag without administrator action and it becomes available across both flows.
- A startup need and mentor expertise with the same canonical tag ID match reliably.
- A participant cannot read or modify another participant’s assignments outside existing RLS permissions.
