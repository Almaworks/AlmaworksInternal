set local check_function_bodies = off;

alter table "public"."sessions"
  add column "idempotency_key" text;

alter table "public"."sessions"
  add column "mentor_id" uuid;

alter table "public"."sessions"
  add column "startup_id" uuid;

alter table "public"."sessions"
  add column "session_date_id" uuid;

alter table "public"."sessions"
  add column "session_date" date;

alter table "public"."sessions"
  add column "time_slot" text;

alter table "public"."sessions"
  add column "is_confirmed" boolean;

create or replace function public.commit_mentor_assignment (
  p_semester_id         uuid,
  p_session_date_id     uuid,
  p_time_slot           text,
  p_startup_semester_id uuid,
  p_mentor_profile_id   uuid,
  p_idempotency_key     text,
  p_format              text   default 'online'::text,
  p_topic               text   default null::text,
  p_override_types      text[] default '{}'::text[],
  p_override_reason     text   default null::text,
  p_ranking_context     jsonb  default '{}'::jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_session_id uuid; v_mentor_semester_id uuid; v_slot integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required' using errcode = '22023'; end if;
  v_slot := case p_time_slot when '3:30-4:15' then 1 when '4:15-5:00' then 2 else null end;
  if v_slot is null then raise exception 'Unsupported assignment time slot' using errcode = '22023'; end if;
  select term.id into v_mentor_semester_id
  from public.mentor_semesters term join public.semester_memberships membership on membership.id = term.semester_membership_id
  where term.semester_id = p_semester_id and (term.id = p_mentor_profile_id or membership.profile_id = p_mentor_profile_id)
    and membership.status = 'active' limit 1;
  if v_mentor_semester_id is null then raise exception 'Mentor must be active in the target semester' using errcode = '22023'; end if;
  select id into v_session_id from public.sessions where semester_id = p_semester_id and idempotency_key = p_idempotency_key;
  if v_session_id is not null then return jsonb_build_object('sessionId', v_session_id, 'replayed', true); end if;
  insert into public.sessions(semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, format, topic, notes, idempotency_key)
  values(p_semester_id, p_session_date_id, v_mentor_semester_id, p_startup_semester_id, v_slot, 'confirmed', p_format, p_topic,
    case when cardinality(p_override_types) > 0 then concat('Assignment override: ', p_override_reason) end, p_idempotency_key)
  returning id into v_session_id;
  insert into public.program_audit_events(semester_id, actor_profile_id, action, subject_type, subject_id, details)
  values(p_semester_id, auth.uid(), 'session.assigned', 'session', v_session_id, jsonb_build_object('override_types', p_override_types, 'ranking_context', p_ranking_context));
  return jsonb_build_object('sessionId', v_session_id, 'replayed', false);
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
  if auth.uid() is null or not public.can_manage_semester(p_source_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or p_end_date <= p_start_date then raise exception 'Valid semester name and date range are required' using errcode = '22023'; end if;
  insert into public.semesters(name,start_date,end_date,is_active,lifecycle_status,configuration) values(trim(p_name),p_start_date,p_end_date,false,'draft',coalesce(p_configuration,'{}')) returning id into v_semester_id;
  insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(v_semester_id,auth.uid(),'admin','active',now());
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details) values(v_semester_id,auth.uid(),'semester.draft_created','semester',v_semester_id,jsonb_build_object('source_semester_id',p_source_semester_id));
  return query select v_semester_id, trim(p_name);
end;
$function$;

create or replace function public.mentors_view_write()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_membership_id uuid; v_profile_id uuid;
begin
  if tg_op = 'UPDATE' then
    select membership.profile_id into v_profile_id from public.mentor_semesters term join public.semester_memberships membership on membership.id=term.semester_membership_id where term.id=old.id;
    update public.profiles set full_name=new.full_name,email=coalesce(new.email,email),updated_at=now() where id=v_profile_id;
    update public.mentor_profiles set company=new.company,title=new.role_title,biography=new.bio,linkedin_url=new.linkedin_url,website_url=new.website_url,photo_url=new.photo_url,expertise_tags=coalesce(new.expertise_tags,'{}'),updated_at=now() where profile_id=v_profile_id;
    update public.mentor_semesters set mentorship_goals=new.mentorship_goals,general_availability=new.general_availability,preferred_format=new.preferred_format,per_week_availability=coalesce(new.per_week_availability,'{}'),opening_talk=new.opening_talk,updated_at=now() where id=old.id;
    update public.semester_memberships set status=case when new.is_active then 'active'::public.membership_lifecycle_status else 'suspended'::public.membership_lifecycle_status end,updated_at=now() where id=(select semester_membership_id from public.mentor_semesters where id=old.id);
    return new;
  elsif tg_op = 'INSERT' then
    v_profile_id := new.user_id;
    insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(new.semester_id,v_profile_id,'mentor',case when coalesce(new.is_active,true) then 'active' else 'suspended' end,case when coalesce(new.is_active,true) then now() end)
      on conflict(semester_id,profile_id) do update set role='mentor',status=excluded.status returning id into v_membership_id;
    insert into public.mentor_profiles(profile_id,company,title,biography,linkedin_url,website_url,photo_url,expertise_tags) values(v_profile_id,new.company,new.role_title,new.bio,new.linkedin_url,new.website_url,new.photo_url,coalesce(new.expertise_tags,'{}')) on conflict(profile_id) do update set company=excluded.company,title=excluded.title,biography=excluded.biography,linkedin_url=excluded.linkedin_url,expertise_tags=excluded.expertise_tags;
    insert into public.mentor_semesters(id,semester_id,semester_membership_id,mentorship_goals,general_availability,preferred_format,per_week_availability,opening_talk,readiness_status) values(coalesce(new.id,gen_random_uuid()),new.semester_id,v_membership_id,new.mentorship_goals,new.general_availability,new.preferred_format,coalesce(new.per_week_availability,'{}'),new.opening_talk,'ready') returning id into new.id;
    return new;
  end if;
  return old;
end;
$function$;

create or replace function public.replace_draft_session_dates (
  p_semester_id uuid,
  p_dates       jsonb
)
  returns integer
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_count integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_dates) is distinct from 'array' then raise exception 'Meeting dates must be a JSON array' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_dates) proposed(date date,label text) where extract(isodow from proposed.date) <> 5) then raise exception 'Every meeting date must be a Friday' using errcode = '22023'; end if;
  delete from public.meetings where semester_id = p_semester_id;
  insert into public.meetings(semester_id,meeting_date,label) select p_semester_id,proposed.date,trim(proposed.label) from jsonb_to_recordset(p_dates) proposed(date date,label text);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.semesters (
  public .mentors
)
  returns SETOF public.semesters
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.semesters where id=$1.semester_id $function$;

create or replace function public.semesters (
  public .session_dates
)
  returns SETOF public.semesters
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.semesters where id=$1.semester_id $function$;

create or replace function public.semesters (
  public .startups
)
  returns SETOF public.semesters
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.semesters where id=$1.semester_id $function$;

create or replace function public.startups_view_write()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_organization_id uuid; v_membership_id uuid;
begin
  if tg_op = 'UPDATE' then
    select startup_organization_id into v_organization_id from public.startup_semesters where id=old.id;
    update public.startup_organizations set name=new.name,description=new.description,industry=new.industry,logo_url=new.logo_url,website_url=new.website,slug=coalesce(new.slug,slug),durable_contact_data=jsonb_set(jsonb_set(durable_contact_data,'{founder_name}',to_jsonb(new.founder_name),true),'{founders}',coalesce(new.founders,'[]'),true),updated_at=now() where id=v_organization_id;
    update public.startup_semesters set stage=new.stage,preferred_expertise_tags=coalesce(new.preferred_tags,'{}'),goals=coalesce(new.semester_goals,'{}'),mentorship_needs=coalesce(new.mentorship_needs,'{}'),readiness_status=case when new.is_active then 'ready' else 'not_started' end,updated_at=now() where id=old.id;
    if new.user_id is not null and new.user_id is distinct from old.user_id then
      insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(new.semester_id,new.user_id,'startup','active',now()) on conflict(semester_id,profile_id) do update set role='startup',status='active' returning id into v_membership_id;
      insert into public.startup_team_memberships(semester_id,semester_membership_id,startup_semester_id,is_primary_contact) values(new.semester_id,v_membership_id,old.id,true) on conflict do nothing;
    end if;
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.startup_organizations(name,description,industry,logo_url,website_url,slug,durable_contact_data) values(new.name,new.description,new.industry,new.logo_url,new.website,new.slug,jsonb_build_object('founder_name',new.founder_name,'founders',coalesce(new.founders,'[]'))) returning id into v_organization_id;
    insert into public.startup_semesters(id,semester_id,startup_organization_id,stage,preferred_expertise_tags,goals,mentorship_needs,readiness_status) values(coalesce(new.id,gen_random_uuid()),new.semester_id,v_organization_id,coalesce(new.stage,'idea'),coalesce(new.preferred_tags,'{}'),coalesce(new.semester_goals,'{}'),coalesce(new.mentorship_needs,'{}'),case when coalesce(new.is_active,true) then 'ready' else 'not_started' end) returning id into new.id;
    return new;
  end if;
  return old;
end;
$function$;

create or replace function public.sync_session_compatibility_columns()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if tg_op = 'INSERT' then
    new.meeting_id := coalesce(new.meeting_id, new.session_date_id);
    new.mentor_semester_id := coalesce(new.mentor_semester_id, new.mentor_id);
    new.startup_semester_id := coalesce(new.startup_semester_id, new.startup_id);
    new.slot := coalesce(new.slot, case new.time_slot when '3:30-4:15' then 1 when '4:15-5:00' then 2 end);
    if new.status in ('pending', 'requested') then new.status := 'requested'; end if;
    if new.status = 'confirmed' or new.is_confirmed is true then new.status := 'confirmed'; end if;
  else
    if new.mentor_id is distinct from old.mentor_id then new.mentor_semester_id := new.mentor_id; end if;
    if new.startup_id is distinct from old.startup_id then new.startup_semester_id := new.startup_id; end if;
    if new.session_date_id is distinct from old.session_date_id then new.meeting_id := new.session_date_id; end if;
    if new.time_slot is distinct from old.time_slot then new.slot := case new.time_slot when '3:30-4:15' then 1 when '4:15-5:00' then 2 else new.slot end; end if;
    if new.is_confirmed is distinct from old.is_confirmed then new.status := case when new.is_confirmed then 'confirmed' else 'requested' end; end if;
  end if;
  select meeting.semester_id, meeting.meeting_date into new.semester_id, new.session_date from public.meetings meeting where meeting.id = new.meeting_id;
  new.mentor_id := new.mentor_semester_id;
  new.startup_id := new.startup_semester_id;
  new.session_date_id := new.meeting_id;
  new.time_slot := case new.slot when 1 then '3:30-4:15' when 2 then '4:15-5:00' end;
  new.is_confirmed := new.status = 'confirmed';
  return new;
end;
$function$;

create unique index sessions_semester_idempotency_key on public.sessions using btree (semester_id, idempotency_key)
  where (idempotency_key is not null);

create trigger mentors_view_write
  instead of insert or delete or update on public.mentors
  for each row
  execute function public.mentors_view_write();

create trigger sync_session_compatibility_columns
  before insert or update on public.sessions
  for each row
  execute function public.sync_session_compatibility_columns();

create trigger startups_view_write
  instead of insert or delete or update on public.startups
  for each row
  execute function public.startups_view_write();

grant execute on function "public"."mentors_view_write"() to public, "postgres";

grant execute on function "public"."semesters"(public.mentors) to public, "postgres";

grant execute on function "public"."semesters"(public.session_dates) to public, "postgres";

grant execute on function "public"."semesters"(public.startups) to public, "postgres";

grant execute on function "public"."startups_view_write"() to public, "postgres";

grant execute on function "public"."sync_session_compatibility_columns"() to public, "postgres";
