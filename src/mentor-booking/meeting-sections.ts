import type { MentorBookingRequest } from "./types.ts";

export interface MentorBookingSections {
  history: MentorBookingRequest[];
  pending: MentorBookingRequest[];
  upcoming: MentorBookingRequest[];
}

/** Splits booking records by their request lifecycle and meeting time. */
export function bookingSections(requests: readonly MentorBookingRequest[], now: Date = new Date()): MentorBookingSections {
  const nowTime = now.getTime();
  return requests.reduce<MentorBookingSections>((sections, request) => {
    const endsAt = Date.parse(request.endsAt);
    if (request.status === "pending" && endsAt > nowTime) sections.pending.push(request);
    if (request.status === "accepted" && endsAt > nowTime) sections.upcoming.push(request);
    if (request.status === "declined" || request.status === "cancelled" || endsAt <= nowTime) sections.history.push(request);
    return sections;
  }, { pending: [], upcoming: [], history: [] });
}
