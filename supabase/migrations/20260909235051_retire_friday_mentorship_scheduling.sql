set local check_function_bodies = off;

revoke all on function "public"."commit_mentor_assignment"(uuid, uuid, smallint, uuid, uuid, text, text, text, text[], text, jsonb) from "authenticated";

revoke all ("format") on table "public"."sessions" from "authenticated";

revoke all ("meeting_id") on table "public"."sessions" from "authenticated";

revoke all ("mentor_semester_id") on table "public"."sessions" from "authenticated";

revoke all ("semester_id") on table "public"."sessions" from "authenticated";

revoke all ("slot") on table "public"."sessions" from "authenticated";

revoke all ("startup_semester_id") on table "public"."sessions" from "authenticated";

revoke all ("topic") on table "public"."sessions" from "authenticated";

create or replace function private.guard_mentor_booking_window()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
declare
  actor_profile uuid := private.current_profile_id();
  canonical_mentor record;
begin
  if tg_op='INSERT' then
    select term.id as mentor_semester_id,membership.profile_id,profile.full_name,
      coalesce(nullif(btrim(semester.configuration->>'timezone'),''),'America/New_York') as timezone
      into canonical_mentor
    from public.mentor_semesters term
    join public.semester_memberships membership on membership.id=term.semester_membership_id and membership.semester_id=term.semester_id
    join public.profiles profile on profile.id=membership.profile_id
    join public.semesters semester on semester.id=term.semester_id
    where term.semester_id=new.semester_id and membership.profile_id=actor_profile
      and membership.role='mentor' and membership.status='active' and semester.is_active;
    if canonical_mentor.mentor_semester_id is null then raise exception 'Active owning mentor required' using errcode='42501'; end if;
    if new.starts_at<=now() or new.ends_at<=new.starts_at then raise exception 'Availability must be a future positive interval' using errcode='22023'; end if;
    if extract(isodow from new.starts_at at time zone canonical_mentor.timezone)=5 then
      raise exception 'Independent mentor availability cannot be published on Fridays' using errcode='22023';
    end if;
    new.mentor_semester_id:=canonical_mentor.mentor_semester_id;
    new.mentor_profile_id:=canonical_mentor.profile_id;
    new.mentor_name:=coalesce(nullif(btrim(canonical_mentor.full_name),''),'Mentor');
    new.withdrawn_at:=null; new.created_at:=now(); new.updated_at:=now();
    return new;
  end if;
  if tg_op='UPDATE' then
    if row(old.id,old.semester_id,old.mentor_semester_id,old.mentor_profile_id,old.mentor_name,old.starts_at,old.ends_at,old.created_at)
       is distinct from row(new.id,new.semester_id,new.mentor_semester_id,new.mentor_profile_id,new.mentor_name,new.starts_at,new.ends_at,new.created_at)
    then raise exception 'Published availability fields are immutable' using errcode='42501'; end if;
    if old.withdrawn_at is not null then
      if new.withdrawn_at is distinct from old.withdrawn_at then raise exception 'Withdrawn availability is immutable' using errcode='55000'; end if;
      return old;
    end if;
    if actor_profile is distinct from old.mentor_profile_id then raise exception 'Only the owning mentor can withdraw availability' using errcode='42501'; end if;
    if old.starts_at<=now() then raise exception 'Only future availability can be withdrawn' using errcode='55000'; end if;
    if new.withdrawn_at is null then raise exception 'Availability update must withdraw the window' using errcode='42501'; end if;
    if exists(select 1 from public.mentor_booking_window_claims claim where claim.window_id=old.id) then
      raise exception 'Availability with a live request cannot be withdrawn' using errcode='55000';
    end if;
    new.withdrawn_at:=now(); new.updated_at:=now(); return new;
  end if;
  raise exception 'Availability records cannot be deleted' using errcode='42501';
end;
$function$;

revoke all ("status") on table "public"."sessions" from "authenticated";

grant update ("status") on table "public"."sessions" to "authenticated";
