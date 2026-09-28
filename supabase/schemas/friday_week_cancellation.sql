alter table public.meetings
  add column if not exists friday_canceled_at timestamptz,
  add column if not exists friday_canceled_by_profile_id uuid,
  add constraint meetings_friday_canceled_by_requires_timestamp_check
    check (friday_canceled_at is not null or friday_canceled_by_profile_id is null),
  add constraint meetings_friday_canceled_by_profile_id_fkey
    foreign key (friday_canceled_by_profile_id) references public.profiles(id) on delete set null;

create policy "semester admins cancel Friday weeks"
on public.meetings for update to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())))
with check (private.can_manage_semester(semester_id, (select auth.uid())));

create function public.set_friday_week_canceled(
  p_semester_id uuid,
  p_meeting_id uuid,
  p_canceled boolean
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_canceled is null then
    raise exception 'Canceled state is required' using errcode = '22004';
  end if;
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_semester_id::text || ':' || p_meeting_id::text, 0)
  );

  update public.meetings meeting
  set friday_canceled_at = case when p_canceled then now() else null end,
      friday_canceled_by_profile_id = case when p_canceled then private.current_profile_id(auth.uid()) else null end
  where meeting.semester_id = p_semester_id
    and meeting.id = p_meeting_id;

  if not found then
    raise exception 'Meeting does not belong to the selected semester' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

create function public.guard_friday_week_cancellation_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.friday_canceled_at is not distinct from new.friday_canceled_at
     and old.friday_canceled_by_profile_id is not distinct from new.friday_canceled_by_profile_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.semester_id::text || ':' || new.id::text, 0)
  );

  if current_user = 'authenticated' then
    if auth.uid() is null or not private.can_manage_semester(new.semester_id, auth.uid()) then
      raise exception 'Semester administrator access required' using errcode = '42501';
    end if;
    if new.friday_canceled_at is null then
      if new.friday_canceled_by_profile_id is not null then
        raise exception 'Restored Friday weeks cannot retain a canceling administrator' using errcode = '23514';
      end if;
    elsif new.friday_canceled_by_profile_id is distinct from private.current_profile_id(auth.uid()) then
      raise exception 'Canceled Friday weeks must record the acting administrator' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_friday_week_cancellation_change
before update of friday_canceled_at, friday_canceled_by_profile_id on public.meetings
for each row execute function public.guard_friday_week_cancellation_change();

create function public.reject_canceled_friday_speaker_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meeting_id uuid := case when tg_op = 'DELETE' then old.meeting_id else new.meeting_id end;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      (case when tg_op = 'DELETE' then old.semester_id else new.semester_id end)::text || ':' || v_meeting_id::text,
      0
    )
  );
  if current_user = 'authenticated' and exists (
    select 1 from public.meetings meeting
    where meeting.id = v_meeting_id
      and meeting.friday_canceled_at is not null
  ) then
    raise exception 'Canceled Friday weeks cannot change speaker details' using errcode = 'P0003';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger reject_canceled_friday_speaker_change
before insert or update or delete on public.friday_speakers
for each row execute function public.reject_canceled_friday_speaker_change();

revoke all privileges on function public.set_friday_week_canceled(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all privileges on function public.guard_friday_week_cancellation_change() from public, anon, authenticated, service_role;
revoke all privileges on function public.reject_canceled_friday_speaker_change() from public, anon, authenticated, service_role;
grant execute on function public.set_friday_week_canceled(uuid, uuid, boolean) to authenticated;
grant update (friday_canceled_at, friday_canceled_by_profile_id) on table public.meetings to authenticated;
