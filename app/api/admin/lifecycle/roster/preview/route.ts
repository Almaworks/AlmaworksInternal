import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import { previewRoster, type RosterInputRow } from "@/src/lifecycle/roster";

interface PreviewRequestBody {
  semesterId: string;
  rows: RosterInputRow[];
}

function isRosterInputRow(value: unknown): value is RosterInputRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.email === "string" &&
    typeof row.fullName === "string" &&
    typeof row.role === "string" &&
    (row.startupName === undefined || typeof row.startupName === "string")
  );
}

function parseBody(value: unknown): PreviewRequestBody | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.semesterId !== "string" || !Array.isArray(body.rows)) return null;
  if (body.rows.length === 0 || body.rows.length > 250 || !body.rows.every(isRosterInputRow)) return null;
  return { semesterId: body.semesterId, rows: body.rows };
}

export async function POST(request: Request) {
  try {
    const body = parseBody(await request.json());
    if (!body) {
      return NextResponse.json(
        { error: "Provide a semesterId and between 1 and 250 valid roster rows." },
        { status: 400 },
      );
    }

    const { adminClient } = await requireSemesterAdmin(request, body.semesterId);
    const emails = [...new Set(body.rows.map((row) => row.email.trim().toLowerCase()).filter(Boolean))];
    const returningIdentities = new Map<string, { profileId: string; displayName: string }>();

    if (emails.length > 0) {
      const { data, error } = await adminClient
        .from("profiles")
        .select("id, email, full_name")
        .in("email", emails);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const profile of data ?? []) {
        returningIdentities.set(profile.email.toLowerCase(), {
          profileId: profile.id,
          displayName: profile.full_name ?? profile.email,
        });
      }
    }

    return NextResponse.json(previewRoster(body.rows, returningIdentities));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected roster preview error." },
      { status: 500 },
    );
  }
}
