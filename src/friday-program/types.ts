export type FridayGroupCode = "A" | "B";

export interface FridayAgendaBaseItem {
  durationMinutes: number;
  label: string;
  offsetMinutes: number;
}

export interface FridayAgendaStandaloneItem extends FridayAgendaBaseItem {
  key: "speaker" | "standups";
}

export interface FridayAgendaGroupItem extends FridayAgendaBaseItem {
  key: "group_round_1" | "group_round_2";
  facilitators: Record<FridayGroupCode, string>;
}

export type FridayAgendaItem = FridayAgendaStandaloneItem | FridayAgendaGroupItem;

export interface FridayStartupAssignment {
  name: string;
  position: number;
  slug: string;
  startupOrganizationId: string;
  startupSemesterId: string;
}

export interface FridayProgram {
  generatedAt: string;
  groups: Record<FridayGroupCode, FridayStartupAssignment[]>;
  programId: string;
}

export interface FridaySpeaker {
  name: string;
  bio: string;
  expertise: string;
  topic: string;
  contactEmail: string;
  contactPhone: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
}

export interface FridayMeetingSummary {
  canceledAt?: string;
  canceledByProfileId?: string | null;
  label: string | null;
  meetingDate: string;
  meetingId: string;
  program: FridayProgram | null;
  speaker?: FridaySpeaker | null;
  status: "canceled" | "published" | "unpublished";
}

export interface FridayProgramResponse {
  agenda: FridayAgendaItem[];
  cancellationSetupPending?: boolean;
  meetings: FridayMeetingSummary[];
  semesterId: string;
  speakerSetupPending?: boolean;
}

export interface GenerateFridayProgramResponse {
  created: boolean;
  program: FridayProgram;
}
