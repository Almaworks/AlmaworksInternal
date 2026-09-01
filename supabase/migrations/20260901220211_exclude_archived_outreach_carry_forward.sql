set local check_function_bodies = off;

create or replace function public.carry_forward_outreach_contacts (
  p_source_semester_id uuid,
  p_target_semester_id uuid,
  p_contact_ids        uuid[]
)
  returns integer
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare inserted_count integer;
begin
  if auth.uid() is null
    or not public.can_manage_semester(p_source_semester_id, auth.uid())
    or not public.can_manage_semester(p_target_semester_id, auth.uid()) then
    raise exception 'Not authorized to carry outreach contacts between semesters';
  end if;
  insert into public.outreach_opportunities (
    semester_id, contact_id, relationship_types, stage, owner_profile_id,
    next_follow_up_at, snoozed_until, is_silenced, silenced_at, silenced_by,
    silence_reason, semester_notes, source_context, created_by
  )
  select p_target_semester_id, source.contact_id, source.relationship_types, 'not_contacted', null,
    null, null, false, null, null, null, null,
    jsonb_build_object('carried_from_semester_id', p_source_semester_id, 'carried_from_opportunity_id', source.id),
    private.current_profile_id()
  from public.outreach_opportunities source
  join public.outreach_contacts contact on contact.id = source.contact_id
  where source.semester_id = p_source_semester_id
    and source.contact_id = any(p_contact_ids)
    and source.archived_at is null
    and contact.archived_at is null
  on conflict (semester_id, contact_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;
