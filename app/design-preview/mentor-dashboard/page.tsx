import { notFound } from "next/navigation";

import ParticipantDashboardPreview from "@/app/design-preview/participant-dashboard/ParticipantDashboardPreview";

export default function MentorDashboardPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ParticipantDashboardPreview role="mentor" />;
}
