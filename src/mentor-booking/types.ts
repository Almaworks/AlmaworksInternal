export type MentorBookingViewerRole = "admin" | "mentor" | "startup";
export type MentorBookingRequestStatus = "accepted" | "cancelled" | "declined" | "pending";
export type MentorBookingWindowStatus = "accepted" | "available" | "pending";

export interface MentorBookingViewer {
  mentorSemesterId: string | null;
  profileId: string;
  role: MentorBookingViewerRole;
  startupSemesterId: string | null;
  startupNeeds?: string[];
}

export interface MentorBookingMentorIdentity {
  expertiseTags?: string[];
  name: string;
  profileId: string;
}

export interface MentorBookingStartupIdentity {
  name: string;
  organizationId: string;
}

export interface MentorWeeklyAvailability {
  endsAt: string;
  mentor: MentorBookingMentorIdentity;
  mentorSemesterId: string;
  startsAt: string;
  weekday: number;
}

export interface MentorBookingAcceptedOccupancy {
  endsAt: string;
  mentorSemesterId: string;
  startsAt: string;
}

export interface MentorBookingRequest {
  canAccept: boolean;
  canCancel: boolean;
  canDecline: boolean;
  cancelledAt: string | null;
  endsAt: string;
  mentor: MentorBookingMentorIdentity;
  mentorSemesterId: string;
  requestId: string;
  requestedAt: string;
  respondedAt: string | null;
  startsAt: string;
  startup: MentorBookingStartupIdentity;
  startupSemesterId: string;
  status: MentorBookingRequestStatus;
  topic: string;
  windowId: string | null;
}

export interface MentorBookingWindow {
  canRequest: boolean;
  canWithdraw: boolean;
  endsAt: string;
  mentor: MentorBookingMentorIdentity;
  mentorSemesterId: string;
  request: MentorBookingRequest | null;
  semesterId: string;
  startsAt: string;
  status: MentorBookingWindowStatus;
  windowId: string;
}

export interface MentorBookingWorkspaceResponse {
  acceptedOccupancy: MentorBookingAcceptedOccupancy[];
  availability?: MentorWeeklyAvailability[];
  history: MentorBookingRequest[];
  semesterEndDate: string;
  semesterId: string;
  semesterStartDate: string;
  timeZone: string;
  viewer: MentorBookingViewer;
  windows: MentorBookingWindow[];
}

export type MentorBookingCommand =
  | { action: "publish_window"; endsAt: string; semesterId: string; startsAt: string }
  | { action: "withdraw_window"; semesterId: string; windowId: string }
  | { action: "request_window"; semesterId: string; topic: string; windowId: string }
  | { action: "replace_weekly_availability"; availability: { endsAt: string; startsAt: string; weekday: number }[]; semesterId: string }
  | { action: "request_booking"; endsAt: string; mentorSemesterId: string; semesterId: string; startsAt: string; topic: string }
  | { action: "accept_request" | "cancel_request" | "decline_request"; requestId: string; semesterId: string };

export interface MentorBookingMutationResponse {
  workspace: MentorBookingWorkspaceResponse;
}
