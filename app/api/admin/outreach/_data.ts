import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/db/types";
import {
  loadOutreachWorkspace,
  type OutreachActivityDetail,
} from "@/src/outreach/server/repository";
import { notFound, OutreachHttpError } from "@/src/outreach/server/http";
import {
  buildOutreachHealth,
  decodeOutreachCursor,
  encodeOutreachCursor,
  type OutreachCursor,
} from "@/src/outreach/workspace";

function databaseReadError(): never {
  throw new OutreachHttpError(
    404,
    "not_found",
    "The requested outreach record was not found.",
  );
}

export async function loadOpportunitySnapshot(
  client: SupabaseClient<Database>,
  semesterId: string,
  opportunityId: string,
) {
  const { data, error } = await client
    .from("outreach_opportunities")
    .select(
      "id, semester_id, owner_profile_id, stage, next_follow_up_at, snoozed_until, is_silenced, silence_reason, updated_at",
    )
    .eq("semester_id", semesterId)
    .eq("id", opportunityId)
    .maybeSingle();
  if (error !== null) databaseReadError();
  if (data === null) notFound("The requested outreach opportunity was not found.");
  return {
    id: data.id,
    semesterId: data.semester_id,
    ownerProfileId: data.owner_profile_id,
    stage: data.stage,
    nextFollowUpAt: data.next_follow_up_at,
    snoozedUntil: data.snoozed_until,
    isSilenced: data.is_silenced,
    silenceReason: data.silence_reason,
    updatedAt: data.updated_at,
  };
}

export async function loadLatestActivitySnapshot(
  client: SupabaseClient<Database>,
  semesterId: string,
  opportunityId: string,
  activityKinds: readonly Database["public"]["Enums"]["outreach_activity_kind"][],
) {
  const { data, error } = await client
    .from("outreach_activities")
    .select(
      "id, semester_id, opportunity_id, activity_kind, channel, occurred_at, summary, actor_profile_id, previous_owner_profile_id, new_owner_profile_id",
    )
    .eq("semester_id", semesterId)
    .eq("opportunity_id", opportunityId)
    .in("activity_kind", [...activityKinds])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error !== null || data === null) databaseReadError();
  return {
    id: data.id,
    semesterId: data.semester_id,
    opportunityId: data.opportunity_id,
    activityKind: data.activity_kind,
    channel: data.channel,
    occurredAt: data.occurred_at,
    summary: data.summary,
    actorProfileId: data.actor_profile_id,
    previousOwnerProfileId: data.previous_owner_profile_id,
    newOwnerProfileId: data.new_owner_profile_id,
  };
}

export async function loadWorkspaceResponse(
  client: SupabaseClient<Database>,
  options: {
    semesterId: string;
    cursor?: string;
    pageSize: number;
    nowTimestamp?: string;
  },
) {
  let cursor: OutreachCursor | undefined;
  if (options.cursor !== undefined) {
    try {
      cursor = decodeOutreachCursor(options.cursor);
    } catch {
      throw new OutreachHttpError(400, "validation_error", "cursor is invalid.", "cursor");
    }
  }
  const [page, semesterResult, membershipsResult] = await Promise.all([
    loadOutreachWorkspace(client, {
      semesterId: options.semesterId,
      cursor,
      pageSize: options.pageSize,
    }),
    client
      .from("semesters")
      .select("id, name, start_date, end_date, is_active")
      .eq("id", options.semesterId)
      .maybeSingle(),
    client
      .from("semester_memberships")
      .select("profile_id")
      .eq("semester_id", options.semesterId)
      .eq("role", "admin")
      .eq("status", "active"),
  ]);
  if (semesterResult.error !== null || semesterResult.data === null) {
    notFound("The requested semester was not found.");
  }
  if (membershipsResult.error !== null) databaseReadError();

  const profileIds = (membershipsResult.data ?? []).map((row) => row.profile_id);
  const profilesResult = profileIds.length === 0
    ? { data: [], error: null }
    : await client
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds)
      .order("full_name", { ascending: true });
  if (profilesResult.error !== null) databaseReadError();
  const semester = semesterResult.data;
  if (semester === null) notFound("The requested semester was not found.");

  return {
    health: buildOutreachHealth(page.items, options.nowTimestamp ?? new Date().toISOString()),
    rows: page.items.map((item) => ({
      ...item,
      semesterName: semester.name,
    })),
    nextCursor: page.nextCursor === null ? null : encodeOutreachCursor(page.nextCursor),
    owners: (profilesResult.data ?? []).map((profile) => ({
      profileId: profile.id,
      name: profile.full_name,
      email: profile.email,
    })),
    semester: {
      id: semester.id,
      name: semester.name,
      startsOn: semester.start_date,
      endsOn: semester.end_date,
      isActive: semester.is_active,
    },
  };
}

export async function loadAllTimeWorkspaceResponse(
  client: SupabaseClient<Database>,
  options: {
    cursor?: string;
    pageSize: number;
    nowTimestamp?: string;
    semesters: readonly {
      id: string;
      name: string;
      startsOn: string;
      endsOn: string;
      isActive: boolean;
    }[];
  },
) {
  let cursor: OutreachCursor | undefined;
  if (options.cursor !== undefined) {
    try {
      cursor = decodeOutreachCursor(options.cursor);
    } catch {
      throw new OutreachHttpError(400, "validation_error", "cursor is invalid.", "cursor");
    }
  }
  const page = await loadOutreachWorkspace(client, {
    authorization: "all_time_workspace",
    semesterIds: options.semesters.map((semester) => semester.id),
    cursor,
    pageSize: options.pageSize,
  });
  const semesterNames = new Map(options.semesters.map((semester) => [semester.id, semester.name]));

  return {
    health: buildOutreachHealth(page.items, options.nowTimestamp ?? new Date().toISOString()),
    rows: page.items.map((item) => ({
      ...item,
      semesterName: semesterNames.get(item.semesterId) ?? "Unknown cohort",
    })),
    nextCursor: page.nextCursor === null ? null : encodeOutreachCursor(page.nextCursor),
    owners: [],
    semester: { id: "all", name: "All time", isActive: false },
  };
}

export async function loadContactDetailResponse(
  client: SupabaseClient<Database>,
  options: {
    semesterId: string;
    contactId: string;
    activityCursor?: string;
    activityPageSize: number;
  },
) {
  const opportunityResult = await client
    .from("outreach_opportunities")
    .select("*")
    .eq("semester_id", options.semesterId)
    .eq("contact_id", options.contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (opportunityResult.error !== null) databaseReadError();
  if (opportunityResult.data === null) notFound("The requested outreach contact was not found.");

  let activityCursor: OutreachCursor | undefined;
  if (options.activityCursor !== undefined) {
    try {
      activityCursor = decodeOutreachCursor(options.activityCursor);
    } catch {
      throw new OutreachHttpError(
        400,
        "validation_error",
        "activityCursor is invalid.",
        "activityCursor",
      );
    }
    if (activityCursor.nextFollowUpAt === null) {
      throw new OutreachHttpError(
        400,
        "validation_error",
        "activityCursor is invalid.",
        "activityCursor",
      );
    }
  }

  let activitiesQuery = client
    .from("outreach_activities")
    .select(
      "id, activity_kind, channel, occurred_at, summary, actor_profile_id, previous_owner_profile_id, new_owner_profile_id",
    )
    .eq("semester_id", options.semesterId)
    .eq("opportunity_id", opportunityResult.data.id)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.activityPageSize + 1);
  if (activityCursor !== undefined && activityCursor.nextFollowUpAt !== null) {
    activitiesQuery = activitiesQuery.or(
      `occurred_at.lt.${activityCursor.nextFollowUpAt},and(occurred_at.eq.${activityCursor.nextFollowUpAt},id.lt.${activityCursor.id})`,
    );
  }

  const [contactResult, relationshipsResult, labelsResult, activitiesResult] = await Promise.all([
    client
      .from("outreach_contacts")
      .select("id, full_name, email, linkedin_url, phone, biography, expertise_tags, notes, updated_at")
      .eq("id", options.contactId)
      .maybeSingle(),
    client
      .from("outreach_contact_companies")
      .select("id, company_id, title, started_on, ended_on, is_primary")
      .eq("contact_id", options.contactId)
      .order("is_primary", { ascending: false }),
    client
      .from("outreach_opportunity_labels")
      .select("relationship_label_id")
      .eq("semester_id", options.semesterId)
      .eq("opportunity_id", opportunityResult.data.id),
    activitiesQuery,
  ]);
  if (
    contactResult.error !== null
    || contactResult.data === null
    || relationshipsResult.error !== null
    || labelsResult.error !== null
    || activitiesResult.error !== null
  ) databaseReadError();

  const companyIds = (relationshipsResult.data ?? []).map((row) => row.company_id);
  const labelIds = (labelsResult.data ?? []).map((row) => row.relationship_label_id);
  const [companiesResult, definitionsResult] = await Promise.all([
    companyIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : client
        .from("outreach_companies")
        .select("id, name, domain, website_url, description, sector")
        .in("id", companyIds),
    labelIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : client
        .from("outreach_relationship_labels")
        .select("id, slug, name, description, color_token")
        .in("id", labelIds)
        .order("name", { ascending: true }),
  ]);
  if (companiesResult.error !== null || definitionsResult.error !== null) databaseReadError();
  const companies = new Map((companiesResult.data ?? []).map((row) => [row.id, row]));

  const rawActivities = activitiesResult.data ?? [];
  const hasNextPage = rawActivities.length > options.activityPageSize;
  const activities = rawActivities.slice(0, options.activityPageSize).map((activity): OutreachActivityDetail => ({
    id: activity.id,
    activityKind: activity.activity_kind,
    channel: activity.channel,
    occurredAt: activity.occurred_at,
    summary: activity.summary,
    actorProfileId: activity.actor_profile_id,
    previousOwnerProfileId: activity.previous_owner_profile_id,
    newOwnerProfileId: activity.new_owner_profile_id,
  }));
  const lastActivity = activities.at(-1);

  return {
    contact: {
      id: contactResult.data.id,
      fullName: contactResult.data.full_name,
      email: contactResult.data.email,
      linkedinUrl: contactResult.data.linkedin_url,
      phone: contactResult.data.phone,
      biography: contactResult.data.biography,
      expertiseTags: contactResult.data.expertise_tags,
      notes: contactResult.data.notes,
      updatedAt: contactResult.data.updated_at,
    },
    companyRelationships: (relationshipsResult.data ?? []).map((relationship) => ({
      id: relationship.id,
      title: relationship.title,
      startedOn: relationship.started_on,
      endedOn: relationship.ended_on,
      isPrimary: relationship.is_primary,
      company: companies.get(relationship.company_id) ?? null,
    })),
    currentOpportunity: await loadOpportunitySnapshot(
      client,
      options.semesterId,
      opportunityResult.data.id,
    ),
    labels: definitionsResult.data ?? [],
    activities,
    nextActivityCursor: hasNextPage && lastActivity !== undefined
      ? encodeOutreachCursor({ nextFollowUpAt: lastActivity.occurredAt, id: lastActivity.id })
      : null,
  };
}
