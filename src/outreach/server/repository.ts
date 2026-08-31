import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import type { ActivityKind, OutreachChannel, OutreachStage } from "../types.ts";
import {
  type OutreachCursor,
  type OutreachWorkspaceItem,
} from "../workspace.ts";

type OutreachOpportunityRow = Pick<
  Database["public"]["Tables"]["outreach_opportunities"]["Row"],
  | "id"
  | "semester_id"
  | "contact_id"
  | "owner_profile_id"
  | "stage"
  | "next_follow_up_at"
  | "snoozed_until"
   | "is_silenced"
   | "silence_reason"
   | "cadence_days"
   | "latest_inbound_activity_at"
  | "latest_outbound_activity_at"
  | "updated_at"
  | "relationship_types"
>;

type OutreachContactRow = Pick<
  Database["public"]["Tables"]["outreach_contacts"]["Row"],
  "id" | "full_name" | "email"
  | "biography"
>;

type OutreachDirectoryContactRow = Pick<
  Database["public"]["Tables"]["outreach_contacts"]["Row"],
  "id" | "full_name" | "email" | "linkedin_url" | "biography" | "expertise_tags" | "updated_at"
>;

type OwnerProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "is_active"
>;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface LoadSemesterOutreachWorkspaceOptions {
  semesterId: string;
  cursor?: OutreachCursor;
  pageSize?: number;
}

export interface LoadAllTimeOutreachWorkspaceOptions {
  authorization: "all_time_workspace";
  semesterIds: readonly string[];
  cursor?: OutreachCursor;
  pageSize?: number;
}

export type LoadOutreachWorkspaceOptions =
  | LoadSemesterOutreachWorkspaceOptions
  | LoadAllTimeOutreachWorkspaceOptions;

export interface OutreachWorkspacePage {
  items: readonly OutreachWorkspaceItem[];
  nextCursor: OutreachCursor | null;
}

export interface LoadOutreachContactDetailOptions {
  semesterId: string;
  opportunityId: string;
}

export interface OutreachActivityDetail {
  id: string;
  activityKind: ActivityKind;
  channel: OutreachChannel | null;
  occurredAt: string;
  summary: string | null;
  actorProfileId: string | null;
  previousOwnerProfileId: string | null;
  newOwnerProfileId: string | null;
}

export interface OutreachContactDetail {
  item: OutreachWorkspaceItem;
  activities: readonly OutreachActivityDetail[];
  relationshipLabels: readonly {
    id: string;
    slug: string;
    name: string;
  }[];
}

export interface LoadAuthorizedAllTimeOutreachDirectoryOptions {
  authorization: "all_time_directory";
  pageSize?: number;
  maximumContacts?: number;
}

export interface OutreachDirectoryContact {
  id: string;
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  biography: string | null;
  expertiseTags: readonly string[];
  updatedAt: string;
}

function pageSizeFrom(pageSize: number | undefined): number {
  if (pageSize === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Outreach page size must be a positive integer");
  }
  return Math.min(pageSize, MAX_PAGE_SIZE);
}

function assertCursor(cursor: OutreachCursor): void {
  if (
    !UUID_PATTERN.test(cursor.id)
    || (cursor.nextFollowUpAt !== null && Number.isNaN(Date.parse(cursor.nextFollowUpAt)))
  ) {
    throw new Error("Invalid outreach cursor");
  }
}

function queryError(label: string, message: string): Error {
  return new Error(`Unable to load ${label}: ${message}`);
}

async function loadContactsById(
  client: SupabaseClient<Database>,
  contactIds: readonly string[],
): Promise<ReadonlyMap<string, OutreachContactRow>> {
  if (contactIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("outreach_contacts")
    .select("id, full_name, email, biography")
    .in("id", [...contactIds]);
  if (error !== null) {
    throw queryError("outreach contacts", error.message);
  }

  return new Map((data ?? []).map((contact) => [contact.id, contact]));
}

async function loadOwnersById(
  client: SupabaseClient<Database>,
  ownerIds: readonly string[],
): Promise<ReadonlyMap<string, OwnerProfileRow>> {
  if (ownerIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, is_active")
    .in("id", [...ownerIds]);
  if (error !== null) {
    throw queryError("outreach owners", error.message);
  }

  return new Map((data ?? []).map((owner) => [owner.id, owner]));
}

async function loadCompanyDataByContactId(
  client: SupabaseClient<Database>,
  contactIds: readonly string[],
): Promise<ReadonlyMap<string, { name: string; domain: string | null }>> {
  if (contactIds.length === 0) return new Map();
  const { data: relationships, error: relationshipError } = await client
    .from("outreach_contact_companies")
    .select("contact_id, company_id, is_primary")
    .in("contact_id", [...contactIds])
    .eq("is_primary", true);
  if (relationshipError !== null) throw queryError("outreach company relationships", relationshipError.message);
  const companyIds = [...new Set((relationships ?? []).map((relationship) => relationship.company_id))];
  if (companyIds.length === 0) return new Map();
  const { data: companies, error: companyError } = await client
    .from("outreach_companies")
    .select("id, name, domain")
    .in("id", companyIds);
  if (companyError !== null) throw queryError("outreach companies", companyError.message);
  const byId = new Map((companies ?? []).map((company) => [company.id, company]));
  return new Map((relationships ?? []).flatMap((relationship) => {
    const company = byId.get(relationship.company_id);
    return company === undefined ? [] : [[relationship.contact_id, { name: company.name, domain: company.domain }] as const];
  }));
}

function toWorkspaceItem(
  opportunity: OutreachOpportunityRow,
  contacts: ReadonlyMap<string, OutreachContactRow>,
  owners: ReadonlyMap<string, OwnerProfileRow>,
  companies: ReadonlyMap<string, { name: string; domain: string | null }>,
): OutreachWorkspaceItem {
  const contact = contacts.get(opportunity.contact_id);
  if (contact === undefined) {
    throw new Error("Outreach opportunity contact was not available to the current user");
  }

  const owner = opportunity.owner_profile_id === null
    ? undefined
    : owners.get(opportunity.owner_profile_id);

  return {
    id: opportunity.id,
    semesterId: opportunity.semester_id,
    contactId: contact.id,
    contactName: contact.full_name,
    contactEmail: contact.email,
    biography: contact.biography,
    stage: opportunity.stage as OutreachStage,
    ownerProfileId: opportunity.owner_profile_id,
    ownerName: owner?.full_name ?? null,
    ownerIsActive: owner?.is_active ?? false,
    nextFollowUpAt: opportunity.next_follow_up_at,
    snoozedUntil: opportunity.snoozed_until,
    isSilenced: opportunity.is_silenced,
    silenceReason: opportunity.silence_reason,
    cadenceDays: opportunity.cadence_days,
    latestInboundActivityAt: opportunity.latest_inbound_activity_at,
    latestOutboundActivityAt: opportunity.latest_outbound_activity_at,
    updatedAt: opportunity.updated_at,
    companyName: companies.get(contact.id)?.name ?? null,
    companyDomain: companies.get(contact.id)?.domain ?? null,
    labels: opportunity.relationship_types,
  };
}

async function workspaceItemsFromOpportunities(
  client: SupabaseClient<Database>,
  opportunities: readonly OutreachOpportunityRow[],
): Promise<OutreachWorkspaceItem[]> {
  const contactIds = [...new Set(opportunities.map((opportunity) => opportunity.contact_id))];
  const ownerIds = [...new Set(
    opportunities.flatMap((opportunity) => opportunity.owner_profile_id === null
      ? []
      : [opportunity.owner_profile_id]),
  )];
  const [contacts, owners, companies] = await Promise.all([
    loadContactsById(client, contactIds),
    loadOwnersById(client, ownerIds),
    loadCompanyDataByContactId(client, contactIds),
  ]);

  return opportunities.map((opportunity) => toWorkspaceItem(opportunity, contacts, owners, companies));
}

export async function loadOutreachWorkspace(
  client: SupabaseClient<Database>,
  options: LoadOutreachWorkspaceOptions,
): Promise<OutreachWorkspacePage> {
  const pageSize = pageSizeFrom(options.pageSize);
  if (options.cursor !== undefined) {
    assertCursor(options.cursor);
  }

  const allTime = "semesterIds" in options;
  if (allTime && options.authorization !== "all_time_workspace") {
    throw new Error("Explicit all-time workspace authorization is required");
  }
  if (allTime && options.semesterIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  let query = client
    .from("outreach_opportunities")
    .select(
      "id, semester_id, contact_id, owner_profile_id, stage, relationship_types, cadence_days, next_follow_up_at, snoozed_until, is_silenced, silence_reason, latest_inbound_activity_at, latest_outbound_activity_at, updated_at",
    )
    .order("next_follow_up_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(pageSize + 1);

  query = allTime
    ? query.in("semester_id", [...options.semesterIds])
    : query.eq("semester_id", options.semesterId);

  if (options.cursor !== undefined) {
    const { nextFollowUpAt, id } = options.cursor;
    query = nextFollowUpAt === null
      ? query.is("next_follow_up_at", null).gt("id", id)
      : query.or(
        `next_follow_up_at.gt.${nextFollowUpAt},and(next_follow_up_at.eq.${nextFollowUpAt},id.gt.${id}),next_follow_up_at.is.null`,
      );
  }

  const { data, error } = await query;
  if (error !== null) {
    throw queryError("outreach workspace", error.message);
  }

  const hasNextPage = (data?.length ?? 0) > pageSize;
  const opportunities = (data ?? []).slice(0, pageSize);
  const items = await workspaceItemsFromOpportunities(client, opportunities);
  const lastItem = items.at(-1);

  return {
    items,
    nextCursor: hasNextPage && lastItem !== undefined
      ? { nextFollowUpAt: lastItem.nextFollowUpAt, id: lastItem.id }
      : null,
  };
}

export async function loadOutreachContactDetail(
  client: SupabaseClient<Database>,
  options: LoadOutreachContactDetailOptions,
): Promise<OutreachContactDetail | null> {
  const { data: opportunity, error: opportunityError } = await client
    .from("outreach_opportunities")
    .select(
      "id, semester_id, contact_id, owner_profile_id, stage, relationship_types, cadence_days, next_follow_up_at, snoozed_until, is_silenced, silence_reason, latest_inbound_activity_at, latest_outbound_activity_at, updated_at",
    )
    .eq("semester_id", options.semesterId)
    .eq("id", options.opportunityId)
    .maybeSingle();
  if (opportunityError !== null) {
    throw queryError("outreach contact detail", opportunityError.message);
  }
  if (opportunity === null) {
    return null;
  }

  const [items, activitiesResult] = await Promise.all([
    workspaceItemsFromOpportunities(client, [opportunity]),
    client
      .from("outreach_activities")
      .select(
        "id, activity_kind, channel, occurred_at, summary, actor_profile_id, previous_owner_profile_id, new_owner_profile_id",
      )
      .eq("semester_id", options.semesterId)
      .eq("opportunity_id", options.opportunityId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAX_PAGE_SIZE),
  ]);
  if (activitiesResult.error !== null) {
    throw queryError("outreach activity history", activitiesResult.error.message);
  }
  return {
    item: items[0],
    activities: (activitiesResult.data ?? []).map((activity) => ({
      id: activity.id,
      activityKind: activity.activity_kind,
      channel: activity.channel,
      occurredAt: activity.occurred_at,
      summary: activity.summary,
      actorProfileId: activity.actor_profile_id,
      previousOwnerProfileId: activity.previous_owner_profile_id,
      newOwnerProfileId: activity.new_owner_profile_id,
    })),
    relationshipLabels: opportunity.relationship_types.map((relationshipType) => ({
      id: relationshipType,
      slug: relationshipType,
      name: relationshipType.replaceAll("_", " "),
    })),
  };
}

export async function loadAuthorizedAllTimeOutreachDirectory(
  client: SupabaseClient<Database>,
  options: LoadAuthorizedAllTimeOutreachDirectoryOptions,
): Promise<readonly OutreachDirectoryContact[]> {
  if (options.authorization !== "all_time_directory") {
    throw new Error("Explicit all-time directory authorization is required");
  }
  const pageSize = pageSizeFrom(options.pageSize);
  const maximumContacts = options.maximumContacts ?? 5_000;
  if (!Number.isInteger(maximumContacts) || maximumContacts < 1) {
    throw new Error("All-time outreach contact bound must be a positive integer");
  }
  const contacts: OutreachDirectoryContactRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from("outreach_contacts")
      .select("id, full_name, email, linkedin_url, biography, expertise_tags, updated_at")
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error !== null) {
      throw queryError("all-time outreach directory", error.message);
    }
    const page = data ?? [];
    if (contacts.length + page.length > maximumContacts) {
      throw new Error(`All-time outreach directory exceeds the ${maximumContacts}-contact safety bound`);
    }
    contacts.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }

  return contacts.map((contact) => ({
    id: contact.id,
    fullName: contact.full_name,
    email: contact.email,
    linkedinUrl: contact.linkedin_url,
    biography: contact.biography,
    expertiseTags: contact.expertise_tags,
    updatedAt: contact.updated_at,
  }));
}
