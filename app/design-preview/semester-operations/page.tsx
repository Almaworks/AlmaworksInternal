import { notFound } from "next/navigation";

import SemesterOperations from "@/app/dashboard/admin/semesters/semester-operations";

export default function SemesterOperationsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className="p-4 md:p-8"><SemesterOperations /></div>;
}
