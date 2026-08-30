---
title: Unified Outreach CRM Design
status: approved-for-planning
updated: 2026-08-17
owners:
  - Almaworks outreach team
related:
  - "[[product/onboarding-lifecycle]]"
  - "[[architecture/identity-membership]]"
  - "[[runbooks/outreach-data-migration]]"
---

# Unified outreach CRM

## Purpose

Give the Almaworks outreach team one durable workspace for mentor, investor, speaker, sponsor, advisor, and partner relationships. The workspace must make the next action obvious, preserve institutional history when staff changes, and support semester-to-semester continuity without duplicating people.

This release manages outreach work. It does not send email, synchronize inboxes, or automatically detect replies. Those integrations are explicitly deferred.

## Product principles

- One person and one company record, even when they participate in several outreach categories or semesters.
- One accountable owner per outreach opportunity, with transferable ownership and a complete transfer history.
- Follow-up is driven by an explicit next-action date, not memory.
- Cadence is configurable per opportunity and can be snoozed or silenced.
- Deactivating an owner never strands their work; open opportunities become unassigned.
- Historical activity is append-only. Correcting a contact does not erase who contacted them or when.
- Existing data moves through a previewable, reversible migration.

## Information architecture

The existing Outreach navigation item becomes a unified workspace with five saved views:

1. **My queue** — overdue, due today, and upcoming opportunities owned by the current user.
2. **Team queue** — all open work, grouped by owner, including a prominent Unassigned group.
3. **People** — searchable contact directory with company, biography, relationship types, latest activity, and owner.
4. **Companies** — organization directory with related people and open opportunities.
5. **Imports** — existing CSV/Excel import, migration previews, row corrections, duplicate resolution, and import history.

A right-side contact workspace opens without losing the current list. It shows durable identity and company context at the top, the current semester opportunity next, and a chronological activity stream below.

## Primary dashboard

The default view is **My queue**, designed around daily execution rather than reporting.

### Header

- semester selector with active semester default and all-time option
- global search across name, email, company, biography, tags, notes, and owner
- Add contact and Import actions
- compact health indicators: overdue, due today, unassigned, awaiting response

### Queue groups

- **Overdue**: next action is before today and the opportunity is not silenced or closed
- **Due today**: next action is today
- **Upcoming**: next action falls within the selected horizon
- **Waiting**: last action was outbound and the configured cadence has not elapsed
- **Unassigned**: open opportunities with no active owner

Each row shows the contact, company, relationship labels, stage, owner, last activity, next action, and cadence. Common actions—log touch, snooze, change owner, change stage—are available without opening a separate page.

### Detail workspace

- contact identity, biography, LinkedIn, email, phone, and tags
- company name, domain, website, description, and sector
- current opportunity stage, relationship types, owner, cadence, next follow-up, and silence state
- one-click log actions for email, call, LinkedIn, meeting, note, and reply
- append-only activity timeline, including ownership transfers and cadence changes
- related semester opportunities and conversion history

## Data model

### Global tables

These records are durable and intentionally omit `semester_id`:

- `outreach_contacts`: normalized person identity and biography
- `outreach_companies`: normalized organization identity and context
- `outreach_contact_companies`: dated person-to-company relationships
- `outreach_relationship_labels`: reusable labels such as Mentor, Investor, Speaker, Sponsor, Advisor, and Partner

These are global identity/organization/configuration exemptions documented in [[architecture/identity-membership]].

### Semester-scoped tables

Every program-scoped table has a non-null `semester_id` foreign key:

- `outreach_opportunities`: one contact's active outreach effort for a semester
- `outreach_opportunity_labels`: many-to-many relationship types for the opportunity
- `outreach_activities`: append-only touches, replies, notes, owner transfers, stage changes, snoozes, and silences
- `outreach_import_jobs`: import or legacy-migration execution state
- `outreach_import_rows`: normalized staging row, selected/excluded state, match decision, and validation issues

### Outreach opportunity fields

- `contact_id`
- `owner_profile_id`, nullable only for the Unassigned queue
- stage: `prospect`, `researching`, `ready`, `contacted`, `responded`, `meeting`, `nurture`, `converted`, `closed`
- cadence in days, constrained to a sensible administrative range
- `next_follow_up_at`
- `snoozed_until`
- `is_silenced`, `silenced_at`, `silenced_by`
- latest inbound/outbound activity timestamps maintained by database commands
- source channel, referral, priority, and freeform notes
- optional links to a resulting mentor profile, startup relationship, sponsorship, or other future conversion

One contact may have multiple historical opportunities, but only one open opportunity per contact and semester. Multiple relationship labels live on that opportunity rather than creating duplicate contacts.

## Ownership and staff transitions

An opportunity has exactly one accountable owner or is explicitly unassigned. Any authorized outreach administrator may transfer ownership. A transfer writes an activity containing the previous owner, new owner, actor, timestamp, and optional reason.

When a profile loses active outreach/admin membership, a server-owned offboarding command atomically:

1. finds their open opportunities;
2. sets `owner_profile_id` to null;
3. writes an ownership-release activity for each opportunity;
4. exposes those opportunities in the Unassigned queue;
5. leaves closed and historical records unchanged.

Cross-semester carry-forward creates a new opportunity referencing the same global contact and company. The administrator chooses a new owner; ownership is never silently inherited from an inactive person.

## Follow-up scheduling

Each opportunity stores a configurable cadence in whole days. Team defaults are versioned in lifecycle configuration; a contact can override the default—for example, five days for a priority investor and fourteen days for a mentor prospect.

Whenever an outbound touch is logged, the server calculates the next follow-up from the activity timestamp plus the opportunity cadence. An explicit next-action date may override that calculation.

### Snooze

Snoozing temporarily hides the opportunity from due and overdue queues until `snoozed_until`. The original cadence remains intact. When the snooze expires, the opportunity returns based on its next-action date.

### Silence

Silencing removes the opportunity from automated follow-up queues indefinitely without closing or deleting it. The actor must provide a reason. Unsilencing recalculates or explicitly sets the next action before the opportunity re-enters a queue.

### Response handling

Because inbox synchronization is out of scope, a teammate records an inbound reply manually. Logging a reply updates the latest inbound timestamp and moves the opportunity to `responded` unless the user chooses another stage. The next action is then explicit rather than automatically scheduled from the outbound cadence.

## Import and legacy migration

The current CSV/Excel workflow remains available and expands into an import review experience.

### Matching order

1. normalized email
2. canonical LinkedIn profile URL
3. reviewed name-and-company suggestion; never auto-merge on this signal alone

Companies match by normalized domain first, then a reviewed normalized-name suggestion.

### Staging workflow

1. Upload the file or select the legacy outreach migration.
2. Normalize fields without changing production records.
3. Preview created contacts, companies, opportunities, updates, duplicates, exclusions, and validation failures.
4. Resolve ambiguous people and companies through merge, create-new, or exclude decisions.
5. Edit normalized values and add missing records before commit.
6. Commit an idempotent import job with an audit summary.
7. Retain the import results and row-level decisions for review.

### Legacy field mapping

- `prospect_name`, `prospect_email`, `linkedin_url` -> contact
- `company` -> company and contact-company relationship
- `outreach_type` -> opportunity relationship labels
- `status` -> mapped CRM stage
- `last_contacted_at` -> latest outbound activity and next-follow-up calculation
- `who_reached_out` -> matched owner or Unassigned with a review issue
- `notes`, `source_channel`, `referred_by`, `expertise_tags` -> opportunity/contact context
- `converted_mentor_id` -> conversion link
- existing activity log rows -> ordered CRM activities

The migration does not delete legacy tables. After row counts, samples, owner assignments, and activity chronology are accepted, legacy tables become read-only and are archived in a later migration. Rollback before archival deletes records by import-job provenance and restores legacy access.

## Commands and APIs

Browser code never uses service-role credentials and never performs privileged writes directly.

- `GET /api/admin/outreach/workspace`: saved-view data, health counts, and cursor-paginated rows
- `POST /api/admin/outreach/contacts`: create a contact/company/opportunity transaction
- `PATCH /api/admin/outreach/contacts/:id`: safe identity/context updates
- `POST /api/admin/outreach/opportunities/:id/activity`: log a touch, reply, meeting, or note
- `POST /api/admin/outreach/opportunities/:id/owner`: transfer or release ownership
- `POST /api/admin/outreach/opportunities/:id/snooze`: set or clear a snooze
- `POST /api/admin/outreach/opportunities/:id/silence`: silence or restore queue participation
- `POST /api/admin/outreach/imports/preview`: normalize and match staged rows
- `POST /api/admin/outreach/imports/:id/commit`: idempotently commit reviewed rows
- `POST /api/admin/outreach/migrations/legacy/preview`: produce the legacy migration report
- `POST /api/admin/outreach/migrations/legacy/commit`: commit the reviewed legacy migration

All commands require `can_manage_semester(semester_id)` or a dedicated active outreach role, validate the semester boundary, and write audit activities.

## Authorization and RLS

- active outreach/admin members can view contacts tied to semesters they manage
- owners and authorized team members can update opportunities through server commands
- global contact/company visibility is derived from an accessible semester opportunity
- inactive and alumni members cannot mutate outreach data
- activities are append-only to authenticated clients; corrections create superseding activities
- import staging data is visible only to authorized team members in its semester
- service-role usage is server-only and follows successful authenticated authorization

## Empty, error, and conflict states

- an empty personal queue explains that nothing is due and links to the team queue
- an empty Unassigned queue communicates that every opportunity has an accountable owner
- concurrent edits use `updated_at` optimistic concurrency; stale writes return a conflict and reload current values
- failed import rows remain editable and never partially commit
- duplicate-open-opportunity conflicts return the existing opportunity instead of creating another
- owner deactivation failures abort atomically so no opportunity is silently lost

## Reporting

Initial reporting stays operational:

- overdue and due counts
- opportunities by owner and stage
- median days since last outbound touch
- response and conversion counts by relationship label and source
- unassigned workload

The design intentionally excludes scoring models, automated enrichment, sequence builders, and predictive recommendations from the first release.

## Future email capability

A future integration may connect Gmail or Microsoft 365 to send messages, synchronize threads, detect replies, and attach messages to activities. That work requires OAuth consent, token security, mailbox-scoping rules, deliverability controls, and privacy review. The current activity model includes channel and external-message identifiers so this can be added without redesigning contacts or opportunities, but no mailbox connection or automatic sending is part of this implementation.

## Verification strategy

- unit tests for queue classification, cadence calculation, snooze/silence behavior, stage transitions, normalization, and deduplication
- database tests for semester anchoring, RLS personas, unique open opportunities, append-only activity, owner offboarding, and idempotent import commit
- API tests for authorization, validation, conflicts, pagination, and transactional failure
- migration fixture tests covering duplicates, missing emails, ambiguous companies, inactive owners, exclusions, and rollback provenance
- desktop and mobile visual QA for My queue, Team queue, contact detail, import review, empty states, and high-density tables
- production build, full scoped lint, and accessibility checks for keyboard navigation and focus management

## Acceptance criteria

- A person appears once even when labeled as both Mentor and Investor.
- Every open opportunity is owned by one active person or appears in Unassigned.
- Transferring or releasing ownership preserves the previous owner and actor in activity history.
- A five-day and fourteen-day opportunity calculate distinct follow-up dates from the same outbound date.
- Snoozed and silenced opportunities do not appear as overdue; restoring them requires a valid next action.
- Existing spreadsheet and legacy rows can be edited, excluded, merged, and dry-run before commit.
- The legacy migration is idempotent, auditable, sample-verifiable, and reversible before archival.
- Team members can answer who last contacted a person, when, through which channel, and what should happen next.
- No email is sent and no mailbox is accessed by this release.
