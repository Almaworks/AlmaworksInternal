"use client";

import { CircleAlert, RotateCcw, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { parseOutreachCsv } from "@/src/outreach/import";
import { outreachFetch } from "./authenticated-fetch";
import { ImportSummary } from "./import-summary";
import { MatchResolution, type ImportDecision } from "./match-resolution";
import styles from "../outreach-workspace.module.css";

type Row = { id: string; rowNumber: number; name: string; issue: string; decision: ImportDecision; matchedContactId: string | null };
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
const previewRows: Row[] = [
  { id: "1", rowNumber: 1, name: "Maya Chen", issue: "Exact email match", decision: "merge", matchedContactId: "preview-contact" },
  { id: "2", rowNumber: 2, name: "Jordan Ellis", issue: "No existing contact found", decision: "create", matchedContactId: null },
  { id: "3", rowNumber: 3, name: "Unnamed contact", issue: "identity_missing", decision: "exclude", matchedContactId: null },
];

export function ImportReview({ preview = false, semesterId }: { preview?: boolean; semesterId: string }) {
  const [rows, setRows] = useState<Row[]>(preview ? previewRows : []);
  const [importId, setImportId] = useState<string | null>(preview ? "preview-import" : null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);
  const summary = useMemo(() => ({
    create: rows.filter((row) => row.decision === "create").length,
    merge: rows.filter((row) => row.decision === "merge").length,
    exclude: rows.filter((row) => row.decision === "exclude").length,
    issues: rows.filter((row) => row.issue.length > 0).length,
  }), [rows]);

  function reset() { setRows([]); setImportId(null); setMessage(null); setCommitted(false); }

  async function upload(file: File) {
    setBusy(true); setMessage(null);
    try {
      if (!semesterId) throw new Error("Select a semester before importing contacts.");
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file.");
      const parsed = parseOutreachCsv(await file.text());
      const response = await outreachFetch("/api/admin/outreach/imports/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterId, source: "csv", sourceFilename: file.name, rows: parsed }) });
      const result = await response.json() as ApiEnvelope<{ importId: string; rows: Row[] }>;
      if (!response.ok || !result.data?.importId || !result.data.rows) throw new Error(result.error?.message ?? "The import preview could not be created.");
      setImportId(result.data.importId); setRows(result.data.rows);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The import preview could not be created."); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!importId || preview) return;
    setBusy(true); setMessage(null);
    try {
      const decisions = rows.map((row) => ({ rowNumber: row.rowNumber, decision: row.decision, ...(row.decision === "merge" && row.matchedContactId ? { matchedContactId: row.matchedContactId } : {}) }));
      const response = await outreachFetch(`/api/admin/outreach/imports/${importId}/commit`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": importId }, body: JSON.stringify({ semesterId, importId, decisions }) });
      const result = await response.json() as ApiEnvelope<{ status: string }>;
      if (!response.ok || result.data?.status !== "committed") throw new Error(result.error?.message ?? "The reviewed rows could not be committed.");
      setCommitted(true);
      const importedCount = rows.length - summary.exclude;
      setMessage(`Imported ${importedCount} reviewed row${importedCount === 1 ? "" : "s"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The reviewed rows could not be committed."); }
    finally { setBusy(false); }
  }

  if (rows.length === 0) return <section className={styles.importReview}>
    <div className={styles.importLead}><div><h2>Import contacts safely</h2><p>Upload a CSV to stage contacts inside Outreach. You will review every create, merge, and exclusion before anything is committed.</p></div><label className={styles.primaryButton}><Upload size={16} aria-hidden="true" /> {busy ? "Preparing preview…" : "Choose CSV"}<input hidden type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label></div>
    <div className={styles.controlRow}><a className={styles.secondaryButton} href="/templates/outreach-import-template.csv" download>Download sample CSV</a></div>
    {message && <p className={styles.unavailable} role="alert">{message}</p>}
  </section>;

  return <section className={styles.importReview}>
    <div className={styles.importLead}><div><h2>{committed ? "Import complete" : "Review every row before committing"}</h2><p>{committed ? "Your reviewed contacts are now part of this semester’s outreach workspace." : "Resolve suggested matches and exclude invalid rows. Your decisions are saved with the staged import when you commit."}</p></div>{!preview && <button className={styles.secondaryButton} type="button" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Start over</button>}</div>
    <ImportSummary values={summary} />
    {!committed && summary.issues > 0 && <div className={styles.importNotice}><CircleAlert size={17} aria-hidden="true" /><p>Rows with issues need your attention. Merge is available only when Outreach found a specific contact.</p></div>}
    {message && <p className={styles.unavailable} role="status">{message}</p>}
    {!committed && <div className={styles.resolutions}>{rows.map((row) => <MatchResolution key={row.id} id={row.id} name={row.name} issue={row.issue || "Ready to import"} decision={row.decision} canMerge={row.matchedContactId !== null} onDecision={(decision) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, decision } : item))} />)}</div>}
    {!committed && <button className={styles.primaryButton} disabled={busy || !importId || preview} onClick={() => void commit()}>{busy ? "Committing…" : `Commit ${rows.length - summary.exclude} reviewed rows`}</button>}
  </section>;
}
