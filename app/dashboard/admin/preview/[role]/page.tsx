import { notFound } from "next/navigation";

import ParticipantDashboard from "@/app/dashboard/participant/ParticipantDashboard";
import {
  buildParticipantPreview,
  parseParticipantPreviewRole,
} from "@/src/dashboard/participant-preview";

export default async function ParticipantPreviewPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role: value } = await params;
  const role = parseParticipantPreviewRole(value);
  if (!role) notFound();

  return (
    <ParticipantDashboard
      expectedRole={role}
      previewView={buildParticipantPreview(role)}
    />
  );
}
