set local check_function_bodies = off;

create table "public"."mentor_booking_accepted_occupancy" (
  "request_id"         uuid                     not null,
  "semester_id"        uuid                     not null,
  "mentor_semester_id" uuid                     not null,
  "starts_at"          timestamp with time zone not null,
  "ends_at"            timestamp with time zone not null,
  constraint "mentor_booking_accepted_occupancy_interval_check" check ((ends_at > starts_at)),
  constraint "mentor_booking_accepted_occupancy_pkey" primary key (request_id)
);

alter table "public"."mentor_booking_accepted_occupancy"
  enable row level security;

create or replace function private.sync_accepted_booking_occupancy()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if new.status='accepted' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.mentor_booking_accepted_occupancy(request_id,semester_id,mentor_semester_id,starts_at,ends_at)
    values(new.id,new.semester_id,new.mentor_semester_id,new.starts_at,new.ends_at);
  elsif tg_op='UPDATE' and old.status='accepted' and new.status<>'accepted' then
    delete from public.mentor_booking_accepted_occupancy where request_id=new.id;
  end if;
  return null;
end;
$function$;

alter table "public"."mentor_booking_accepted_occupancy"
  add constraint "mentor_booking_accepted_occupancy_request_id_fkey" foreign key (request_id) references public.mentor_booking_requests(id) on delete restrict;

alter table "public"."mentor_booking_accepted_occupancy"
  add constraint "mentor_booking_accepted_occupancy_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete restrict;

alter table "public"."mentor_booking_accepted_occupancy"
  add constraint "mentor_booking_accepted_occupancy_semester_mentor_fkey" foreign key (semester_id, mentor_semester_id) references public.mentor_semesters(semester_id, id)
    on delete restrict;

alter table "public"."mentor_booking_accepted_occupancy"
  add constraint "mentor_booking_accepted_occupancy_semester_request_fkey" foreign key (semester_id, request_id) references public.mentor_booking_requests(semester_id, id)
    on delete restrict;

create index mentor_booking_accepted_occupancy_mentor_time_idx on public.mentor_booking_accepted_occupancy using btree (mentor_semester_id, starts_at, ends_at);

create index mentor_booking_accepted_occupancy_semester_time_idx on public.mentor_booking_accepted_occupancy using btree (semester_id, starts_at, ends_at);

create trigger sync_accepted_booking_occupancy
  after insert or update of status on public.mentor_booking_requests
  for each row
  execute function private.sync_accepted_booking_occupancy();

insert into public.mentor_booking_accepted_occupancy (
  request_id,
  semester_id,
  mentor_semester_id,
  starts_at,
  ends_at
)
select
  id,
  semester_id,
  mentor_semester_id,
  starts_at,
  ends_at
from public.mentor_booking_requests
where status = 'accepted'
on conflict (request_id) do nothing;

create policy "active participants and admins read accepted booking occupancy" on "public"."mentor_booking_accepted_occupancy"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, auth.uid()) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.semester_id = mentor_booking_accepted_occupancy.semester_id) AND (membership.profile_id = private.current_profile_id()) AND (membership.role = ANY
    (ARRAY['mentor'::public.user_role, 'startup'::public.user_role])) AND (membership.status = 'active'::public.membership_lifecycle_status))))));

create policy "booking parties release cancelled booking occupancy" on "public"."mentor_booking_accepted_occupancy"
  for delete
  to "authenticated"
  using ((exists ( select 1
   from public.mentor_booking_requests request
  where
    ((request.id = mentor_booking_accepted_occupancy.request_id) AND (request.semester_id = mentor_booking_accepted_occupancy.semester_id) AND (request.status = 'cancelled'::text)
    AND ((request.mentor_profile_id = private.current_profile_id()) or (exists ( select 1
           from (public.startup_team_memberships team
             JOIN public.semester_memberships membership on (((membership.id = team.semester_membership_id) AND (membership.semester_id = team.semester_id))))
          where
            ((team.semester_id = request.semester_id) AND (team.startup_semester_id = request.startup_semester_id) AND (membership.profile_id = private.current_profile_id()) AND
            (membership.role = 'startup'::public.user_role) AND (membership.status = 'active'::public.membership_lifecycle_status)))))))));

create policy "owning mentors create accepted booking occupancy" on "public"."mentor_booking_accepted_occupancy"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM public.mentor_booking_requests request
  WHERE
    ((request.id = mentor_booking_accepted_occupancy.request_id) AND (request.semester_id = mentor_booking_accepted_occupancy.semester_id) AND (request.mentor_semester_id =
    mentor_booking_accepted_occupancy.mentor_semester_id) AND (request.starts_at = mentor_booking_accepted_occupancy.starts_at) AND
    (request.ends_at = mentor_booking_accepted_occupancy.ends_at) AND (request.status = 'accepted'::text) AND (request.mentor_profile_id = private.current_profile_id())))));

revoke all on function "private"."sync_accepted_booking_occupancy"() from public;

grant execute on function "private"."sync_accepted_booking_occupancy"() to "postgres";

grant delete, insert, select on table "public"."mentor_booking_accepted_occupancy" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_booking_accepted_occupancy" to "postgres";
