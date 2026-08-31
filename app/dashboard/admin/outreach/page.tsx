import { Suspense } from "react";

import { OutreachWorkspace, WorkspaceSkeleton } from "./outreach-workspace";

export default function AdminOutreachPage() {
  return <Suspense fallback={<WorkspaceSkeleton />}><OutreachWorkspace /></Suspense>;
}
