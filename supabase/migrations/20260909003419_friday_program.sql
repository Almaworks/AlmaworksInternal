
  create table "public"."friday_program_assignments" (
    "id" uuid not null default gen_random_uuid(),
    "semester_id" uuid not null,
    "program_id" uuid not null,
    "startup_semester_id" uuid not null,
    "startup_organization_id" uuid not null,
    "startup_name" text not null,
    "startup_slug" text not null,
    "group_code" text not null,
    "group_position" smallint not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."friday_program_assignments" enable row level security;


  create table "public"."friday_programs" (
    "id" uuid not null default gen_random_uuid(),
    "semester_id" uuid not null,
    "meeting_id" uuid not null,
    "agenda_version" smallint not null default 1,
    "group_a_facilitator" text not null default 'Les'::text,
    "group_b_facilitator" text not null default 'Eric Chan'::text,
    "startup_count" integer not null,
    "generated_by_profile_id" uuid not null,
    "generated_at" timestamp with time zone not null default now()
      );


alter table "public"."friday_programs" enable row level security;

CREATE UNIQUE INDEX friday_program_assignments_pkey ON public.friday_program_assignments USING btree (id);

CREATE UNIQUE INDEX friday_program_assignments_program_group_position_key ON public.friday_program_assignments USING btree (program_id, group_code, group_position);

CREATE UNIQUE INDEX friday_program_assignments_program_startup_key ON public.friday_program_assignments USING btree (program_id, startup_semester_id);

CREATE INDEX friday_program_assignments_semester_idx ON public.friday_program_assignments USING btree (semester_id, program_id);

CREATE INDEX friday_program_assignments_startup_idx ON public.friday_program_assignments USING btree (startup_semester_id);

CREATE INDEX friday_programs_meeting_idx ON public.friday_programs USING btree (meeting_id);

CREATE UNIQUE INDEX friday_programs_pkey ON public.friday_programs USING btree (id);

CREATE UNIQUE INDEX friday_programs_semester_id_id_key ON public.friday_programs USING btree (semester_id, id);

CREATE UNIQUE INDEX friday_programs_semester_id_meeting_id_key ON public.friday_programs USING btree (semester_id, meeting_id);

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_pkey" PRIMARY KEY using index "friday_program_assignments_pkey";

alter table "public"."friday_programs" add constraint "friday_programs_pkey" PRIMARY KEY using index "friday_programs_pkey";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_group_code_check" CHECK ((group_code = ANY (ARRAY['A'::text, 'B'::text]))) not valid;

alter table "public"."friday_program_assignments" validate constraint "friday_program_assignments_group_code_check";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_group_position_check" CHECK ((group_position > 0)) not valid;

alter table "public"."friday_program_assignments" validate constraint "friday_program_assignments_group_position_check";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_program_group_position_key" UNIQUE using index "friday_program_assignments_program_group_position_key";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_program_startup_key" UNIQUE using index "friday_program_assignments_program_startup_key";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE not valid;

alter table "public"."friday_program_assignments" validate constraint "friday_program_assignments_semester_id_fkey";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_semester_id_program_id_fkey" FOREIGN KEY (semester_id, program_id) REFERENCES public.friday_programs(semester_id, id) ON DELETE CASCADE not valid;

alter table "public"."friday_program_assignments" validate constraint "friday_program_assignments_semester_id_program_id_fkey";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_semester_id_startup_semester_id_fkey" FOREIGN KEY (semester_id, startup_semester_id) REFERENCES public.startup_semesters(semester_id, id) ON DELETE RESTRICT not valid;

alter table "public"."friday_program_assignments" validate constraint "friday_program_assignments_semester_id_startup_semester_id_fkey";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_startup_name_check" CHECK ((length(btrim(startup_name)) > 0)) not valid;

alter table "public"."friday_program_assignments" validate constraint "friday_program_assignments_startup_name_check";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_startup_organization_id_fkey" FOREIGN KEY (startup_organization_id) REFERENCES public.startup_organizations(id) ON DELETE RESTRICT not valid;

alter table "public"."friday_program_assignments" validate constraint "friday_program_assignments_startup_organization_id_fkey";

alter table "public"."friday_program_assignments" add constraint "friday_program_assignments_startup_slug_check" CHECK ((length(btrim(startup_slug)) > 0)) not valid;

alter table "public"."friday_program_assignments" validate constraint "friday_program_assignments_startup_slug_check";

alter table "public"."friday_programs" add constraint "friday_programs_agenda_version_check" CHECK ((agenda_version = 1)) not valid;

alter table "public"."friday_programs" validate constraint "friday_programs_agenda_version_check";

alter table "public"."friday_programs" add constraint "friday_programs_generated_by_profile_id_fkey" FOREIGN KEY (generated_by_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."friday_programs" validate constraint "friday_programs_generated_by_profile_id_fkey";

alter table "public"."friday_programs" add constraint "friday_programs_group_a_facilitator_check" CHECK ((group_a_facilitator = 'Les'::text)) not valid;

alter table "public"."friday_programs" validate constraint "friday_programs_group_a_facilitator_check";

alter table "public"."friday_programs" add constraint "friday_programs_group_b_facilitator_check" CHECK ((group_b_facilitator = 'Eric Chan'::text)) not valid;

alter table "public"."friday_programs" validate constraint "friday_programs_group_b_facilitator_check";

alter table "public"."friday_programs" add constraint "friday_programs_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE not valid;

alter table "public"."friday_programs" validate constraint "friday_programs_semester_id_fkey";

alter table "public"."friday_programs" add constraint "friday_programs_semester_id_id_key" UNIQUE using index "friday_programs_semester_id_id_key";

alter table "public"."friday_programs" add constraint "friday_programs_semester_id_meeting_id_fkey" FOREIGN KEY (semester_id, meeting_id) REFERENCES public.meetings(semester_id, id) ON DELETE CASCADE not valid;

alter table "public"."friday_programs" validate constraint "friday_programs_semester_id_meeting_id_fkey";

alter table "public"."friday_programs" add constraint "friday_programs_semester_id_meeting_id_key" UNIQUE using index "friday_programs_semester_id_meeting_id_key";

alter table "public"."friday_programs" add constraint "friday_programs_startup_count_check" CHECK ((startup_count > 0)) not valid;

alter table "public"."friday_programs" validate constraint "friday_programs_startup_count_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.generate_friday_program(p_semester_id uuid, p_meeting_id uuid)
 RETURNS TABLE(program_id uuid, was_created boolean, assignment_count integer, generated_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_program public.friday_programs%rowtype;
  v_eligible_count integer;
begin
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_semester_id::text || ':' || p_meeting_id::text, 0)
  );

  perform 1
  from public.meetings meeting
  join public.semesters semester on semester.id = meeting.semester_id
  where meeting.id = p_meeting_id
    and meeting.semester_id = p_semester_id
    and semester.is_active;
  if not found then
    raise exception 'Meeting does not belong to the active semester' using errcode = 'P0002';
  end if;

  select program.*
  into v_program
  from public.friday_programs program
  where program.semester_id = p_semester_id
    and program.meeting_id = p_meeting_id;

  if found then
    return query
    select
      v_program.id,
      false,
      count(*)::integer,
      v_program.generated_at
    from public.friday_program_assignments assignment
    where assignment.program_id = v_program.id;
    return;
  end if;

  select count(*)
  into v_eligible_count
  from public.startup_semesters startup_term
  where startup_term.semester_id = p_semester_id
    and exists (
      select 1
      from public.startup_team_memberships team
      join public.semester_memberships membership
        on membership.id = team.semester_membership_id
       and membership.semester_id = team.semester_id
      where team.semester_id = startup_term.semester_id
        and team.startup_semester_id = startup_term.id
        and membership.role = 'startup'
        and membership.status = 'active'
    );

  if v_eligible_count = 0 then
    raise exception 'No active startup companies are eligible for this Friday meeting'
      using errcode = 'P0001';
  end if;

  insert into public.friday_programs (
    semester_id,
    meeting_id,
    startup_count,
    generated_by_profile_id
  )
  values (
    p_semester_id,
    p_meeting_id,
    v_eligible_count,
    private.current_profile_id()
  )
  returning * into v_program;

  with eligible as (
    select distinct
      startup_term.id as startup_semester_id,
      organization.id as startup_organization_id,
      organization.name as startup_name,
      organization.slug as startup_slug
    from public.startup_semesters startup_term
    join public.startup_organizations organization
      on organization.id = startup_term.startup_organization_id
    join public.startup_team_memberships team
      on team.semester_id = startup_term.semester_id
     and team.startup_semester_id = startup_term.id
    join public.semester_memberships membership
      on membership.id = team.semester_membership_id
     and membership.semester_id = team.semester_id
    where startup_term.semester_id = p_semester_id
      and membership.role = 'startup'
      and membership.status = 'active'
  ), randomized as (
    select
      eligible.*,
      row_number() over (order by random(), eligible.startup_semester_id) as randomized_position
    from eligible
  )
  insert into public.friday_program_assignments (
    semester_id,
    program_id,
    startup_semester_id,
    startup_organization_id,
    startup_name,
    startup_slug,
    group_code,
    group_position
  )
  select
    p_semester_id,
    v_program.id,
    randomized.startup_semester_id,
    randomized.startup_organization_id,
    randomized.startup_name,
    randomized.startup_slug,
    case when randomized.randomized_position % 2 = 1 then 'A' else 'B' end,
    ((randomized.randomized_position + 1) / 2)::smallint
  from randomized;

  return query
  select v_program.id, true, v_eligible_count, v_program.generated_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_friday_program_publication()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_program_id uuid;
  v_program public.friday_programs%rowtype;
  v_assignment_count integer;
  v_eligible_count integer;
  v_group_a_count integer;
  v_group_b_count integer;
begin
  if tg_table_name = 'friday_programs' then
    v_program_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_program_id := case when tg_op = 'DELETE' then old.program_id else new.program_id end;
  end if;

  select program.*
  into v_program
  from public.friday_programs program
  where program.id = v_program_id;

  if not found then
    return null;
  end if;

  select count(*)
  into v_eligible_count
  from public.startup_semesters startup_term
  where startup_term.semester_id = v_program.semester_id
    and exists (
      select 1
      from public.startup_team_memberships team
      join public.semester_memberships membership
        on membership.id = team.semester_membership_id
       and membership.semester_id = team.semester_id
      join public.semesters semester
        on semester.id = team.semester_id
      where team.semester_id = startup_term.semester_id
        and team.startup_semester_id = startup_term.id
        and membership.role = 'startup'
        and membership.status = 'active'
        and semester.is_active
    );

  select
    count(*),
    count(*) filter (where assignment.group_code = 'A'),
    count(*) filter (where assignment.group_code = 'B')
  into v_assignment_count, v_group_a_count, v_group_b_count
  from public.friday_program_assignments assignment
  where assignment.program_id = v_program_id;

  if v_assignment_count = 0
     or v_assignment_count <> v_program.startup_count
     or v_assignment_count <> v_eligible_count then
    raise exception 'Friday publication must contain every eligible startup company exactly once'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.friday_program_assignments assignment
    join public.startup_semesters startup_term
      on startup_term.id = assignment.startup_semester_id
     and startup_term.semester_id = assignment.semester_id
    join public.startup_organizations organization
      on organization.id = startup_term.startup_organization_id
    where assignment.program_id = v_program_id
      and (
        assignment.startup_organization_id <> organization.id
        or assignment.startup_name <> organization.name
        or assignment.startup_slug <> organization.slug
        or not exists (
          select 1
          from public.startup_team_memberships team
          join public.semester_memberships membership
            on membership.id = team.semester_membership_id
           and membership.semester_id = team.semester_id
          where team.semester_id = assignment.semester_id
            and team.startup_semester_id = assignment.startup_semester_id
            and membership.role = 'startup'
            and membership.status = 'active'
        )
      )
  ) then
    raise exception 'Friday publication contains an ineligible or inconsistent startup assignment'
      using errcode = '23514';
  end if;

  if abs(v_group_a_count - v_group_b_count) > 1 then
    raise exception 'Friday publication groups must be balanced'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from (
      select
        assignment.group_code,
        count(*) as item_count,
        count(distinct assignment.group_position) as distinct_positions,
        min(assignment.group_position) as first_position,
        max(assignment.group_position) as last_position
      from public.friday_program_assignments assignment
      where assignment.program_id = v_program_id
      group by assignment.group_code
    ) positions
    where positions.distinct_positions <> positions.item_count
       or positions.first_position <> 1
       or positions.last_position <> positions.item_count
  ) then
    raise exception 'Friday publication group positions must be contiguous'
      using errcode = '23514';
  end if;

  return null;
end;
$function$
;

grant insert on table "public"."friday_program_assignments" to "authenticated";

grant select on table "public"."friday_program_assignments" to "authenticated";

grant select on table "public"."friday_program_assignments" to "service_role";

grant insert on table "public"."friday_programs" to "authenticated";

grant select on table "public"."friday_programs" to "authenticated";

grant select on table "public"."friday_programs" to "service_role";


  create policy "semester admins insert Friday assignments"
  on "public"."friday_program_assignments"
  as permissive
  for insert
  to authenticated
with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));



  create policy "semester members read Friday assignments"
  on "public"."friday_program_assignments"
  as permissive
  for select
  to authenticated
using ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.semester_memberships viewer_membership
  WHERE ((viewer_membership.semester_id = friday_program_assignments.semester_id) AND (viewer_membership.profile_id = ( SELECT private.current_profile_id(( SELECT auth.uid() AS uid)) AS current_profile_id)) AND (viewer_membership.role = ANY (ARRAY['mentor'::public.user_role, 'startup'::public.user_role, 'admin'::public.user_role])) AND (viewer_membership.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'alumni'::public.membership_lifecycle_status])))))));



  create policy "semester admins insert Friday programs"
  on "public"."friday_programs"
  as permissive
  for insert
  to authenticated
with check ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) AND (generated_by_profile_id = ( SELECT private.current_profile_id(( SELECT auth.uid() AS uid)) AS current_profile_id))));



  create policy "semester members read Friday programs"
  on "public"."friday_programs"
  as permissive
  for select
  to authenticated
using ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.semester_memberships viewer_membership
  WHERE ((viewer_membership.semester_id = friday_programs.semester_id) AND (viewer_membership.profile_id = ( SELECT private.current_profile_id(( SELECT auth.uid() AS uid)) AS current_profile_id)) AND (viewer_membership.role = ANY (ARRAY['mentor'::public.user_role, 'startup'::public.user_role, 'admin'::public.user_role])) AND (viewer_membership.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'alumni'::public.membership_lifecycle_status])))))));



  create policy "Friday viewers read semester meetings"
  on "public"."meetings"
  as permissive
  for select
  to authenticated
using ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.semester_memberships viewer_membership
  WHERE ((viewer_membership.semester_id = meetings.semester_id) AND (viewer_membership.profile_id = ( SELECT private.current_profile_id(( SELECT auth.uid() AS uid)) AS current_profile_id)) AND (viewer_membership.role = ANY (ARRAY['mentor'::public.user_role, 'startup'::public.user_role, 'admin'::public.user_role])) AND (viewer_membership.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'alumni'::public.membership_lifecycle_status])))))));


CREATE CONSTRAINT TRIGGER validate_friday_program_after_assignment_change AFTER INSERT OR DELETE OR UPDATE ON public.friday_program_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_friday_program_publication();

CREATE CONSTRAINT TRIGGER validate_friday_program_after_program_change AFTER INSERT OR DELETE OR UPDATE ON public.friday_programs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_friday_program_publication();


