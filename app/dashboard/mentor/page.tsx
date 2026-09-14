import { Suspense } from "react";

import ParticipantDashboard from "@/app/dashboard/participant/ParticipantDashboard";

function DashboardLoading() {
  return <main role="status" aria-live="polite">Loading your dashboard…</main>;
}

export default function MentorDashboardPage() {
  return <Suspense fallback={<DashboardLoading />}><ParticipantDashboard expectedRole="mentor" /></Suspense>;
}
