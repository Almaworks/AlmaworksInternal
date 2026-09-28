import { notFound } from "next/navigation";

import { OutreachEmailWorkspace } from "@/components/outreach-email/OutreachEmailWorkspace";
import type { OutreachEmailWorkspaceResponse } from "@/src/outreach-email/types";

const fixture: OutreachEmailWorkspaceResponse = {
  semesterId: "preview-fall-2026",
  configuration: { available: true, sender: "Almaworks <hello@almaworks.org>", timeZone: "America/New_York", unavailableReason: null },
  opportunity: { opportunityId: "preview-opportunity", recipientName: "Priya Shah", recipientEmail: "priya@example.test", companyName: "Northstar Ventures", semesterName: "Fall 2026" },
  supportedPlaceholders: ["contact_name", "company_name", "semester_name"],
  starterTemplates: [
    { templateId: "starter-mentor", name: "Mentor invitation", source: "starter", archivedAt: null, createdAt: null, updatedAt: null, subjectTemplate: "Almaworks mentor invitation", bodyTemplate: "Hi {{contact_name}},\n\nWe would love to invite you to mentor in {{semester_name}}." },
    { templateId: "starter-followup", name: "Follow-up", source: "starter", archivedAt: null, createdAt: null, updatedAt: null, subjectTemplate: "Following up with Almaworks", bodyTemplate: "Hi {{contact_name}},\n\nI wanted to follow up on our note about {{company_name}}." },
    { templateId: "starter-speaker", name: "Speaker invitation", source: "starter", archivedAt: null, createdAt: null, updatedAt: null, subjectTemplate: "Speak with Almaworks", bodyTemplate: "Hi {{contact_name}},\n\nWould you be open to speaking with our {{semester_name}} cohort?" },
  ],
  templates: [],
  messages: [{ messageId: "preview-message", opportunityId: "preview-opportunity", templateId: null, recipientName: "Priya Shah", recipientEmail: "priya@example.test", sender: "Almaworks <hello@almaworks.org>", subject: "Almaworks mentor invitation", body: "Hi Priya", status: "scheduled", createdAt: "2026-09-08T12:00:00.000Z", scheduledAt: "2026-09-12T16:00:00.000Z", sentAt: null, acceptedAt: "2026-09-08T12:00:00.000Z", deliveredAt: null, cancelledAt: null, providerCheckedAt: null, providerId: "preview-provider", providerStatus: "scheduled", lastError: null, activityId: null, idempotencyExpiresAt: "2026-09-09T12:00:00.000Z", canCancel: true, canRefresh: true, canRetry: false }],
};

export default async function OutreachEmailPreview({ searchParams }: { searchParams: Promise<{mode?:string}> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const mode = (await searchParams).mode ?? "contact";
  const preview = mode === "library" ? {...fixture,opportunity:null} : mode === "unavailable" ? {...fixture,configuration:{...fixture.configuration,available:false,sender:null,unavailableReason:"Email delivery has not been configured yet."}} : fixture;
  return <main className="min-h-screen bg-[#f5f8fc] p-4 md:p-8"><p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">Fictional preview. Email actions do not call a provider or send a message.</p><OutreachEmailWorkspace key={mode} semesterId={preview.semesterId} opportunityId={preview.opportunity?.opportunityId} previewData={preview} /></main>;
}
