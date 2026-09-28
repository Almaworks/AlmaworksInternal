import { ExportWorkspace } from "@/components/semester-export/ExportWorkspace";

export default function ExportPreview() {
  return <div style={{ background: "#f4f7fa", minHeight: "100vh", padding: "24px", colorScheme: "light" }}>
    <p style={{ maxWidth: 960, margin: "0 auto 16px", color: "#416990" }}>Fictional preview · no participant data or downloads</p>
    <ExportWorkspace preview={{
      semesters: [{ id: "demo-semester", name: "Fall 2026", is_active: true }],
      manifest: {
        semester: { id: "demo-semester", name: "Fall 2026" }, scope: "semester", exportedAt: "2026-09-09T03:00:00Z",
        datasets: [{ id: "startups", file: "tables/startups.csv", rowCount: 12 }, { id: "mentor_booking_requests", file: "tables/mentor_booking_requests.csv", rowCount: 24 }, { id: "outreach_opportunities", file: "tables/outreach_opportunities.csv", rowCount: 108 }, { id: "outreach_activities", file: "tables/outreach_activities.csv", rowCount: 226 }],
        exclusions: ["Photo references are included; image files are not bundled.", "Source IDs preserve relationships for reference. Notion relations must be configured after import."],
      },
    }} />
  </div>;
}
