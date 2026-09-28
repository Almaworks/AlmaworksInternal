import type { MentorBookingRequest } from "./types.ts";

export interface StartupParticipationIdentity { startupSemesterId: string; name: string }
export type ParticipationStatus = "not_requested" | "awaiting_mentor" | "confirmed" | "meeting_passed" | "needs_rebooking";
export const participationLabels: Record<ParticipationStatus, string> = {
  not_requested: "No meeting requested", awaiting_mentor: "Awaiting mentor response", confirmed: "Meeting confirmed",
  meeting_passed: "Meeting time passed — check outcome", needs_rebooking: "Needs a new booking",
};

export function weeklyParticipation(
  startups: readonly StartupParticipationIdentity[],
  requests: readonly Pick<MentorBookingRequest, "startupSemesterId" | "status" | "startsAt" | "endsAt">[],
  week: { startDate: string; endDate: string }, timeZone: string, now = new Date(),
): Array<StartupParticipationIdentity & { status: ParticipationStatus }> {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const inWeek = requests.filter(request => {
    const parts = formatter.formatToParts(new Date(request.startsAt));
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    const day = `${part("year")}-${part("month")}-${part("day")}`;
    return day >= week.startDate && day <= week.endDate;
  });
  return startups.map(startup => {
    const own = inWeek.filter(request => request.startupSemesterId === startup.startupSemesterId);
    const status: ParticipationStatus = own.some(r => r.status === "accepted" && Date.parse(r.endsAt) > now.getTime()) ? "confirmed"
      : own.some(r => r.status === "accepted") ? "meeting_passed"
      : own.some(r => r.status === "pending" && Date.parse(r.endsAt) > now.getTime()) ? "awaiting_mentor"
      : own.length ? "needs_rebooking" : "not_requested";
    return { ...startup, status };
  });
}
