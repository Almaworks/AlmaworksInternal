"use client";

import { filterOutreachWorkspaceForView } from "@/src/outreach/workspace";
import type { WorkspaceRow } from "./types";
import { QueueView } from "./queue-view";

export function PeopleView({ rows, onOpen }: { rows: readonly WorkspaceRow[]; onOpen: (row: WorkspaceRow) => void }) {
  const visible = filterOutreachWorkspaceForView(rows, "people", null, new Date().toISOString());
  return <QueueView rows={visible} onOpen={onOpen} emptyTitle="No outreach contacts match this search" emptyCopy="Try a different name, company, label, or owner." />;
}
