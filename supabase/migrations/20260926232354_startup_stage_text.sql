set local check_function_bodies = off;

alter table "public"."startup_semesters"
  alter column "stage" drop default;

alter table "public"."startup_semesters"
  alter column "stage" type text using "stage"::text;

create or replace function public.update_startup_records (
  p_startup_semester_id      uuid,
  p_name                     text,
  p_slug                     text,
  p_industry                 text,
  p_description              text,
  p_stage                    text,
  p_preferred_expertise_tags text[],
  p_mentorship_needs         text[]
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_semester_id uuid;
  v_organization_id uuid;
begin
  select semester_id, startup_organization_id
  into v_semester_id, v_organization_id
  from public.startup_semesters
  where id = p_startup_semester_id;
  if v_semester_id is null then
    raise exception 'Startup semester not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not private.can_manage_semester(v_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  update public.startup_organizations
  set name = p_name, slug = p_slug, industry = p_industry,
      description = p_description, updated_at = now()
  where id = v_organization_id;
  update public.startup_semesters
  set stage = nullif(lower(regexp_replace(btrim(p_stage), ' +', ' ', 'g')), ''),
      mentorship_needs = coalesce(p_mentorship_needs, '{}'),
      updated_at = now()
  where id = p_startup_semester_id;
  return p_startup_semester_id;
end;
$function$;

alter table "public"."startup_semesters"
  add constraint "startup_semesters_stage_tag_check"
    check (((stage IS NULL) OR (((char_length(stage) >= 1) AND (char_length(stage) <= 40)) AND (stage = btrim(stage)) AND (stage !~ '[,;\n\r\t]'::text))));
