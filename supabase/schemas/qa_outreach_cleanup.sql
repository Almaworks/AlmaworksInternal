-- Super Admin cleanup for disposable outreach contacts. The function runs as
-- its authenticated caller; every deletion is scoped by QA-only RLS policies.
grant select, delete on public.outreach_gmail_messages,
  public.outreach_opportunities, public.outreach_contacts,
  public.outreach_companies to authenticated;
grant update on public.outreach_companies to authenticated;

create policy "super admins purge QA Gmail snapshots"
  on public.outreach_gmail_messages for delete to authenticated
  using (private.is_super_admin(auth.uid())
    and profile_id = private.current_profile_id() and exists (
    select 1 from public.outreach_opportunities opportunity
    join public.outreach_contacts contact on contact.id = opportunity.contact_id
    where opportunity.id = opportunity_id and contact.full_name like 'QA %'
  ));
create policy "super admins purge QA opportunities"
  on public.outreach_opportunities for delete to authenticated
  using (private.is_super_admin(auth.uid())
    and created_by = private.current_profile_id()
    and owner_profile_id = private.current_profile_id() and exists (
    select 1 from public.outreach_contacts contact
    where contact.id = contact_id and contact.full_name like 'QA %'
  ));
create policy "super admins purge QA contacts"
  on public.outreach_contacts for delete to authenticated
  using (private.is_super_admin(auth.uid())
    and created_by = private.current_profile_id() and full_name like 'QA %');
create policy "super admins read owned QA contacts during cleanup"
  on public.outreach_contacts for select to authenticated
  using (private.is_super_admin(auth.uid())
    and created_by = private.current_profile_id() and full_name like 'QA %');
create policy "super admins inspect QA company links"
  on public.outreach_contact_companies for select to authenticated
  using (private.is_super_admin(auth.uid()));
create policy "super admins lock QA companies"
  on public.outreach_companies for update to authenticated
  using (private.is_super_admin(auth.uid())
    and created_by = private.current_profile_id() and name like 'QA %')
  with check (private.is_super_admin(auth.uid())
    and created_by = private.current_profile_id() and name like 'QA %');
create policy "super admins purge unshared QA companies"
  on public.outreach_companies for delete to authenticated
  using (private.is_super_admin(auth.uid())
    and created_by = private.current_profile_id() and name like 'QA %');
create policy "super admins read owned QA companies during cleanup"
  on public.outreach_companies for select to authenticated
  using (private.is_super_admin(auth.uid())
    and created_by = private.current_profile_id() and name like 'QA %');

-- Preserve append-only activity history except during the one transaction
-- that deletes its confirmed QA parent opportunity.
create or replace function public.prevent_outreach_activity_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.is_super_admin(auth.uid())
    and current_setting('app.qa_outreach_cleanup_opportunity', true) = old.opportunity_id::text then
    return old;
  end if;
  raise exception 'Outreach activities are append-only' using errcode = '55000';
end;
$$;

create or replace function public.purge_qa_outreach_contact(
  p_contact_id uuid,
  p_confirmation_email text,
  p_expected_message_count integer,
  p_expected_opportunity_count integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_contact public.outreach_contacts%rowtype;
  v_actor_profile_id uuid;
  v_company_id uuid;
  v_company_name text;
  v_opportunity_id uuid;
  v_deleted_one integer;
  v_actual_messages integer;
  v_actual_opportunities integer;
  v_deleted_messages integer;
  v_deleted_opportunities integer := 0;
  v_deleted_contacts integer;
  v_deleted_companies integer := 0;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;
  if p_expected_message_count is null or p_expected_message_count < 0
    or p_expected_opportunity_count is null or p_expected_opportunity_count < 1 then
    raise exception 'Expected QA outreach counts are required' using errcode = '22023';
  end if;
  select profile.id into v_actor_profile_id from public.profiles profile
  where profile.auth_user_id = auth.uid();
  select * into v_contact from public.outreach_contacts contact where contact.id = p_contact_id;
  if not found then raise exception 'Outreach contact not found' using errcode = 'P0002'; end if;
  if v_contact.email is distinct from lower(btrim(p_confirmation_email)) then
    raise exception 'QA contact email confirmation does not match' using errcode = '22023';
  end if;
  if v_contact.full_name not like 'QA %' then
    raise exception 'Only QA-labeled outreach contacts can be purged' using errcode = '42501';
  end if;
  if v_contact.created_by is distinct from v_actor_profile_id then
    raise exception 'QA outreach must belong to the requesting administrator' using errcode = '42501';
  end if;
  select count(*) into v_actual_opportunities from public.outreach_opportunities opportunity
  where opportunity.contact_id = p_contact_id;
  select count(*) into v_actual_messages from public.outreach_gmail_messages message
  join public.outreach_opportunities opportunity on opportunity.id = message.opportunity_id
  where opportunity.contact_id = p_contact_id;
  if v_actual_opportunities <> p_expected_opportunity_count
    or v_actual_messages <> p_expected_message_count then
    raise exception 'QA outreach preview changed' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.outreach_opportunities opportunity
      where opportunity.contact_id = p_contact_id
        and (opportunity.created_by is distinct from v_actor_profile_id
          or opportunity.owner_profile_id is distinct from v_actor_profile_id))
    or exists (select 1 from public.outreach_gmail_messages message
      join public.outreach_opportunities opportunity on opportunity.id = message.opportunity_id
      where opportunity.contact_id = p_contact_id
        and (message.profile_id is distinct from v_actor_profile_id
          or lower(message.recipient) is distinct from v_contact.email)) then
    raise exception 'QA outreach includes another owner or recipient' using errcode = '42501';
  end if;
  if exists (select 1 from public.outreach_email_messages message
      where message.contact_id = p_contact_id) then
    raise exception 'Sequenzy outreach history requires separate review' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.outreach_gmail_messages message
      join public.outreach_opportunities opportunity on opportunity.id = message.opportunity_id
      where opportunity.contact_id = p_contact_id and message.status in ('sending', 'unknown')) then
    raise exception 'Unsettled Gmail delivery requires review' using errcode = 'PT409';
  end if;

  -- An exclusively linked QA company may be removed too. Locking the parent
  -- prevents another contact link from appearing before the final delete.
  select company.id, company.name into v_company_id, v_company_name
  from public.outreach_contact_companies link
  join public.outreach_companies company on company.id = link.company_id
  where link.contact_id = p_contact_id and company.name like 'QA %'
    and company.created_by = v_actor_profile_id
  order by company.id limit 1;
  if v_company_id is not null then
    perform 1 from public.outreach_companies company where company.id = v_company_id for update;
  end if;

  delete from public.outreach_gmail_messages message
  using public.outreach_opportunities opportunity
  where message.opportunity_id = opportunity.id and opportunity.contact_id = p_contact_id;
  get diagnostics v_deleted_messages = row_count;
  if v_deleted_messages <> p_expected_message_count then
    raise exception 'QA outreach preview changed' using errcode = 'PT409';
  end if;
  for v_opportunity_id in select opportunity.id from public.outreach_opportunities opportunity
    where opportunity.contact_id = p_contact_id order by opportunity.id loop
    perform set_config('app.qa_outreach_cleanup_opportunity', v_opportunity_id::text, true);
    delete from public.outreach_opportunities opportunity where opportunity.id = v_opportunity_id;
    get diagnostics v_deleted_one = row_count;
    v_deleted_opportunities := v_deleted_opportunities + v_deleted_one;
    perform set_config('app.qa_outreach_cleanup_opportunity', '', true);
  end loop;
  if v_deleted_opportunities <> p_expected_opportunity_count then
    raise exception 'QA outreach preview changed' using errcode = 'PT409';
  end if;
  delete from public.outreach_contacts contact where contact.id = p_contact_id;
  get diagnostics v_deleted_contacts = row_count;
  if v_deleted_contacts <> 1 then
    raise exception 'QA outreach preview changed' using errcode = 'PT409';
  end if;
  if v_company_id is not null and not exists (
      select 1 from public.outreach_contact_companies link where link.company_id = v_company_id
    ) then
    delete from public.outreach_companies company
    where company.id = v_company_id and company.name = v_company_name;
    get diagnostics v_deleted_companies = row_count;
  end if;
  return jsonb_build_object('deletedMessages', v_deleted_messages,
    'deletedOpportunities', v_deleted_opportunities,
    'deletedContacts', v_deleted_contacts,
    'deletedCompanies', v_deleted_companies);
end;
$$;
revoke all on function public.purge_qa_outreach_contact(uuid,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.purge_qa_outreach_contact(uuid,text,integer,integer) to authenticated;
