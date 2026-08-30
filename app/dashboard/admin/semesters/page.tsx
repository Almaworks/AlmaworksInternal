import CohortDirectory from "./cohort-directory";
import SemesterOperations from "./semester-operations";

export default async function SemesterOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return view === "cohorts" ? <CohortDirectory /> : <SemesterOperations />;
}
