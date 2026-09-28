export const OUTREACH_EMAIL_API_VERSION = "2026-09-08" as const;

export type OutreachEmailPlaceholder = "company_name" | "contact_name" | "job_title" | "mentor_onboarding_url" | "semester_name";
export type OutreachEmailStarterPurpose =
  | "mentor_invitation"
  | "speaker_invitation"
  | "investor_introduction"
  | "partner_sponsor_invitation"
  | "demo_day_judge_invitation";

export const outreachEmailStarterPurposeLabels: Readonly<Record<OutreachEmailStarterPurpose, string>> = {
  mentor_invitation: "Mentor invitation",
  speaker_invitation: "Speaker invitation",
  investor_introduction: "Investor introduction",
  partner_sponsor_invitation: "Partner / sponsor invitation",
  demo_day_judge_invitation: "Demo Day outreach",
};
export type OutreachEmailMessageStatus =
  | "accepted"
  | "bounced"
  | "cancel_unknown"
  | "cancelled"
  | "complained"
  | "delivered"
  | "failed"
  | "prepared"
  | "scheduled"
  | "sent"
  | "suppressed"
  | "submission_unknown";

export interface OutreachEmailConfiguration {
  available: boolean;
  mentorOnboardingUrl?: string | null;
  sender: string | null;
  timeZone: string;
  unavailableReason: string | null;
}

export interface OutreachEmailOpportunity {
  companyName: string | null;
  jobTitle?: string | null;
  opportunityId: string;
  recipientEmail: string;
  recipientName: string;
  semesterName: string;
}

export interface OutreachEmailTemplate {
  archivedAt: string | null;
  bodyTemplate: string;
  createdAt: string | null;
  name: string;
  purpose?: OutreachEmailStarterPurpose;
  source: "saved" | "starter";
  subjectTemplate: string;
  templateId: string;
  updatedAt: string | null;
}

export interface OutreachEmailMessage {
  acceptedAt: string | null;
  activityId: string | null;
  body: string;
  canCancel: boolean;
  canRefresh: boolean;
  canRetry: boolean;
  cancelledAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  idempotencyExpiresAt: string;
  lastError: string | null;
  messageId: string;
  opportunityId: string;
  providerCheckedAt: string | null;
  providerId: string | null;
  providerStatus: string | null;
  recipientEmail: string;
  recipientName: string;
  scheduledAt: string | null;
  sender: string;
  sentAt: string | null;
  status: OutreachEmailMessageStatus;
  subject: string;
  templateId: string | null;
}

export interface OutreachEmailWorkspaceResponse {
  configuration: OutreachEmailConfiguration;
  messages: OutreachEmailMessage[];
  opportunity: OutreachEmailOpportunity | null;
  semesterId: string;
  starterTemplates: OutreachEmailTemplate[];
  supportedPlaceholders: OutreachEmailPlaceholder[];
  templates: OutreachEmailTemplate[];
}

export type OutreachEmailCommand =
  | {
      action: "save_template";
      bodyTemplate: string;
      expectedUpdatedAt?: string;
      name: string;
      semesterId: string;
      subjectTemplate: string;
      templateId?: string;
    }
  | { action: "archive_template"; expectedUpdatedAt: string; semesterId: string; templateId: string }
  | {
      action: "submit_message";
      body: string;
      idempotencyKey: string;
      opportunityId: string;
      scheduledAt: string | null;
      semesterId: string;
      subject: string;
      templateId: string | null;
    }
  | {
      action: "cancel_message" | "refresh_message" | "retry_message";
      messageId: string;
      semesterId: string;
    };

export interface OutreachEmailMutationResponse {
  messageId: string | null;
  workspace: OutreachEmailWorkspaceResponse;
}

export interface OutreachEmailApiError {
  code: string;
  field?: string;
  message: string;
}

export type OutreachEmailApiResponse<T> =
  | { apiVersion: typeof OUTREACH_EMAIL_API_VERSION; data: T }
  | { apiVersion: typeof OUTREACH_EMAIL_API_VERSION; error: OutreachEmailApiError };
