import { notFound } from "next/navigation";
import { Suspense } from "react";

import ParticipantDashboard from "@/app/dashboard/participant/ParticipantDashboard";
import {
  buildParticipantPreview,
  parseParticipantPreviewRole,
} from "@/src/dashboard/participant-preview";

function DashboardLoading() {
  return <main role="status" aria-live="polite">Loading dashboard preview…</main>;
}

export default async function ParticipantPreviewPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role: value } = await params;
  const role = parseParticipantPreviewRole(value);
  if (!role) notFound();

  return (
    <Suspense fallback={<DashboardLoading />}>
      <ParticipantDashboard
        expectedRole={role}
        previewView={buildParticipantPreview(role)}
      />
    </Suspense>
  );
}
