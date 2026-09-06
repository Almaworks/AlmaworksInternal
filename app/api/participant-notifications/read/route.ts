import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AuthorizationError,
  requireAuthenticatedUserWithRls,
} from "../../../../src/auth/server.ts";
import {
  ParticipantNotificationReadError,
  createParticipantNotificationReadService,
  type ParticipantNotificationReadReceipt,
  type ParticipantNotificationReadRepository,
} from "../../../../src/dashboard/participant-notification-read.ts";
import type { ParticipantMembershipInput } from "../../../../src/dashboard/participant-dashboard.ts";
import type { Database } from "../../../../src/db/types.ts";

type RlsClient = SupabaseClient<Database>;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function ensure(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function repository(client: RlsClient): ParticipantNotificationReadRepository {
  return {
    loadContext: async (profileId) => {
      const [semesterResult, membershipsResult] = await Promise.all([
        client.from("semesters").select("id,name").eq("is_active", true).maybeSingle(),
        client.from("semester_memberships")
          .select("id,semester_id,profile_id,role,status")
          .eq("profile_id", profileId),
      ]);
      ensure(semesterResult.error);
      ensure(membershipsResult.error);
      return {
        activeSemester: semesterResult.data
          ? { id: semesterResult.data.id, name: semesterResult.data.name }
          : null,
        memberships: (membershipsResult.data ?? []).map((row): ParticipantMembershipInput => ({
          id: row.id,
          semesterId: row.semester_id,
          profileId: row.profile_id,
          role: row.role,
          status: row.status,
        })),
      };
    },
    recordRead: async (receipt: ParticipantNotificationReadReceipt) => {
      const result = await client.from("participant_notification_reads").upsert({
        profile_id: receipt.profileId,
        semester_id: receipt.semesterId,
        notification_key: receipt.notificationKey,
      }, {
        ignoreDuplicates: true,
        onConflict: "profile_id,semester_id,notification_key",
      });
      ensure(result.error);
    },
  };
}

export async function POST(request: Request) {
  try {
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const body: unknown = await request.json();
    const service = createParticipantNotificationReadService(repository(userClient));
    return NextResponse.json({ data: await service.record(profileId, body) });
  } catch (cause) {
    if (cause instanceof AuthorizationError) return fail(cause.message, cause.status);
    if (cause instanceof ParticipantNotificationReadError) return fail(cause.message, cause.status);
    if (cause instanceof SyntaxError) return fail("Request body must be valid JSON.", 400);
    return fail(cause instanceof Error ? cause.message : "Notification read status could not be saved.", 500);
  }
}
