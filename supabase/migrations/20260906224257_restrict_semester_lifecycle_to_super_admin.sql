set local check_function_bodies = off;

drop policy "owners or super admins read platform roles" on "public"."platform_roles";

create or replace function public.activate_semester_transition (
  p_source_semester_id uuid,
  p_target_semester_id uuid
)
  returns table (
    closed_semester_id uuid,
    active_semester_id uuid,
    alumni_count       integer
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_alumni_count integer;
begin
  if p_source_semester_id=p_target_semester_id then raise exception 'Source and target semesters must differ' using errcode='22023'; end if;
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then raise exception 'Platform super-administrator access required' using errcode='42501'; end if;
  if not exists(select 1 from public.semesters where id=p_source_semester_id and is_active) or not exists(select 1 from public.semesters where id=p_target_semester_id and lifecycle_status='draft') then raise exception 'Transition requires an active source and draft target semester' using errcode='22023'; end if;
  update public.semester_memberships set status='alumni',alumni_at=now(),updated_at=now() where semester_id=p_source_semester_id and role<>'admin' and status in('onboarding','active');
  get diagnostics v_alumni_count=row_count;
  update public.semesters set is_active=false,lifecycle_status='closed',closed_at=now(),updated_at=now() where id=p_source_semester_id;
  update public.semesters set is_active=true,lifecycle_status='active',closed_at=null,updated_at=now() where id=p_target_semester_id;
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details) values
    (p_source_semester_id,private.current_profile_id(),'semester.closed','semester',p_source_semester_id,jsonb_build_object('next_semester_id',p_target_semester_id,'alumni_count',v_alumni_count)),
    (p_target_semester_id,private.current_profile_id(),'semester.activated','semester',p_target_semester_id,jsonb_build_object('previous_semester_id',p_source_semester_id));
  return query select p_source_semester_id,p_target_semester_id,v_alumni_count;
end;
$function$;

create or replace function public.create_semester_draft (
  p_source_semester_id uuid,
  p_name               text,
  p_start_date         date,
  p_end_date           date,
  p_configuration      jsonb
)
  returns table (
    semester_id   uuid,
    semester_name text
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_semester_id uuid;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then raise exception 'Platform super-administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or p_end_date <= p_start_date then raise exception 'Valid semester name and date range are required' using errcode = '22023'; end if;
  insert into public.semesters(name,start_date,end_date,is_active,lifecycle_status,configuration) values(trim(p_name),p_start_date,p_end_date,false,'draft',coalesce(p_configuration,'{}')) returning id into v_semester_id;
  insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(v_semester_id,private.current_profile_id(),'admin','active',now());
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details) values(v_semester_id,private.current_profile_id(),'semester.draft_created','semester',v_semester_id,jsonb_build_object('source_semester_id',p_source_semester_id));
  return query select v_semester_id, trim(p_name);
end;
$function$;

create or replace function public.replace_draft_meetings (
  p_semester_id uuid,
  p_meetings    jsonb
)
  returns integer
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_count integer;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then raise exception 'Platform super-administrator access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_meetings) is distinct from 'array' then raise exception 'Meetings must be a JSON array' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_meetings) proposed(date date,label text) where extract(isodow from proposed.date) <> 5) then raise exception 'Every meeting date must be a Friday' using errcode = '22023'; end if;
  delete from public.meetings where semester_id = p_semester_id;
  insert into public.meetings(semester_id,meeting_date,label) select p_semester_id,proposed.date,trim(proposed.label) from jsonb_to_recordset(p_meetings) proposed(date date,label text);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create policy "owners or super admins read platform roles" on "public"."platform_roles"
  for select
  to "authenticated"
  using
    (((profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) or private.is_super_admin(( select auth.uid() as uid)) or ((role =
    'super_admin'::public.platform_role) AND (exists ( select 1
   from public.semester_memberships member_visibility
  where ((member_visibility.profile_id = platform_roles.profile_id) AND private.can_manage_semester(member_visibility.semester_id, ( select auth.uid() as uid))))))));
