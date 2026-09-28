import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminCapabilitySource } from "../auth/admin-capability.ts";
import { AuthorizationError, requireAuthenticatedUser } from "../auth/server.ts";
import type { Database } from "../db/types.ts";
import {
  buildCohortOptions,
  type CohortMember,
  type CohortSummary,
} from "../lifecycle/cohort-management.ts";
import { loadCohortMembers } from "../lifecycle/cohort-repository.ts";

export type AdminAccessScope = "all" | "semester";

export interface AdminAccessQuery {
  scope: AdminAccessScope;
  semesterId: string | null;
}

export interface PendingAccessUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  requested_role: "mentor" | "startup" | null;
}

interface PendingAccessProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  auth_user_id: string | null;
}

interface PendingRegistrationAuthAdmin {
  getUserById(userId: string): Promise<{
    data: { user: { user_metadata?: Record<string, unknown> } | null };
    error: { message: string } | null;
  }>;
}

export interface AdminAccessWorkspace {
  cohorts: {
    current: CohortSummary;
    previous: CohortSummary | null;
    all: CohortSummary[];
  };
  currentMembers: CohortMember[];
  members: CohortMember[];
  pendingUsers: PendingAccessUser[];
  scope: AdminAccessScope;
  semesterId: string | null;
}

export class AdminAccessHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminAccessHttpError";
    this.status = status;
  }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadPendingRegistrationPreferences(
  profiles: Array<Pick<PendingAccessProfileRow, "id" | "auth_user_id">>,
  authAdmin: PendingRegistrationAuthAdmin,
): Promise<Map<string, "mentor" | "startup" | null>> {
  const resolved: Array<"mentor" | "startup" | null> = new Array(profiles.length).fill(null);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < profiles.length) {
      const index = nextIndex;
      nextIndex += 1;
      const authUserId = profiles[index]?.auth_user_id;
      if (!authUserId) continue;
      try {
        const { data, error } = await authAdmin.getUserById(authUserId);
        if (error) continue;
        const candidate = data.user?.user_metadata?.requested_role;
        resolved[index] = candidate === "mentor" || candidate === "startup" ? candidate : null;
      } catch {
        resolved[index] = null;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(4, profiles.length) },
    async () => await worker(),
  ));
  return new Map(profiles.map((profile, index) => [profile.id, resolved[index] ?? null]));
}

export async function loadAdminAccessWorkspace(
  client: SupabaseClient<Database>,
  query: AdminAccessQuery,
  preferenceSource?: PendingRegistrationAuthAdmin,
): Promise<AdminAccessWorkspace> {
  const semestersPromise = client
    .from("semesters")
    .select("id,name,start_date,is_active")
    .order("start_date", { ascending: false });
  const pendingUsersPromise = client
    .from("profiles")
    .select("id,email,full_name,created_at,auth_user_id")
    .eq("status", "pending")
    .order("created_at");

  const [semestersResult, pendingUsersResult] = await Promise.all([
    semestersPromise,
    pendingUsersPromise,
  ]);
  throwIfError(semestersResult.error);
  throwIfError(pendingUsersResult.error);

  const semesters: CohortSummary[] = (semestersResult.data ?? []).map((semester) => ({
    id: semester.id,
    name: semester.name,
    startsOn: semester.start_date,
    isActive: semester.is_active,
  }));
  const activeSemester = semesters.find((semester) => semester.isActive) ?? null;
  if (!activeSemester) {
    throw new AdminAccessHttpError(409, "No active cohort is configured.");
  }

  const requestedSemester = query.semesterId === null
    ? activeSemester
    : semesters.find((semester) => semester.id === query.semesterId) ?? null;
  if (query.scope === "semester" && !requestedSemester) {
    throw new AdminAccessHttpError(400, "The selected cohort is not available.");
  }

  const selectedSemesters = query.scope === "all"
    ? semesters
    : [requestedSemester ?? activeSemester];
  const loadSemesters = [
    ...selectedSemesters,
    ...(selectedSemesters.some((semester) => semester.id === activeSemester.id) ? [] : [activeSemester]),
  ];
  const loadedMembers = await loadCohortMembers(client, loadSemesters);
  const selectedIds = new Set(selectedSemesters.map((semester) => semester.id));
  const options = buildCohortOptions(semesters);
  const pendingProfiles = (pendingUsersResult.data ?? []) as PendingAccessProfileRow[];
  const preferences = preferenceSource
    ? await loadPendingRegistrationPreferences(pendingProfiles, preferenceSource)
    : new Map<string, "mentor" | "startup" | null>();

  return {
    cohorts: {
      ...options,
      current: activeSemester,
    },
    currentMembers: loadedMembers.filter((member) => member.semesterId === activeSemester.id),
    members: loadedMembers.filter((member) => selectedIds.has(member.semesterId)),
    pendingUsers: pendingProfiles.map((profile) => ({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      created_at: profile.created_at,
      requested_role: preferences.get(profile.id) ?? null,
    })),
    scope: query.scope,
    semesterId: query.scope === "all" ? null : (requestedSemester ?? activeSemester).id,
  };
}

export interface AdminAccessStore {
  load(query: AdminAccessQuery): Promise<AdminAccessWorkspace>;
}

type AuthorizeAdminAccess = (request: Request) => Promise<AdminAccessStore>;

function singleQueryParameter(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new AdminAccessHttpError(400, `${name} may be provided once.`);
  return values[0]?.trim() || null;
}

function parseQuery(urlValue: string): AdminAccessQuery {
  const url = new URL(urlValue);
  const scope = singleQueryParameter(url, "scope") ?? "semester";
  if (scope !== "semester" && scope !== "all") {
    throw new AdminAccessHttpError(400, "scope must be semester or all.");
  }
  return {
    scope,
    semesterId: singleQueryParameter(url, "semesterId"),
  };
}

export async function authorizeAdminAccessRequest(request: Request): Promise<AdminAccessStore> {
  const { profileId, userClient, adminClient } = await requireAuthenticatedUser(request);
  const [superAdmin, profile] = await Promise.all([
    createSupabaseAdminCapabilitySource(userClient).isSuperAdmin(profileId),
    userClient
      .from("profiles")
      .select("status,is_active")
      .eq("id", profileId)
      .maybeSingle(),
  ]);
  if (superAdmin.error !== null) {
    throw new AuthorizationError("Unable to verify platform access.", 500);
  }
  if (profile.error) {
    throw new AuthorizationError("Unable to verify active account access.", 500);
  }
  if (!superAdmin.data || profile.data?.status !== "approved" || profile.data.is_active !== true) {
    throw new AuthorizationError("Active approved Super Admin access required.", 403);
  }
  return {
    load: async (query) => await loadAdminAccessWorkspace(userClient, query, adminClient.auth.admin),
  };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function createAdminAccessHandlers(authorize: AuthorizeAdminAccess = authorizeAdminAccessRequest) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        const query = parseQuery(request.url);
        const store = await authorize(request);
        return json(await store.load(query));
      } catch (cause) {
        if (cause instanceof AuthorizationError || cause instanceof AdminAccessHttpError) {
          return json({ error: cause.message }, cause.status);
        }
        return json({ error: "The access workspace could not be loaded. Please try again." }, 500);
      }
    },
  };
}
