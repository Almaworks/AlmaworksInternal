import { notFound } from "next/navigation";

import { AdminProfilePhotoWorkspace } from "@/components/profile-photo/AdminProfilePhotoWorkspace";

export default function MemberProfilePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><p className="mx-auto mb-4 max-w-2xl rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">Fictional preview. Photo changes are disabled and do not call a real account.</p><AdminProfilePhotoWorkspace previewData={{ fullName: "Avery Morgan", email: "avery@example.test", photoUrl: null, eligible: true, reason: null }} /></main>;
}
