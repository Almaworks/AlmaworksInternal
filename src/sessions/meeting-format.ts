import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/types.ts";
import { normalizeAvailabilityFormat } from "../program/availability-windows.ts";

type SessionFormatInput = {
  semesterId: string;
  meetingId: string;
  mentorSemesterId: string;
  slot: 1 | 2;
  format: string | null | undefined;
};

interface FormatSource {
  mentor(input: SessionFormatInput): Promise<{ membershipId: string; preferredFormat: string | null } | null>;
  slotFormat(input: SessionFormatInput, membershipId: string): Promise<string | null>;
}

export class SessionFormatError extends Error {}

export async function validateSessionMeetingFormat(input: SessionFormatInput, source: FormatSource): Promise<"online" | "in_person"> {
  const raw = input.format?.trim().toLowerCase().replace(/[ _-]/gu, "");
  const format = raw && ["online", "remote", "virtual", "video"].includes(raw) ? "online"
    : raw && ["inperson", "onsite", "office"].includes(raw) ? "in_person" : null;
  if (format === null) throw new SessionFormatError("Choose Online or In Person for the meeting.");
  const mentor = await source.mentor(input);
  if (mentor === null) throw new SessionFormatError("The selected mentor is not available in this semester.");
  const slotFormat = await source.slotFormat(input, mentor.membershipId);
  const preference = normalizeAvailabilityFormat(slotFormat ?? mentor.preferredFormat);
  if (preference !== "hybrid" && preference !== (format === "online" ? "remote" : "in_person")) {
    throw new SessionFormatError("The selected mentor does not support this meeting format. Choose another mentor or format.");
  }
  return format;
}

export function sessionFormatSource(client: SupabaseClient<Database>): FormatSource {
  return {
    mentor: async (input) => {
      const { data, error } = await client.from("mentor_semesters")
        .select("semester_membership_id, preferred_format")
        .eq("id", input.mentorSemesterId).eq("semester_id", input.semesterId).maybeSingle();
      if (error) throw new Error("Unable to check mentor meeting format.");
      return data === null ? null : { membershipId: data.semester_membership_id, preferredFormat: data.preferred_format };
    },
    // The Friday slot table was retired; historical sessions use mentor preferences.
    slotFormat: async () => null,
  };
}
