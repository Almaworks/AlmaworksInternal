set local check_function_bodies = off;

create or replace function private.validate_outreach_email_template()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
declare
  v_profile_id uuid := private.current_profile_id();
begin
  if auth.uid() is null or not private.can_manage_semester(new.semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if regexp_replace(new.subject_template, '\{\{\s*(company_name|contact_name|semester_name|job_title|mentor_onboarding_url)\s*\}\}', '', 'g') ~ '\{\{|\}\}'
    or regexp_replace(new.body_template, '\{\{\s*(company_name|contact_name|semester_name|job_title|mentor_onboarding_url)\s*\}\}', '', 'g') ~ '\{\{|\}\}' then
    raise exception 'Email template contains an unknown or malformed placeholder' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := v_profile_id;
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id
      or new.semester_id is distinct from old.semester_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or old.archived_at is not null
      or (new.archived_at is null and old.archived_at is not null) then
      raise exception 'Protected outreach email template columns cannot be changed' using errcode = '42501';
    end if;
    new.updated_at := statement_timestamp();
  end if;
  return new;
end;
$function$;
