set local check_function_bodies = off;

alter table "public"."outreach_contacts"
  add column "archived_at" timestamp with time zone;

alter table "public"."outreach_contacts"
  add column "archived_by" uuid;

alter table "public"."outreach_opportunities"
  add column "archived_at" timestamp with time zone;

alter table "public"."outreach_opportunities"
  add column "archived_by" uuid;

create or replace function private.stamp_outreach_archive_actor()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if new.archived_at is distinct from old.archived_at then
    new.archived_by := case
      when new.archived_at is null then null
      else private.current_profile_id()
    end;
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

alter table "public"."outreach_contacts"
  add constraint "outreach_contacts_archived_by_fkey" foreign key (archived_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_archived_by_fkey" foreign key (archived_by) references public.profiles(id) on delete set null;

create index outreach_opportunities_active_queue_cursor_idx on public.outreach_opportunities using btree (semester_id, next_follow_up_at, id)
  where (archived_at is null);

create trigger outreach_contacts_archive_actor
  before update of archived_at on public.outreach_contacts
  for each row
  execute function private.stamp_outreach_archive_actor();

create trigger outreach_opportunities_archive_actor
  before update of archived_at on public.outreach_opportunities
  for each row
  execute function private.stamp_outreach_archive_actor();

revoke all on function "private"."stamp_outreach_archive_actor"() from public;

grant execute on function "private"."stamp_outreach_archive_actor"() to "postgres";

revoke all ("archived_at") on table "public"."outreach_contacts" from "authenticated";

grant update ("archived_at") on table "public"."outreach_contacts" to "authenticated";

revoke all ("archived_at") on table "public"."outreach_opportunities" from "authenticated";

grant update ("archived_at") on table "public"."outreach_opportunities" to "authenticated";
