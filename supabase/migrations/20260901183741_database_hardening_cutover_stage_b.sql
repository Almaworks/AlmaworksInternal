set local check_function_bodies = off;

revoke all on function "private"."can_manage_semester"(uuid, uuid) from "authenticated";

grant execute on function "private"."can_manage_semester"(uuid, uuid) to "authenticated";

revoke all on function "private"."can_read_mentor_profile"(uuid, uuid) from "authenticated";

grant execute on function "private"."can_read_mentor_profile"(uuid, uuid) to "authenticated";

revoke all on function "private"."can_read_outreach_relationship_labels"(uuid) from "authenticated";

grant execute on function "private"."can_read_outreach_relationship_labels"(uuid) to "authenticated";

revoke all on function "private"."current_profile_id"(uuid) from "authenticated";

grant execute on function "private"."current_profile_id"(uuid) to "authenticated";

revoke all on function "private"."has_outreach_company_access"(uuid, uuid) from "authenticated";

grant execute on function "private"."has_outreach_company_access"(uuid, uuid) to "authenticated";

revoke all on function "private"."has_outreach_contact_access"(uuid, uuid) from "authenticated";

grant execute on function "private"."has_outreach_contact_access"(uuid, uuid) to "authenticated";

revoke all on function "private"."has_semester_role"(uuid, public.user_role[], uuid) from "authenticated";

grant execute on function "private"."has_semester_role"(uuid, public.user_role[], uuid) to "authenticated";

revoke all on function "private"."is_super_admin"(uuid) from "authenticated";

grant execute on function "private"."is_super_admin"(uuid) to "authenticated";

revoke all on function "public"."activate_semester_transition"(uuid, uuid) from "authenticated";

grant execute on function "public"."activate_semester_transition"(uuid, uuid) to "authenticated";

revoke all on function "public"."authorize_semester_member_identity_update"(uuid, uuid) from "authenticated";

grant execute on function "public"."authorize_semester_member_identity_update"(uuid, uuid) to "authenticated";

revoke all on function "public"."bulk_set_membership_activity"(uuid, uuid[], boolean) from "authenticated";

grant execute on function "public"."bulk_set_membership_activity"(uuid, uuid[], boolean) to "authenticated";

revoke all on function "public"."can_manage_any_outreach"(uuid) from "authenticated";

grant execute on function "public"."can_manage_any_outreach"(uuid) to "authenticated";

revoke all on function "public"."can_manage_semester"(uuid, uuid) from "authenticated";

grant execute on function "public"."can_manage_semester"(uuid, uuid) to "authenticated";

revoke all on function "public"."carry_forward_outreach_contacts"(uuid, uuid, uuid[]) from "authenticated";

grant execute on function "public"."carry_forward_outreach_contacts"(uuid, uuid, uuid[]) to "authenticated";

revoke all on function "public"."commit_mentor_assignment"(uuid, uuid, smallint, uuid, uuid, text, text, text, text[], text, jsonb) from "authenticated";

grant execute on function "public"."commit_mentor_assignment"(uuid, uuid, smallint, uuid, uuid, text, text, text, text[], text, jsonb) to "authenticated";

revoke all on function "public"."create_mentor_records"(uuid, uuid, uuid, text, text, text, text[], boolean, text, text, text, text, text) from "service_role";

grant execute on function "public"."create_mentor_records"(uuid, uuid, uuid, text, text, text, text[], boolean, text, text, text, text, text) to "service_role";

revoke all on function "public"."create_semester_draft"(uuid, text, date, date, jsonb) from "authenticated";

grant execute on function "public"."create_semester_draft"(uuid, text, date, date, jsonb) to "authenticated";

revoke all on function "public"."import_prior_semester_memberships"(uuid, uuid, uuid[]) from "authenticated";

grant execute on function "public"."import_prior_semester_memberships"(uuid, uuid, uuid[]) to "authenticated";

revoke all
  on function "public"."log_outreach_activity"(uuid, public.outreach_activity_kind, timestamp with time zone, public.outreach_channel, text, jsonb, timestamp
    with time zone, public.outreach_stage, timestamp with time zone)
  from "authenticated";

grant execute
  on function "public"."log_outreach_activity"(uuid, public.outreach_activity_kind, timestamp with time zone, public.outreach_channel, text, jsonb, timestamp
    with time zone, public.outreach_stage, timestamp with time zone)
  to "authenticated";

revoke all on function "public"."move_startup_team_membership"(uuid, uuid, uuid) from "authenticated";

grant execute on function "public"."move_startup_team_membership"(uuid, uuid, uuid) to "authenticated";

revoke all on function "public"."release_inactive_owner_work"(uuid) from "authenticated";

grant execute on function "public"."release_inactive_owner_work"(uuid) to "authenticated";

revoke all on function "public"."replace_draft_meetings"(uuid, jsonb) from "authenticated";

grant execute on function "public"."replace_draft_meetings"(uuid, jsonb) to "authenticated";

revoke all on function "public"."reset_outreach_opportunities"(uuid, uuid[]) from "authenticated";

grant execute on function "public"."reset_outreach_opportunities"(uuid, uuid[]) to "authenticated";

revoke all on function "public"."set_outreach_silence"(uuid, boolean, text, timestamp with time zone, timestamp with time zone) from "authenticated";

grant execute on function "public"."set_outreach_silence"(uuid, boolean, text, timestamp with time zone, timestamp with time zone) to "authenticated";

revoke all on function "public"."set_outreach_snooze"(uuid, timestamp with time zone, text, timestamp with time zone) from "authenticated";

grant execute on function "public"."set_outreach_snooze"(uuid, timestamp with time zone, text, timestamp with time zone) to "authenticated";

revoke all on function "public"."set_semester_member_access"(uuid, uuid, uuid, public.user_role, boolean, text, text) from "service_role";

grant execute on function "public"."set_semester_member_access"(uuid, uuid, uuid, public.user_role, boolean, text, text) to "service_role";

revoke all on function "public"."suspend_outreach_membership"(uuid, uuid, text, timestamp with time zone) from "authenticated";

grant execute on function "public"."suspend_outreach_membership"(uuid, uuid, text, timestamp with time zone) to "authenticated";

revoke all on function "public"."transfer_outreach_owner"(uuid, uuid, text, timestamp with time zone) from "authenticated";

grant execute on function "public"."transfer_outreach_owner"(uuid, uuid, text, timestamp with time zone) to "authenticated";

revoke all on function "public"."update_mentor_records"(uuid, uuid, jsonb) from "service_role";

grant execute on function "public"."update_mentor_records"(uuid, uuid, jsonb) to "service_role";

revoke all on function "public"."update_own_onboarding_progress"(uuid, uuid, jsonb, boolean) from "authenticated";

grant execute on function "public"."update_own_onboarding_progress"(uuid, uuid, jsonb, boolean) to "authenticated";

revoke all on function "public"."update_startup_records"(uuid, text, text, text, text, text, text[], text[]) from "authenticated";

grant execute on function "public"."update_startup_records"(uuid, text, text, text, text, text, text[], text[]) to "authenticated";

revoke all
  on function "public"."upsert_outreach_contact_bundle"(uuid, uuid, text, text, text, text, text, uuid, text, text, text, text, uuid, text, text[], jsonb)
  from "authenticated";

grant execute
  on function "public"."upsert_outreach_contact_bundle"(uuid, uuid, text, text, text, text, text, uuid, text, text, text, text, uuid, text, text[], jsonb)
  to "authenticated";

revoke all ("is_available") on table "public"."meeting_availability" from "authenticated";

grant insert ("is_available"), update ("is_available") on table "public"."meeting_availability" to "authenticated";

revoke all ("meeting_id") on table "public"."meeting_availability" from "authenticated";

grant insert ("meeting_id"), update ("meeting_id") on table "public"."meeting_availability" to "authenticated";

revoke all ("semester_id") on table "public"."meeting_availability" from "authenticated";

grant insert ("semester_id"), update ("semester_id") on table "public"."meeting_availability" to "authenticated";

revoke all ("semester_membership_id") on table "public"."meeting_availability" from "authenticated";

grant insert ("semester_membership_id"), update ("semester_membership_id") on table "public"."meeting_availability" to "authenticated";

revoke all ("slot") on table "public"."meeting_availability" from "authenticated";

grant insert ("slot"), update ("slot") on table "public"."meeting_availability" to "authenticated";

revoke all ("source") on table "public"."meeting_availability" from "authenticated";

grant insert ("source"), update ("source") on table "public"."meeting_availability" to "authenticated";

revoke all ("label") on table "public"."meetings" from "service_role";

grant insert ("label") on table "public"."meetings" to "service_role";

revoke all ("meeting_date") on table "public"."meetings" from "service_role";

grant insert ("meeting_date") on table "public"."meetings" to "service_role";

revoke all ("semester_id") on table "public"."meetings" from "service_role";

grant insert ("semester_id") on table "public"."meetings" to "service_role";

revoke all ("company_id") on table "public"."outreach_contact_companies" from "authenticated";

grant update ("company_id") on table "public"."outreach_contact_companies" to "authenticated";

revoke all ("contact_id") on table "public"."outreach_contact_companies" from "authenticated";

grant update ("contact_id") on table "public"."outreach_contact_companies" to "authenticated";

revoke all ("is_primary") on table "public"."outreach_contact_companies" from "authenticated";

grant update ("is_primary") on table "public"."outreach_contact_companies" to "authenticated";

revoke all ("biography") on table "public"."outreach_contacts" from "authenticated";

grant update ("biography") on table "public"."outreach_contacts" to "authenticated";

revoke all ("email") on table "public"."outreach_contacts" from "authenticated";

grant update ("email") on table "public"."outreach_contacts" to "authenticated";

revoke all ("expertise_tags") on table "public"."outreach_contacts" from "authenticated";

grant update ("expertise_tags") on table "public"."outreach_contacts" to "authenticated";

revoke all ("full_name") on table "public"."outreach_contacts" from "authenticated";

grant update ("full_name") on table "public"."outreach_contacts" to "authenticated";

revoke all ("linkedin_url") on table "public"."outreach_contacts" from "authenticated";

grant update ("linkedin_url") on table "public"."outreach_contacts" to "authenticated";

revoke all ("notes") on table "public"."outreach_contacts" from "authenticated";

grant update ("notes") on table "public"."outreach_contacts" to "authenticated";

revoke all ("phone") on table "public"."outreach_contacts" from "authenticated";

grant update ("phone") on table "public"."outreach_contacts" to "authenticated";

revoke all ("committed_at") on table "public"."outreach_imports" from "authenticated";

grant update ("committed_at") on table "public"."outreach_imports" to "authenticated";

revoke all ("created_by") on table "public"."outreach_imports" from "authenticated";

grant insert ("created_by") on table "public"."outreach_imports" to "authenticated";

revoke all ("idempotency_key") on table "public"."outreach_imports" from "authenticated";

grant insert ("idempotency_key"), update ("idempotency_key") on table "public"."outreach_imports" to "authenticated";

revoke all ("result") on table "public"."outreach_imports" from "authenticated";

grant insert ("result"), update ("result") on table "public"."outreach_imports" to "authenticated";

revoke all ("rows") on table "public"."outreach_imports" from "authenticated";

grant insert ("rows") on table "public"."outreach_imports" to "authenticated";

revoke all ("semester_id") on table "public"."outreach_imports" from "authenticated";

grant insert ("semester_id") on table "public"."outreach_imports" to "authenticated";

revoke all ("source_name") on table "public"."outreach_imports" from "authenticated";

grant insert ("source_name") on table "public"."outreach_imports" to "authenticated";

revoke all ("status") on table "public"."outreach_imports" from "authenticated";

grant insert ("status"), update ("status") on table "public"."outreach_imports" to "authenticated";

revoke all ("updated_at") on table "public"."outreach_imports" from "authenticated";

grant update ("updated_at") on table "public"."outreach_imports" to "authenticated";

revoke all ("contact_id") on table "public"."outreach_opportunities" from "authenticated";

grant update ("contact_id") on table "public"."outreach_opportunities" to "authenticated";

revoke all ("created_by") on table "public"."outreach_opportunities" from "authenticated";

grant update ("created_by") on table "public"."outreach_opportunities" to "authenticated";

revoke all ("owner_profile_id") on table "public"."outreach_opportunities" from "authenticated";

grant update ("owner_profile_id") on table "public"."outreach_opportunities" to "authenticated";

revoke all ("relationship_types") on table "public"."outreach_opportunities" from "authenticated";

grant update ("relationship_types") on table "public"."outreach_opportunities" to "authenticated";

revoke all ("semester_id") on table "public"."outreach_opportunities" from "authenticated";

grant update ("semester_id") on table "public"."outreach_opportunities" to "authenticated";

revoke all ("source_context") on table "public"."outreach_opportunities" from "authenticated";

grant update ("source_context") on table "public"."outreach_opportunities" to "authenticated";

revoke all ("stage") on table "public"."outreach_opportunities" from "authenticated";

grant update ("stage") on table "public"."outreach_opportunities" to "authenticated";

revoke all ("full_name") on table "public"."profiles" from "authenticated";

grant update ("full_name") on table "public"."profiles" to "authenticated";

revoke all ("status") on table "public"."profiles" from "service_role";

grant update ("status") on table "public"."profiles" to "service_role";

revoke all ("profile_id") on table "public"."semester_memberships" from "service_role";

grant insert ("profile_id") on table "public"."semester_memberships" to "service_role";

revoke all ("role") on table "public"."semester_memberships" from "service_role";

grant insert ("role") on table "public"."semester_memberships" to "service_role";

revoke all ("semester_id") on table "public"."semester_memberships" from "service_role";

grant insert ("semester_id") on table "public"."semester_memberships" to "service_role";

revoke all ("status") on table "public"."semester_memberships" from "service_role";

grant insert ("status"), update ("status") on table "public"."semester_memberships" to "service_role";

revoke all ("format") on table "public"."sessions" from "authenticated";

grant insert ("format") on table "public"."sessions" to "authenticated";

revoke all ("meeting_id") on table "public"."sessions" from "authenticated";

grant insert ("meeting_id") on table "public"."sessions" to "authenticated";

revoke all ("mentor_semester_id") on table "public"."sessions" from "authenticated";

grant insert ("mentor_semester_id") on table "public"."sessions" to "authenticated";

revoke all ("semester_id") on table "public"."sessions" from "authenticated";

grant insert ("semester_id") on table "public"."sessions" to "authenticated";

revoke all ("slot") on table "public"."sessions" from "authenticated";

grant insert ("slot") on table "public"."sessions" to "authenticated";

revoke all ("startup_semester_id") on table "public"."sessions" from "authenticated";

grant insert ("startup_semester_id") on table "public"."sessions" to "authenticated";

revoke all ("status") on table "public"."sessions" from "authenticated";

grant insert ("status"), update ("status") on table "public"."sessions" to "authenticated";

revoke all ("topic") on table "public"."sessions" from "authenticated";

grant insert ("topic") on table "public"."sessions" to "authenticated";

revoke all ("format") on table "public"."sessions" from "service_role";

grant insert ("format"), update ("format") on table "public"."sessions" to "service_role";

revoke all ("meeting_id") on table "public"."sessions" from "service_role";

grant insert ("meeting_id") on table "public"."sessions" to "service_role";

revoke all ("mentor_semester_id") on table "public"."sessions" from "service_role";

grant insert ("mentor_semester_id"), update ("mentor_semester_id") on table "public"."sessions" to "service_role";

revoke all ("semester_id") on table "public"."sessions" from "service_role";

grant insert ("semester_id") on table "public"."sessions" to "service_role";

revoke all ("slot") on table "public"."sessions" from "service_role";

grant insert ("slot"), update ("slot") on table "public"."sessions" to "service_role";

revoke all ("startup_absent") on table "public"."sessions" from "service_role";

grant insert ("startup_absent"), update ("startup_absent") on table "public"."sessions" to "service_role";

revoke all ("startup_semester_id") on table "public"."sessions" from "service_role";

grant insert ("startup_semester_id"), update ("startup_semester_id") on table "public"."sessions" to "service_role";

revoke all ("status") on table "public"."sessions" from "service_role";

grant insert ("status"), update ("status") on table "public"."sessions" to "service_role";

revoke all ("substitute_name") on table "public"."sessions" from "service_role";

grant insert ("substitute_name"), update ("substitute_name") on table "public"."sessions" to "service_role";

revoke all ("topic") on table "public"."sessions" from "service_role";

grant insert ("topic"), update ("topic") on table "public"."sessions" to "service_role";

revoke all ("description") on table "public"."startup_organizations" from "service_role";

grant insert ("description") on table "public"."startup_organizations" to "service_role";

revoke all ("industry") on table "public"."startup_organizations" from "service_role";

grant insert ("industry") on table "public"."startup_organizations" to "service_role";

revoke all ("name") on table "public"."startup_organizations" from "service_role";

grant insert ("name") on table "public"."startup_organizations" to "service_role";

revoke all ("slug") on table "public"."startup_organizations" from "service_role";

grant insert ("slug") on table "public"."startup_organizations" to "service_role";

revoke all ("goals") on table "public"."startup_semesters" from "authenticated";

grant update ("goals") on table "public"."startup_semesters" to "authenticated";

revoke all ("mentor_need_context") on table "public"."startup_semesters" from "authenticated";

grant update ("mentor_need_context") on table "public"."startup_semesters" to "authenticated";

revoke all ("mentor_need_no_preference") on table "public"."startup_semesters" from "authenticated";

grant update ("mentor_need_no_preference") on table "public"."startup_semesters" to "authenticated";

revoke all ("mentorship_needs") on table "public"."startup_semesters" from "authenticated";

grant update ("mentorship_needs") on table "public"."startup_semesters" to "authenticated";

revoke all ("preferred_expertise_tags") on table "public"."startup_semesters" from "authenticated";

grant update ("preferred_expertise_tags") on table "public"."startup_semesters" to "authenticated";

revoke all ("preferred_expertise_tags") on table "public"."startup_semesters" from "service_role";

grant insert ("preferred_expertise_tags") on table "public"."startup_semesters" to "service_role";

revoke all ("readiness_status") on table "public"."startup_semesters" from "service_role";

grant insert ("readiness_status") on table "public"."startup_semesters" to "service_role";

revoke all ("semester_id") on table "public"."startup_semesters" from "service_role";

grant insert ("semester_id") on table "public"."startup_semesters" to "service_role";

revoke all ("stage") on table "public"."startup_semesters" from "service_role";

grant insert ("stage") on table "public"."startup_semesters" to "service_role";

revoke all ("startup_organization_id") on table "public"."startup_semesters" from "service_role";

grant insert ("startup_organization_id") on table "public"."startup_semesters" to "service_role";

revoke all ("semester_id") on table "public"."startup_team_memberships" from "service_role";

grant insert ("semester_id") on table "public"."startup_team_memberships" to "service_role";

revoke all ("semester_membership_id") on table "public"."startup_team_memberships" from "service_role";

grant insert ("semester_membership_id") on table "public"."startup_team_memberships" to "service_role";

revoke all ("startup_semester_id") on table "public"."startup_team_memberships" from "service_role";

grant insert ("startup_semester_id") on table "public"."startup_team_memberships" to "service_role";
