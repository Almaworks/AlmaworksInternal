-- Context attached to an independent mentor booking. Every row is semester scoped.
create table public.mentor_booking_meeting_details (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  request_id uuid not null,
  location text,
  video_url text,
  updated_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentor_booking_meeting_details_request_key unique (semester_id,request_id),
  constraint mentor_booking_meeting_details_request_fkey foreign key (semester_id,request_id)
    references public.mentor_booking_requests(semester_id,id) on delete restrict,
  constraint mentor_booking_meeting_details_location_check check (location is null or length(btrim(location)) between 1 and 500),
  constraint mentor_booking_meeting_details_video_url_check check (
    video_url is null or (length(video_url) between 8 and 2000 and video_url ~* '^https?://[^[:space:]/?#@]+([/?#]|$)')
  )
);

create table public.mentor_booking_decision_notes (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  request_id uuid not null,
  kind text not null check (kind in ('declined','cancelled')),
  note text not null check (length(btrim(note)) between 1 and 2000),
  alternative_text text check (alternative_text is null or length(btrim(alternative_text)) between 1 and 1000),
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint mentor_booking_decision_notes_request_key unique (semester_id,request_id),
  constraint mentor_booking_decision_notes_request_fkey foreign key (semester_id,request_id)
    references public.mentor_booking_requests(semester_id,id) on delete restrict
);

create table public.mentor_booking_outcomes (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  request_id uuid not null,
  reporter_profile_id uuid not null references public.profiles(id) on delete restrict,
  attendance text not null check (attendance in ('attended','missed')),
  feedback text check (feedback is null or length(btrim(feedback)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentor_booking_outcomes_reporter_key unique (semester_id,request_id,reporter_profile_id),
  constraint mentor_booking_outcomes_request_fkey foreign key (semester_id,request_id)
    references public.mentor_booking_requests(semester_id,id) on delete restrict
);

create index mentor_booking_outcomes_request_idx on public.mentor_booking_outcomes(semester_id,request_id);

alter table public.mentor_booking_meeting_details enable row level security;
alter table public.mentor_booking_decision_notes enable row level security;
alter table public.mentor_booking_outcomes enable row level security;

-- The booking RLS policy is the shared visibility boundary. A caller cannot
-- learn the context for a booking that its own role cannot select.
create policy "booking readers see meeting details" on public.mentor_booking_meeting_details
  for select to authenticated using (exists (
    select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_meeting_details.semester_id and b.id=mentor_booking_meeting_details.request_id));
create policy "booking parties and admins create meeting details" on public.mentor_booking_meeting_details
  for insert to authenticated with check (
    updated_by_profile_id=private.current_profile_id() and exists (
      select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_meeting_details.semester_id
        and b.id=mentor_booking_meeting_details.request_id and b.status='accepted'
        and (private.can_manage_semester(b.semester_id,auth.uid())
          or b.mentor_profile_id=private.current_profile_id()
          or exists (select 1 from public.startup_team_memberships t
            join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
            where t.semester_id=b.semester_id and t.startup_semester_id=b.startup_semester_id
              and m.profile_id=private.current_profile_id() and m.role='startup' and m.status='active'))));
create policy "booking parties and admins edit meeting details" on public.mentor_booking_meeting_details
  for update to authenticated using (exists (
    select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_meeting_details.semester_id
      and b.id=mentor_booking_meeting_details.request_id and b.status='accepted'
      and (private.can_manage_semester(b.semester_id,auth.uid()) or b.mentor_profile_id=private.current_profile_id()
        or exists (select 1 from public.startup_team_memberships t
          join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
          where t.semester_id=b.semester_id and t.startup_semester_id=b.startup_semester_id
            and m.profile_id=private.current_profile_id() and m.role='startup' and m.status='active'))))
  with check (updated_by_profile_id=private.current_profile_id());

create policy "booking readers see decision notes" on public.mentor_booking_decision_notes
  for select to authenticated using (exists (
    select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_decision_notes.semester_id and b.id=mentor_booking_decision_notes.request_id));
create policy "booking actors write decision notes" on public.mentor_booking_decision_notes
  for insert to authenticated with check (author_profile_id=private.current_profile_id() and exists (
    select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_decision_notes.semester_id
      and b.id=mentor_booking_decision_notes.request_id and b.status=mentor_booking_decision_notes.kind
      and (b.mentor_profile_id=private.current_profile_id()
        or (kind='cancelled' and exists (select 1 from public.startup_team_memberships t
          join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
          where t.semester_id=b.semester_id and t.startup_semester_id=b.startup_semester_id
            and m.profile_id=private.current_profile_id() and m.role='startup' and m.status='active')))));

create policy "booking readers see outcomes" on public.mentor_booking_outcomes
  for select to authenticated using (exists (
    select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_outcomes.semester_id and b.id=mentor_booking_outcomes.request_id));
create policy "own reports for accepted past bookings" on public.mentor_booking_outcomes
  for insert to authenticated with check (reporter_profile_id=private.current_profile_id() and exists (
    select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_outcomes.semester_id
      and b.id=mentor_booking_outcomes.request_id and b.status='accepted' and b.ends_at < now()
      and (private.can_manage_semester(b.semester_id,auth.uid()) or b.mentor_profile_id=private.current_profile_id()
        or exists (select 1 from public.startup_team_memberships t
          join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
          where t.semester_id=b.semester_id and t.startup_semester_id=b.startup_semester_id
            and m.profile_id=private.current_profile_id() and m.role='startup' and m.status='active'))));
create policy "reporters edit their own outcomes" on public.mentor_booking_outcomes
  for update to authenticated using (reporter_profile_id=private.current_profile_id() and exists (
    select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_outcomes.semester_id
      and b.id=mentor_booking_outcomes.request_id and b.status='accepted' and b.ends_at < now()))
  with check (reporter_profile_id=private.current_profile_id() and exists (
    select 1 from public.mentor_booking_requests b where b.semester_id=mentor_booking_outcomes.semester_id
      and b.id=mentor_booking_outcomes.request_id and b.status='accepted' and b.ends_at < now()));

revoke all on public.mentor_booking_meeting_details, public.mentor_booking_decision_notes, public.mentor_booking_outcomes from anon,authenticated;
grant select on public.mentor_booking_meeting_details, public.mentor_booking_decision_notes, public.mentor_booking_outcomes to authenticated;
grant insert (semester_id,request_id,location,video_url,updated_by_profile_id) on public.mentor_booking_meeting_details to authenticated;
grant update (location,video_url,updated_by_profile_id,updated_at) on public.mentor_booking_meeting_details to authenticated;
grant insert (semester_id,request_id,kind,note,alternative_text,author_profile_id) on public.mentor_booking_decision_notes to authenticated;
grant insert (semester_id,request_id,reporter_profile_id,attendance,feedback) on public.mentor_booking_outcomes to authenticated;
grant update (attendance,feedback,updated_at) on public.mentor_booking_outcomes to authenticated;

create function public.transition_mentor_booking_with_note(
  p_semester_id uuid,p_request_id uuid,p_transition text,p_note text,p_alternative_text text default null)
returns text language plpgsql security invoker set search_path='' as $$
declare result text; existing_note public.mentor_booking_decision_notes%rowtype;
begin
  if p_transition not in ('declined','cancelled') or length(btrim(coalesce(p_note,''))) not between 1 and 2000
    or (p_alternative_text is not null and length(btrim(p_alternative_text)) not between 1 and 1000)
  then raise exception 'Invalid decision note' using errcode='22023'; end if;
  if p_transition='declined' then
    result:=public.respond_to_mentor_booking_request(p_semester_id,p_request_id,'declined');
  else
    result:=public.cancel_mentor_booking_request(p_semester_id,p_request_id);
  end if;
  insert into public.mentor_booking_decision_notes(semester_id,request_id,kind,note,alternative_text,author_profile_id)
    values(p_semester_id,p_request_id,p_transition,btrim(p_note),nullif(btrim(p_alternative_text),''),private.current_profile_id())
    on conflict (semester_id,request_id) do nothing;
  select * into existing_note from public.mentor_booking_decision_notes
    where semester_id=p_semester_id and request_id=p_request_id;
  if existing_note.note is distinct from btrim(p_note) or existing_note.kind is distinct from p_transition
    or existing_note.alternative_text is distinct from nullif(btrim(p_alternative_text),'')
  then raise exception 'A different decision note already exists' using errcode='55000'; end if;
  return result;
end;
$$;
revoke all on function public.transition_mentor_booking_with_note(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.transition_mentor_booking_with_note(uuid,uuid,text,text,text) to authenticated;
