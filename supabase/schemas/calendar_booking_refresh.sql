-- Composed after google_calendar.sql. Display snapshots remain useful for
-- fifteen minutes; committing a new request/acceptance requires a newer check.
grant create on schema public,private to calendar_sql_internal;

create function public.calendar_booking_refresh_required(p_semester_id uuid,p_mentor_semester_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if not private.calendar_can_read_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Current cohort access required' using errcode='42501'; end if;
  return exists(select 1 from public.mentor_calendar_settings settings
    where settings.semester_id=p_semester_id and settings.mentor_semester_id=p_mentor_semester_id
      and settings.mode='synced' and (settings.sync_unavailable or settings.last_success_at is null
        or settings.last_success_at>now() or settings.last_success_at<now()-interval '30 seconds'));
end $$;
alter function public.calendar_booking_refresh_required(uuid,uuid) owner to calendar_sql_internal;
revoke all on function public.calendar_booking_refresh_required(uuid,uuid) from public,anon,service_role;
grant execute on function public.calendar_booking_refresh_required(uuid,uuid) to authenticated;

create function private.guard_calendar_booking_freshness()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' or (new.status='accepted' and old.status='pending') then
    if public.calendar_booking_refresh_required(new.semester_id,new.mentor_semester_id) then
      raise exception 'Refresh Calendar before requesting or accepting this time' using errcode='55000';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_calendar_booking_freshness() from public,anon,authenticated,service_role;
create trigger z_calendar_booking_freshness before insert or update of status on public.mentor_booking_requests
  for each row execute function private.guard_calendar_booking_freshness();

-- A registered worker may lease exactly the mentor requested by an authorized
-- app call. It cannot steal an active sync/hold/disconnect credential lease.
create function public.calendar_lease_booking_sync(p_semester_id uuid,p_mentor_semester_id uuid)
returns table(job_id uuid,lease_token uuid,profile_id uuid,connection_id uuid,
  credential_generation bigint,calendar_id text,refresh_token_ciphertext text,
  access_token_ciphertext text,access_expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  return query with due as (
    select j.id from private.google_calendar_sync_jobs j
    join public.google_calendar_connections c on c.id=j.connection_id
    join private.google_calendar_credentials cred on cred.connection_id=c.id
    where j.semester_id=p_semester_id and j.mentor_semester_id=p_mentor_semester_id
      and (j.leased_until is null or j.leased_until<now())
      and (cred.disconnect_leased_until is null or cred.disconnect_leased_until<now())
      and private.calendar_can_run_sync(j.semester_id,j.mentor_semester_id,j.connection_id)
      and not exists(select 1 from private.google_calendar_sync_jobs other
        where other.connection_id=j.connection_id and other.id<>j.id and other.leased_until>now())
      and not exists(select 1 from private.google_calendar_hold_jobs hold
        where hold.connection_id=j.connection_id and hold.leased_until>now())
    limit 1 for update of j,c skip locked
  ), leased as (
    update private.google_calendar_sync_jobs j set lease_token=gen_random_uuid(),
      leased_until=now()+interval '2 minutes',attempts=1,updated_at=now()
      from due where j.id=due.id returning j.id,j.connection_id,j.lease_token
  ) select l.id,l.lease_token,c.profile_id,l.connection_id,cred.generation,c.calendar_id,
    cred.refresh_token_ciphertext,cred.access_token_ciphertext,cred.access_expires_at
    from leased l join public.google_calendar_connections c on c.id=l.connection_id
    join private.google_calendar_credentials cred on cred.connection_id=l.connection_id;
end $$;
alter function public.calendar_lease_booking_sync(uuid,uuid) owner to calendar_sql_internal;
revoke all on function public.calendar_lease_booking_sync(uuid,uuid) from public,anon,service_role;
grant execute on function public.calendar_lease_booking_sync(uuid,uuid) to authenticated;
revoke create on schema public,private from calendar_sql_internal;
