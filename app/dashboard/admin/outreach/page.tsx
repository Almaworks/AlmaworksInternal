import { Suspense } from "react";

import { OutreachWorkspace } from "./outreach-workspace";

export default function AdminOutreachPage() {
  return <Suspense fallback={<div className="min-h-[40vh]" aria-label="Loading outreach" />}><OutreachWorkspace /></Suspense>;
}
