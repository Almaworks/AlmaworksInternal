# Almaworks canonical database map

Generated from the converged local Supabase catalog on 2026-09-01. This documents the 21 application-owned `public` tables. A **semester** is one cohort, a **meeting** is one Friday program date, and a **session** is one mentor-startup conversation in slot 1 or 2. Profiles are durable program identities; only profiles with an `auth_user_id` have managed logins. Outreach contacts never have managed logins.

Program management and outreach share one project but little data. Program management owns profiles, memberships, mentors, startups, meetings, and sessions. Outreach owns a durable contact/company directory and a fresh opportunity pipeline each semester. The intentional connective tissue is `semesters` plus internal `profiles` used for ownership and auditing.

## Shared identity and semester lifecycle

### `profiles`

Durable application identity for a mentor, startup team member, or administrator. Role and semester history live in memberships, not here. Legacy `role` and `semester_id` remain temporarily for safe production migration and confer no authority.

- `id` (`uuid`, PK) — durable profile identity; intentionally independent of Auth.
- `auth_user_id` (`uuid`) — optional managed-login identity; -> `auth.users.id`.
- `email` (`text`) — login and contact email.
- `role` (`user_role`) — retained legacy value; non-authoritative.
- `semester_id` (`uuid`) — retained legacy cohort link; non-authoritative; -> `semesters.id`.
- `created_at` (`timestamptz`) — profile creation time.
- `updated_at` (`timestamptz`) — latest profile change.
- `full_name` (`text`) — display name.
- `status` (`text`) — account approval state.
- `is_active` (`boolean`) — whether the account is enabled.

### `platform_roles`

Rare privileges that apply across all semesters.

- `profile_id` (`uuid`, PK) — role holder; -> `profiles.id`.
- `granted_by` (`uuid`) — granting administrator; -> `profiles.id`.
- `granted_at` (`timestamptz`) — grant time.
- `role` (`platform_role`, PK) — global role, currently `super_admin`.

### `semesters`

One Almaworks cohort such as Fall 2026.

- `id` (`uuid`, PK) — semester identifier.
- `name` (`text`) — human-readable cohort name.
- `start_date` (`date`) — first program date.
- `end_date` (`date`) — last program date.
- `is_active` (`boolean`) — whether this is the current operating semester.
- `created_at` (`timestamptz`) — creation time.
- `configuration` (`jsonb`) — semester-specific settings.
- `configuration_template_version` (`integer`) — settings template version.
- `closed_at` (`timestamptz`) — close time.
- `archived_at` (`timestamptz`) — archive time.
- `updated_at` (`timestamptz`) — latest change.
- `lifecycle_status` (`semester_lifecycle_status`) — draft, active, closed, or archived.

### `semester_memberships`

Source of truth for a profile's role, onboarding, and participation in one semester. These rows produce semester-history tags such as Spring 2026 and Fall 2026.

- `id` (`uuid`, PK) — membership identifier.
- `semester_id` (`uuid`) — cohort; -> `semesters.id`.
- `profile_id` (`uuid`) — participating person; -> `profiles.id`.
- `role` (`user_role`) — mentor, startup, or admin for this semester.
- `invited_at` (`timestamptz`) — invitation time.
- `activated_at` (`timestamptz`) — activation time.
- `alumni_at` (`timestamptz`) — alumni transition time.
- `suspended_at` (`timestamptz`) — suspension time.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.
- `status` (`membership_lifecycle_status`) — invited, onboarding, active, alumni, or suspended.
- `onboarding_data` (`jsonb`) — this semester's onboarding answers and progress.
- `onboarding_started_at` (`timestamptz`) — first onboarding activity.
- `onboarding_completed_at` (`timestamptz`) — onboarding completion time.

### `invitations`

Delivery and acceptance of an invitation into one semester.

- `id` (`uuid`, PK) — invitation identifier.
- `semester_id` (`uuid`) — target cohort; -> `semesters.id`.
- `email` (`text`) — recipient email.
- `full_name` (`text`) — recipient name.
- `role` (`user_role`) — proposed semester role.
- `startup_semester_id` (`uuid`) — startup team to join; -> `startup_semesters.id`.
- `matched_profile_id` (`uuid`) — existing identity match; -> `profiles.id`.
- `invited_by` (`uuid`) — sending administrator; -> `profiles.id`.
- `expires_at` (`timestamptz`) — acceptance deadline.
- `sent_at` (`timestamptz`) — successful send time.
- `accepted_at` (`timestamptz`) — acceptance time.
- `revoked_at` (`timestamptz`) — revocation time.
- `last_error_code` (`text`) — latest delivery error code.
- `last_error_message` (`text`) — latest delivery error detail.
- `send_attempts` (`integer`) — delivery attempts.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.
- `status` (`invitation_lifecycle_status`) — draft, queued, sent, failed, accepted, expired, or revoked.

### `program_audit_events`

Append-only history for sensitive semester actions.

- `id` (`uuid`, PK) — event identifier.
- `semester_id` (`uuid`) — affected cohort; -> `semesters.id`.
- `actor_profile_id` (`uuid`) — actor when known; -> `profiles.id`.
- `action` (`text`) — stable event name.
- `subject_type` (`text`) — kind of record changed.
- `subject_id` (`uuid`) — affected record identifier.
- `details` (`jsonb`) — structured event context.
- `created_at` (`timestamptz`) — event time.

## Program: mentors and startups

### `mentor_profiles`

Durable mentor information reused when a mentor returns in a later semester.

- `profile_id` (`uuid`, PK) — mentor identity; -> `profiles.id`.
- `biography` (`text`) — reusable background summary.
- `company` (`text`) — current organization.
- `title` (`text`) — current job title.
- `linkedin_url` (`text`) — LinkedIn profile.
- `website_url` (`text`) — professional site.
- `photo_url` (`text`) — profile image.
- `expertise_tags` (`text[]`) — durable expertise labels.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.

### `mentor_semesters`

Mentor preferences and capacity for one semester. Existence of this record supports semester-history display.

- `id` (`uuid`, PK) — mentor-semester identifier.
- `semester_id` (`uuid`) — cohort; -> `semesters.id`.
- `semester_membership_id` (`uuid`) — mentor membership; -> `semester_memberships.id`.
- `mentorship_goals` (`text`) — goals for this cohort.
- `preferred_format` (`text`) — preferred session format.
- `capacity` (`integer`) — session capacity.
- `readiness_status` (`text`) — semester readiness state.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.
- `general_availability` (`text`) — free-form availability context.
- `per_week_availability` (`jsonb`) — availability by Friday meeting and slot.
- `opening_talk` (`text`) — cohort-specific opening talk information.

### `startup_organizations`

Durable startup identity and reusable company information.

- `id` (`uuid`, PK) — startup identifier.
- `name` (`text`) — company name.
- `slug` (`text`) — stable URL-safe name.
- `description` (`text`) — reusable company description.
- `industry` (`text`) — industry label.
- `website_url` (`text`) — company website.
- `logo_url` (`text`) — company logo.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.
- `durable_contact_data` (`jsonb`) — reusable company contact details.

### `startup_semesters`

One startup's goals and needs in one cohort.

- `id` (`uuid`, PK) — startup-semester identifier.
- `semester_id` (`uuid`) — cohort; -> `semesters.id`.
- `startup_organization_id` (`uuid`) — durable startup; -> `startup_organizations.id`.
- `company_snapshot` (`text`) — cohort-specific summary.
- `stage` (`startup_stage`) — idea, MVP, or growth stage.
- `goals` (`text[]`) — semester goals.
- `mentorship_needs` (`text[]`) — requested help.
- `preferred_expertise_tags` (`text[]`) — desired mentor expertise.
- `readiness_status` (`text`) — onboarding/readiness state.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.
- `mentor_need_context` (`text`) — explanation of mentor needs.
- `mentor_need_no_preference` (`boolean`) — whether any mentor profile is acceptable.

### `startup_team_memberships`

Connects startup-role semester members to their startup for that semester.

- `id` (`uuid`, PK) — team link identifier.
- `semester_id` (`uuid`) — cohort; -> `semesters.id`.
- `startup_semester_id` (`uuid`) — startup cohort record; -> `startup_semesters.id`.
- `semester_membership_id` (`uuid`) — founder/team member; -> `semester_memberships.id`.
- `is_primary_contact` (`boolean`) — whether this person is the main contact.
- `created_at` (`timestamptz`) — link creation time.

## Program: Friday meetings and mentorship sessions

### `meetings`

One Friday on the semester calendar. Each meeting defines exactly two mentorship-session slots.

- `id` (`uuid`, PK) — meeting identifier.
- `semester_id` (`uuid`) — cohort; -> `semesters.id`.
- `meeting_date` (`date`) — Friday program date.
- `label` (`text`) — optional display label.
- `slot_1_starts_at` (`time`) — first session start.
- `slot_1_ends_at` (`time`) — first session end.
- `slot_2_starts_at` (`time`) — second session start.
- `slot_2_ends_at` (`time`) — second session end.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.

### `meeting_availability`

A member's availability for one of the two slots on a Friday meeting.

- `id` (`uuid`, PK) — availability identifier.
- `semester_id` (`uuid`) — cohort; -> `semesters.id`.
- `meeting_id` (`uuid`) — Friday meeting; -> `meetings.id`.
- `semester_membership_id` (`uuid`) — responding person; -> `semester_memberships.id`.
- `slot` (`smallint`) — slot 1 or 2.
- `is_available` (`boolean`) — availability answer.
- `source` (`text`) — how the answer was captured.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.

### `sessions`

One mentorship conversation between a startup and mentor in slot 1 or 2 of a Friday meeting.

- `id` (`uuid`, PK) — session identifier.
- `semester_id` (`uuid`) — cohort; -> `semesters.id`.
- `topic` (`text`) — requested discussion topic.
- `status` (`text`) — request/approval/confirmation state.
- `notes` (`text`) — operational notes.
- `requested_at` (`timestamptz`) — request time.
- `confirmed_at` (`timestamptz`) — confirmation time.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.
- `format` (`text`) — in-person, virtual, or other format.
- `startup_absent` (`boolean`) — whether the startup missed the session.
- `substitute_name` (`text`) — substitute mentor name when applicable.
- `meeting_id` (`uuid`) — Friday meeting; -> `meetings.id`.
- `mentor_semester_id` (`uuid`) — mentor in this cohort; -> `mentor_semesters.id`.
- `startup_semester_id` (`uuid`) — startup in this cohort; -> `startup_semesters.id`.
- `slot` (`smallint`) — slot 1 or 2.
- `idempotency_key` (`text`) — duplicate-assignment guard.

### `session_rsvps`

One participant's current attendance response for one assigned session. The row is semester-scoped and unique per session membership. A missing row means the participant has not responded. This is a pre-session planning signal and is intentionally separate from the administrator-maintained `sessions.startup_absent` post-session fact.

- `id` (`uuid`, PK) — RSVP identifier.
- `semester_id` (`uuid`) — cohort; -> `semesters.id` and constrained to match both the session and membership.
- `session_id` (`uuid`) — assigned conversation; -> `sessions.id`.
- `semester_membership_id` (`uuid`) — responding participant; -> `semester_memberships.id`.
- `response` (`text`) — `attending` or `not_attending`; no row represents no response.
- `responded_at` (`timestamptz`) — latest explicit response time.
- `created_at` (`timestamptz`) — first response creation time.
- `updated_at` (`timestamptz`) — latest response change time.

RLS permits assigned startup teammates and the assigned mentor to read the existing response rows for their shared session, and permits semester administrators to read all responses in semesters they manage. Participants may insert or update only their own response while the confirmed session is still in the future. Unrelated participants receive no rows, and participant deletes are not granted.

## Outreach: durable directory

### `outreach_contacts`

Durable non-login record for someone Almaworks may recruit as a mentor, investor, sponsor, or other relationship.

- `id` (`uuid`, PK) — contact identifier.
- `full_name` (`text`) — contact name.
- `email` (`text`) — contact email.
- `linkedin_url` (`text`) — supplied LinkedIn URL.
- `canonical_linkedin_url` (`text`) — normalized LinkedIn identity.
- `phone` (`text`) — phone number.
- `biography` (`text`) — reusable background summary.
- `expertise_tags` (`text[]`) — expertise labels.
- `notes` (`text`) — durable notes retained across semesters.
- `created_by` (`uuid`) — internal creator; -> `profiles.id`.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.
- `relationship_types` (`text[]`) — mentor, investor, sponsor, or other classifications.
- `background_notes` (`text`) — prior relationship context retained across semesters.

### `outreach_companies`

Deduplicated organizations associated with outreach contacts.

- `id` (`uuid`, PK) — company identifier.
- `name` (`text`) — display name.
- `normalized_name` (`text`) — unique normalized identity.
- `domain` (`text`) — unique domain when known.
- `website_url` (`text`) — company website.
- `description` (`text`) — company summary.
- `sector` (`text`) — industry/sector label.
- `created_by` (`uuid`) — internal creator; -> `profiles.id`.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.

### `outreach_contact_companies`

Many-to-many employment or affiliation history between contacts and companies.

- `id` (`uuid`, PK) — relationship identifier.
- `contact_id` (`uuid`) — person; -> `outreach_contacts.id`.
- `company_id` (`uuid`) — organization; -> `outreach_companies.id`.
- `title` (`text`) — role at the company.
- `started_on` (`date`) — relationship start date.
- `ended_on` (`date`) — relationship end date.
- `is_primary` (`boolean`) — current primary affiliation.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.

## Outreach: semester pipeline

### `outreach_opportunities`

Fresh per-semester outreach state for a durable contact. Carry-forward creates a new row and resets the workflow while preserving contact history.

- `id` (`uuid`, PK) — opportunity identifier.
- `semester_id` (`uuid`) — outreach semester; -> `semesters.id`.
- `contact_id` (`uuid`) — durable person; -> `outreach_contacts.id`.
- `owner_profile_id` (`uuid`) — internal owner; -> `profiles.id`.
- `cadence_days` (`smallint`) — planned follow-up interval.
- `next_follow_up_at` (`timestamptz`) — next action time.
- `snoozed_until` (`timestamptz`) — temporary pause deadline.
- `is_silenced` (`boolean`) — whether follow-ups are disabled.
- `silenced_at` (`timestamptz`) — silence time.
- `silenced_by` (`uuid`) — actor that silenced it; -> `profiles.id`.
- `silence_reason` (`text`) — reason follow-ups stopped.
- `latest_inbound_activity_at` (`timestamptz`) — latest inbound contact.
- `latest_outbound_activity_at` (`timestamptz`) — latest Almaworks contact.
- `referred_by` (`text`) — referral source.
- `priority` (`smallint`) — semester priority.
- `created_by` (`uuid`) — internal creator; -> `profiles.id`.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change and optimistic-lock value.
- `source_channel` (`outreach_channel`) — acquisition channel.
- `stage` (`text`) — this semester's stage, reset on carry-forward.
- `relationship_types` (`text[]`) — target roles for this semester.
- `semester_notes` (`text`) — notes specific to this semester.
- `source_context` (`jsonb`) — import and provenance details.

### `outreach_activities`

Append-only timeline of outreach actions for one semester opportunity.

- `id` (`uuid`, PK) — activity identifier.
- `semester_id` (`uuid`) — outreach semester; -> `semesters.id`.
- `opportunity_id` (`uuid`) — semester opportunity; -> `outreach_opportunities.id`.
- `actor_profile_id` (`uuid`) — internal actor; -> `profiles.id`.
- `occurred_at` (`timestamptz`) — real-world event time.
- `summary` (`text`) — short human-readable note.
- `details` (`jsonb`) — structured activity context.
- `previous_owner_profile_id` (`uuid`) — owner before transfer; -> `profiles.id`.
- `new_owner_profile_id` (`uuid`) — owner after transfer; -> `profiles.id`.
- `supersedes_activity_id` (`uuid`) — corrected activity; -> `outreach_activities.id`.
- `external_message_id` (`text`) — provider/message deduplication key.
- `created_at` (`timestamptz`) — database creation time.
- `activity_kind` (`outreach_activity_kind`) — email, call, reply, note, stage change, and related kinds.
- `channel` (`outreach_channel`) — communication channel.

### `outreach_imports`

One auditable batch used to stage or commit outreach rows into a semester.

- `id` (`uuid`, PK) — import identifier.
- `semester_id` (`uuid`) — target outreach semester; -> `semesters.id`.
- `created_by` (`uuid`) — internal importer; -> `profiles.id`.
- `source_name` (`text`) — uploaded file or source label.
- `idempotency_key` (`text`) — duplicate-import guard.
- `status` (`text`) — batch processing state.
- `rows` (`jsonb`) — reviewed source rows.
- `result` (`jsonb`) — commit summary and row outcomes.
- `committed_at` (`timestamptz`) — successful commit time.
- `created_at` (`timestamptz`) — creation time.
- `updated_at` (`timestamptz`) — latest change.

## Structural guarantees

- Exactly 20 public base tables and no compatibility views.
- Row Level Security is enabled on every public table.
- Durable mentor/startup identity is separate from semester participation; history comes from memberships, not completed sessions.
- Durable outreach contacts/companies are separate from semester opportunities; carry-forward creates fresh workflow state without erasing durable notes or prior activities.
