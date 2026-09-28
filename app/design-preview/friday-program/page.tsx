import { notFound } from "next/navigation";

import { FridayProgramPanel, type FridayProgramResponse } from "@/components/friday-program/FridayProgramPanel";
import type { FridayProgram } from "@/src/friday-program/types";

const agenda: FridayProgramResponse["agenda"] = [
  { key: "standups", offsetMinutes: 0, durationMinutes: 15, label: "Startup standups" },
  { key: "speaker", offsetMinutes: 15, durationMinutes: 45, label: "Speaker session" },
  { key: "group_round_1", offsetMinutes: 60, durationMinutes: 30, label: "Small-group round 1", facilitators: { A: "Les", B: "Eric Chan" } },
  { key: "group_round_2", offsetMinutes: 90, durationMinutes: 30, label: "Small-group round 2", facilitators: { A: "Eric Chan", B: "Les" } },
];

const generatedProgram: FridayProgram = {
  programId: "preview-program",
  generatedAt: "2026-09-08T12:00:00.000Z",
  groups: {
    A: [
      { startupSemesterId: "startup-northstar", startupOrganizationId: "northstar", name: "Northstar Labs", slug: "northstar-labs", position: 1 },
      { startupSemesterId: "startup-kite", startupOrganizationId: "kite", name: "Kite Health", slug: "kite-health", position: 2 },
      { startupSemesterId: "startup-river", startupOrganizationId: "river", name: "River Systems", slug: "river-systems", position: 3 },
    ],
    B: [
      { startupSemesterId: "startup-orbit", startupOrganizationId: "orbit", name: "Orbit Works", slug: "orbit-works", position: 1 },
      { startupSemesterId: "startup-lumen", startupOrganizationId: "lumen", name: "Lumen AI", slug: "lumen-ai", position: 2 },
    ],
  },
};

const previewData: FridayProgramResponse = {
  semesterId: "preview-fall-2026",
  agenda: [...agenda],
  meetings: [
    { meetingId: "preview-week-1", meetingDate: "2026-09-11", label: "Friday, Sep 11", status: "published", program: generatedProgram },
    { meetingId: "preview-week-2", meetingDate: "2026-09-18", label: "Friday, Sep 18", status: "unpublished", program: null,
      speaker: { name: "Avery Chen", bio: "Avery helps early teams validate products with customers.", expertise: "Customer discovery", topic: "Learning from first users", contactEmail: "avery@example.test", contactPhone: "202-555-0142", linkedinUrl: null, websiteUrl: null } },
  ],
};

export default async function FridayProgramPreviewPage({ searchParams }: { searchParams: Promise<{ role?: string; week?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const canGenerate = query.role !== "mentor" && query.role !== "startup";
  const selectedWeekFirst = query.week === "unpublished";
  const meetings = selectedWeekFirst ? [...previewData.meetings].reverse() : previewData.meetings;
  const roleLabel = query.role === "mentor" ? "Mentor" : query.role === "startup" ? "Startup" : "Admin";
  return <main className="mx-auto max-w-5xl p-4 md:p-8">
    <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">Previewing the {roleLabel} view with fictional companies. Generating the unpublished week updates only this page.</p>
    <FridayProgramPanel semesterId={previewData.semesterId} startupSemesterId={query.role === "startup" ? "startup-orbit" : null} canGenerate={canGenerate} canEditSpeaker={canGenerate} previewData={{ ...previewData, meetings }} previewGeneratedProgram={generatedProgram} heading="Friday program groups" />
  </main>;
}
