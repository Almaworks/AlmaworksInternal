import type { SemesterExportDataset, SemesterExportScope } from "./types.ts";

export type ExportTableName =
  | "expertise_tag_aliases"
  | "expertise_tags"
  | "friday_program_assignments"
  | "friday_programs"
  | "invitations"
  | "meetings"
  | "mentor_booking_requests"
  | "mentor_booking_windows"
  | "mentor_expertise_tags"
  | "mentor_profiles"
  | "mentor_semesters"
  | "outreach_activities"
  | "outreach_companies"
  | "outreach_contact_companies"
  | "outreach_contacts"
  | "outreach_email_templates"
  | "outreach_imports"
  | "outreach_opportunities"
  | "profiles"
  | "program_audit_events"
  | "semester_memberships"
  | "semesters"
  | "session_rsvps"
  | "sessions"
  | "startup_mentor_need_tags"
  | "startup_organizations"
  | "startup_semesters"
  | "startup_team_memberships";

export interface ExportDatasetDefinition {
  columns: readonly string[];
  id: string;
  orderBy: readonly string[];
  scopes: readonly SemesterExportScope[];
  sourceColumns?: readonly string[];
  table: ExportTableName;
}

const BOTH = ["semester", "outreach"] as const;
const SEMESTER = ["semester"] as const;

export const semesterExportCatalog: readonly ExportDatasetDefinition[] = [
  { id: "semester", table: "semesters", scopes: SEMESTER, columns: ["id", "name", "start_date", "end_date", "lifecycle_status", "is_active", "archived_at", "closed_at", "configuration_template_version", "time_zone", "location", "session_cadence", "default_format", "configuration_unknown_key_count", "created_at", "updated_at"], sourceColumns: ["id", "name", "start_date", "end_date", "lifecycle_status", "is_active", "archived_at", "closed_at", "configuration_template_version", "created_at", "updated_at", "configuration"], orderBy: ["id"] },
  { id: "semester_memberships", table: "semester_memberships", scopes: SEMESTER, columns: ["id", "semester_id", "profile_id", "role", "status", "invited_at", "onboarding_started_at", "onboarding_completed_at", "activated_at", "suspended_at", "alumni_at", "onboarding_items", "onboarding_unknown_item_count", "onboarding_unknown_payload_key_count", "created_at", "updated_at"], sourceColumns: ["id", "semester_id", "profile_id", "role", "status", "invited_at", "onboarding_started_at", "onboarding_completed_at", "activated_at", "suspended_at", "alumni_at", "onboarding_data", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "profiles", table: "profiles", scopes: BOTH, columns: ["id", "email", "full_name", "photo_path", "role", "status", "is_active", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "mentor_profiles", table: "mentor_profiles", scopes: SEMESTER, columns: ["profile_id", "biography", "company", "title", "linkedin_url", "website_url", "photo_url", "expertise_tags", "created_at", "updated_at"], orderBy: ["profile_id"] },
  { id: "mentor_semesters", table: "mentor_semesters", scopes: SEMESTER, columns: ["id", "semester_id", "semester_membership_id", "capacity", "general_availability", "mentorship_goals", "opening_talk", "per_week_availability", "preferred_format", "readiness_status", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "mentor_expertise_tags", table: "mentor_expertise_tags", scopes: SEMESTER, columns: ["mentor_profile_id", "expertise_tag_id", "created_at"], orderBy: ["mentor_profile_id", "expertise_tag_id"] },
  { id: "expertise_tags", table: "expertise_tags", scopes: SEMESTER, columns: ["id", "name", "normalized_name", "created_by_profile_id", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "expertise_tag_aliases", table: "expertise_tag_aliases", scopes: SEMESTER, columns: ["id", "expertise_tag_id", "normalized_alias", "created_at"], orderBy: ["id"] },
  { id: "startup_organizations", table: "startup_organizations", scopes: SEMESTER, columns: ["id", "name", "slug", "description", "industry", "website_url", "logo_url", "legacy_founder_name", "legacy_founders", "durable_contact_unknown_key_count", "created_at", "updated_at"], sourceColumns: ["id", "name", "slug", "description", "industry", "website_url", "logo_url", "durable_contact_data", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "startup_semesters", table: "startup_semesters", scopes: SEMESTER, columns: ["id", "semester_id", "startup_organization_id", "company_snapshot", "goals", "mentor_need_context", "mentor_need_no_preference", "mentorship_needs", "readiness_status", "stage", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "startup_team_memberships", table: "startup_team_memberships", scopes: SEMESTER, columns: ["id", "semester_id", "semester_membership_id", "startup_semester_id", "is_primary_contact", "created_at"], orderBy: ["id"] },
  { id: "startup_mentor_need_tags", table: "startup_mentor_need_tags", scopes: SEMESTER, columns: ["semester_id", "startup_semester_id", "expertise_tag_id", "priority", "created_at"], orderBy: ["startup_semester_id", "expertise_tag_id"] },
  { id: "meetings", table: "meetings", scopes: SEMESTER, columns: ["id", "semester_id", "meeting_date", "label", "slot_1_starts_at", "slot_1_ends_at", "slot_2_starts_at", "slot_2_ends_at", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "sessions", table: "sessions", scopes: SEMESTER, columns: ["id", "semester_id", "meeting_id", "mentor_semester_id", "startup_semester_id", "slot", "status", "format", "topic", "notes", "startup_absent", "substitute_name", "requested_at", "confirmed_at", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "session_rsvps", table: "session_rsvps", scopes: SEMESTER, columns: ["id", "semester_id", "session_id", "semester_membership_id", "response", "responded_at", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "friday_programs", table: "friday_programs", scopes: SEMESTER, columns: ["id", "semester_id", "meeting_id", "agenda_version", "group_a_facilitator", "group_b_facilitator", "startup_count", "generated_by_profile_id", "generated_at"], orderBy: ["id"] },
  { id: "friday_program_assignments", table: "friday_program_assignments", scopes: SEMESTER, columns: ["id", "semester_id", "program_id", "startup_semester_id", "startup_organization_id", "startup_name", "startup_slug", "group_code", "group_position", "created_at"], orderBy: ["id"] },
  { id: "mentor_booking_windows", table: "mentor_booking_windows", scopes: SEMESTER, columns: ["id", "semester_id", "mentor_semester_id", "mentor_profile_id", "mentor_name", "starts_at", "ends_at", "withdrawn_at", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "mentor_booking_requests", table: "mentor_booking_requests", scopes: SEMESTER, columns: ["id", "semester_id", "window_id", "mentor_semester_id", "mentor_profile_id", "mentor_name", "startup_semester_id", "startup_organization_id", "startup_name", "requested_by_profile_id", "topic", "status", "starts_at", "ends_at", "requested_at", "responded_at", "cancelled_at", "updated_at"], orderBy: ["id"] },
  { id: "invitations", table: "invitations", scopes: SEMESTER, columns: ["id", "semester_id", "email", "full_name", "role", "status", "startup_semester_id", "invited_by", "matched_profile_id", "send_attempts", "sent_at", "accepted_at", "revoked_at", "expires_at", "last_error_code", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "program_audit_events", table: "program_audit_events", scopes: SEMESTER, columns: ["id", "semester_id", "actor_profile_id", "action", "subject_type", "subject_id", "detail_next_semester_id", "detail_alumni_count", "detail_previous_semester_id", "detail_bulk", "detail_status", "detail_override_types", "detail_source_semester_id", "detail_imported_count", "detail_role", "detail_mentor_semester_id", "detail_profile_is_active", "detail_suspended_membership_ids", "detail_reason", "detail_target_profile_id", "detail_prior_statuses", "detail_affected_membership_ids", "detail_membership_status", "details_unknown_key_count", "created_at"], sourceColumns: ["id", "semester_id", "actor_profile_id", "action", "subject_type", "subject_id", "details", "created_at"], orderBy: ["id"] },
  { id: "outreach_opportunities", table: "outreach_opportunities", scopes: BOTH, columns: ["id", "semester_id", "contact_id", "owner_profile_id", "stage", "priority", "relationship_types", "source_channel", "referred_by", "cadence_days", "next_follow_up_at", "snoozed_until", "latest_inbound_activity_at", "latest_outbound_activity_at", "is_silenced", "silence_reason", "silenced_at", "silenced_by", "semester_notes", "source_import_id", "source_name", "carried_from_semester_id", "carried_from_opportunity_id", "source_context_unknown_key_count", "archived_at", "archived_by", "created_by", "created_at", "updated_at"], sourceColumns: ["id", "semester_id", "contact_id", "owner_profile_id", "stage", "priority", "relationship_types", "source_channel", "referred_by", "cadence_days", "next_follow_up_at", "snoozed_until", "latest_inbound_activity_at", "latest_outbound_activity_at", "is_silenced", "silence_reason", "silenced_at", "silenced_by", "semester_notes", "source_context", "archived_at", "archived_by", "created_by", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "outreach_contacts", table: "outreach_contacts", scopes: BOTH, columns: ["id", "full_name", "email", "phone", "linkedin_url", "canonical_linkedin_url", "biography", "background_notes", "notes", "expertise_tags", "relationship_types", "archived_at", "archived_by", "created_by", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "outreach_contact_companies", table: "outreach_contact_companies", scopes: BOTH, columns: ["id", "contact_id", "company_id", "title", "is_primary", "started_on", "ended_on", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "outreach_companies", table: "outreach_companies", scopes: BOTH, columns: ["id", "name", "normalized_name", "domain", "sector", "website_url", "description", "created_by", "created_at", "updated_at"], orderBy: ["id"] },
  { id: "outreach_activities", table: "outreach_activities", scopes: BOTH, columns: ["id", "semester_id", "opportunity_id", "activity_kind", "channel", "summary", "occurred_at", "actor_profile_id", "previous_owner_profile_id", "new_owner_profile_id", "supersedes_activity_id", "detail_type", "detail_stage", "detail_reason", "detail_is_silenced", "detail_next_follow_up_at", "detail_previous_snoozed_until", "detail_snoozed_until", "detail_previous_owner_profile_id", "detail_new_owner_profile_id", "detail_membership_id", "details_unknown_key_count", "created_at"], sourceColumns: ["id", "semester_id", "opportunity_id", "activity_kind", "channel", "summary", "occurred_at", "actor_profile_id", "previous_owner_profile_id", "new_owner_profile_id", "supersedes_activity_id", "details", "created_at"], orderBy: ["id"] },
  { id: "outreach_imports", table: "outreach_imports", scopes: BOTH, columns: ["id", "semester_id", "source_name", "status", "created_by", "total_rows", "matched_rows", "create_rows", "review_required_rows", "invalid_rows", "rows_with_issues", "committed_rows", "result_error", "result_unknown_key_count", "created_at", "committed_at", "updated_at"], sourceColumns: ["id", "semester_id", "source_name", "status", "created_by", "rows", "result", "created_at", "committed_at", "updated_at"], orderBy: ["id"] },
  { id: "outreach_email_templates", table: "outreach_email_templates", scopes: BOTH, columns: ["id", "semester_id", "name", "subject_template", "body_template", "archived_at", "created_by", "created_at", "updated_at"], orderBy: ["id"] },
] as const;

export const emailHistoryColumns = ["message_id", "opportunity_id", "template_id", "status", "recipient_name", "recipient_email", "sender", "subject", "body", "scheduled_at", "created_at", "accepted_at", "sent_at", "delivered_at", "cancelled_at", "provider_status", "provider_checked_at", "last_error", "activity_id"] as const;

export const outreachImportRowColumns = ["import_id", "row_number", "full_name", "email", "linkedin_url", "company", "company_domain", "stage", "relationship_labels", "owner_name", "owner_id", "issues", "preview_disposition", "preview_contact_id", "suggested_contact_id", "match_source", "structured_unknown_key_count"] as const;

export const unresolvedProfileReferenceColumns = ["profile_id"] as const;

export const exportExclusions = [
  "The existing sessions.notes field is included; a future dedicated session Q&A/notes module is not yet implemented and is not included.",
  "Newsletter records are not yet implemented and are not included.",
  "Photo and logo paths are included as references; binary photo assets are not included.",
  "Invitation lifecycle metadata is included; authentication identities, invite tokens and free-form delivery error messages are not included.",
  "Known onboarding, startup contact, Outreach source-context and activity-detail fields are projected; unknown JSON keys are counted per row but their names and values are omitted.",
  "Raw uploaded Outreach import columns are not included; normalized preview fields and safe aggregate results are included with unknown structured keys counted.",
  "Email idempotency data, signatures, signing-key identifiers and raw provider receipts are not included.",
  "Outreach import row matching reflects the saved preview; historical final per-row review choices were not persisted and cannot be reconstructed.",
  "The archive uses a sequence of RLS-protected reads; records changed while an export is generated may appear in a later export.",
  "Optional actor/creator profile IDs remain in their source rows; any RLS-inaccessible display profiles are listed in unresolved_profile_references.",
  "Direct ZIP downloads are limited to 4 MiB until larger authenticated exports use managed storage or streaming.",
] as const;

export function definitionsForScope(scope: SemesterExportScope): readonly ExportDatasetDefinition[] {
  return semesterExportCatalog.filter((definition) => definition.scopes.includes(scope));
}

export function emptyDataset(definition: ExportDatasetDefinition): SemesterExportDataset {
  return { id: definition.id, columns: definition.columns, rows: [] };
}
