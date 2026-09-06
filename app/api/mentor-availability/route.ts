import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";

type WindowInput = { meetingId: string; slot: 1 | 2; isAvailable: boolean; format: "in_person" | "remote" | "hybrid" };

function fail(error: string, status: number) { return NextResponse.json({ error }, { status }); }

function parseWindow(value: unknown): WindowInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return typeof item.meetingId === "string"
    && (item.slot === 1 || item.slot === 2)
    && typeof item.isAvailable === "boolean"
    && (item.format === "in_person" || item.format === "remote" || item.format === "hybrid")
    ? { meetingId: item.meetingId, slot: item.slot, isAvailable: item.isAvailable, format: item.format }
    : null;
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return fail("An availability payload is required.", 422);
    const input = body as Record<string, unknown>;
    const windows = Array.isArray(input.windows) ? input.windows.map(parseWindow) : [];
    if (typeof input.semesterId !== "string" || windows.length === 0 || windows.some((window) => window === null)) return fail("Availability windows are invalid.", 422);
    const auth = await requireAuthenticatedUserWithRls(request);
    const saveAvailability = auth.userClient.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    const result = await saveAvailability("save_mentor_meeting_availability", {
      p_semester_id: input.semesterId,
      p_windows: windows.map((window) => ({ meeting_id: window?.meetingId, slot: window?.slot, is_available: window?.isAvailable, format: window?.format })),
    });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ data: { saved: true } });
  } catch (cause) {
    if (cause instanceof AuthorizationError) return fail(cause.message, cause.status);
    return fail(cause instanceof Error ? cause.message : "Availability could not be saved.", 500);
  }
}
