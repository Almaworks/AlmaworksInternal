"use client";

import { useState } from "react";

import { outreachFetch } from "./authenticated-fetch";
import type { WorkspaceOwner, WorkspaceRow } from "./types";
import styles from "../outreach-workspace.module.css";

export function OwnerPicker({ row, owners, semesterId, onCommitted }: { row: WorkspaceRow; owners: readonly WorkspaceOwner[]; semesterId: string; onCommitted: () => void }) {
  const [ownerId, setOwnerId] = useState(row.ownerProfileId ?? "");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const available = row.updatedAt !== undefined;

  async function save() {
    if (!available || saving) return;
    setSaving(true); setStatus(null);
    try {
      const response = await outreachFetch(`/api/admin/outreach/opportunities/${row.id}/owner`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterId, updatedAt: row.updatedAt, newOwnerProfileId: ownerId || null, reason: reason || undefined }) });
      if (!response.ok) throw new Error("Owner could not be updated. Refresh and try again.");
      setStatus("Owner updated."); onCommitted();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Owner could not be updated."); }
    finally { setSaving(false); }
  }

  return <div className={styles.ownerPicker}>
    <label>Owner<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={!available || saving}><option value="">Unassigned</option>{owners.map((owner) => <option value={owner.profileId} key={owner.profileId}>{owner.name}</option>)}</select></label>
    <label>Transfer note (optional)<input value={reason} onChange={(event) => setReason(event.target.value)} disabled={!available || saving} /></label>
    <button onClick={() => void save()} disabled={!available || saving || ownerId === (row.ownerProfileId ?? "")}>{saving ? "Saving…" : "Save"}</button>
    {!available && <p className={styles.unavailable}>Owner changes need the API edit version, which is not currently available.</p>}
    {status && <p className={styles.formStatus} role="status">{status}</p>}
  </div>;
}
