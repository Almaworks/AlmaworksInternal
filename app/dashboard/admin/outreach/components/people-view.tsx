"use client";

import { useMemo } from "react";

import { CohortScreenControls, useCohortScreen } from "@/components/CohortScreenControls";
import type { CohortRecordReference } from "@/src/lifecycle/cohort-screen";
import type { WorkspaceRow } from "./types";
import { QueueView } from "./queue-view";

export function PeopleView({ rows, onOpen }: { rows: readonly WorkspaceRow[]; onOpen: (row: WorkspaceRow) => void }) {
  const references = useMemo<CohortRecordReference[]>(() => rows.map((row) => ({ recordId: row.id, email: row.contactEmail, semesterId: row.semesterId })), [rows]);
  const cohort = useCohortScreen(references, "all");
  const visibleIds = useMemo(() => new Set(cohort.scopedRecords.map((record) => record.recordId)), [cohort.scopedRecords]);
  const visible = useMemo(() => rows.filter((row) => visibleIds.has(row.id)), [rows, visibleIds]);
  return <><CohortScreenControls controller={cohort} visibleRecords={visible.map((row) => ({ recordId: row.id, email: row.contactEmail, semesterId: row.semesterId }))} /><QueueView rows={visible} onOpen={onOpen} emptyTitle="No cohort people match this search" emptyCopy="Try a different cohort, name, company, label, or owner." /></>;
}
