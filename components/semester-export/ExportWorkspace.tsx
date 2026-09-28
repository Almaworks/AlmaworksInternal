"use client";

import { useEffect, useRef, useState } from "react";
import { DataLoading } from "@/components/DataLoading";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import styles from "./export.module.css";

type Semester = { id: string; name: string; is_active: boolean };
type Manifest = {
  semester: { id: string; name: string };
  scope: "semester" | "outreach";
  exportedAt: string;
  datasets: { id: string; file: string; rowCount: number }[];
  exclusions: string[];
};
type PreparedArchive = { url: string; fileName: string; semesterId: string; scope: Manifest["scope"] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function manifestFrom(value: unknown): Manifest | null {
  if (!record(value) || !record(value.data)) return null;
  const data = value.data;
  if (!record(data.semester) || typeof data.semester.id !== "string" || typeof data.semester.name !== "string"
    || !["semester", "outreach"].includes(String(data.scope)) || typeof data.exportedAt !== "string"
    || !Array.isArray(data.datasets) || !data.datasets.every(row => record(row) && typeof row.id === "string"
      && typeof row.file === "string" && typeof row.rowCount === "number" && Number.isSafeInteger(row.rowCount) && row.rowCount >= 0)
    || !Array.isArray(data.exclusions) || !data.exclusions.every(item => typeof item === "string")) return null;
  return data as Manifest;
}
function messageFrom(value: unknown): string {
  return record(value) && record(value.error) && typeof value.error.message === "string"
    ? value.error.message : "The export could not be prepared. Please try again.";
}

export function ExportWorkspace({ preview }: { preview?: { semesters: Semester[]; manifest: Manifest } } = {}) {
  const [semesters, setSemesters] = useState<Semester[]>(preview?.semesters ?? []);
  const [semesterId, setSemesterId] = useState(preview?.manifest.semester.id ?? "");
  const [scope, setScope] = useState<"semester" | "outreach">("semester");
  const [manifest, setManifest] = useState<Manifest | null>(preview?.manifest ?? null);
  const [busy, setBusy] = useState<"load" | "preview" | "download" | null>(preview ? null : "load");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preparedArchive, setPreparedArchive] = useState<PreparedArchive | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const inFlight = useRef(false);
  const archiveUrl = useRef<string | null>(null);
  const mounted = useRef(false);

  function clearPreparedArchive() {
    if (archiveUrl.current) URL.revokeObjectURL(archiveUrl.current);
    archiveUrl.current = null;
    setPreparedArchive(null);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (archiveUrl.current) URL.revokeObjectURL(archiveUrl.current);
      archiveUrl.current = null;
    };
  }, []);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void (async () => {
      try {
        const response = await authenticatedFetch("/api/admin/outreach/semesters");
        const payload: unknown = await response.json();
        if (!response.ok || !record(payload) || !Array.isArray(payload.semesters)) throw new Error("Semesters could not be loaded.");
        const rows = payload.semesters.filter((row): row is Semester => record(row) && typeof row.id === "string" && typeof row.name === "string" && typeof row.is_active === "boolean");
        if (active) { setSemesters(rows); setSemesterId(rows.find(row => row.is_active)?.id ?? rows[0]?.id ?? ""); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Semesters could not be loaded."); }
      finally { if (active) setBusy(null); }
    })();
    return () => { active = false; };
  }, [preview, loadAttempt]);

  async function prepare(download: boolean) {
    if (!semesterId || inFlight.current) return;
    if (preview) {
      if (download) setNotice("This is a fictional preview. Open Export from your admin dashboard to download authorized records.");
      else setManifest({ ...preview.manifest, scope, datasets: preview.manifest.datasets.filter(row => scope === "semester" || row.id.startsWith("outreach")) });
      return;
    }
    inFlight.current = true; setBusy(download ? "download" : "preview"); setError(null); setNotice(null);
    try {
      const query = new URLSearchParams({ semesterId, scope, format: download ? "zip" : "manifest" });
      const response = await authenticatedFetch(`/api/admin/semester-export?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(messageFrom(await response.json().catch(() => null)));
      if (download) {
        if (!response.headers.get("content-type")?.includes("application/zip")) throw new Error("The server did not return an export archive.");
        const blob = await response.blob();
        if (!mounted.current) return;
        const url = URL.createObjectURL(blob);
        const fileName = `almaworks-${scope}-${semesterId}.zip`;
        clearPreparedArchive();
        archiveUrl.current = url;
        setPreparedArchive({ url, fileName, semesterId, scope });
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = fileName;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setNotice("Your archive is ready. Use the prepared download link if your browser did not save it. Open README.md for the Notion import steps. The download contains a fresh snapshot, which may differ from the preview.");
      } else {
        const next = manifestFrom(await response.json());
        if (!next || next.semester.id !== semesterId || next.scope !== scope) throw new Error("The export preview did not match your selection.");
        setManifest(next);
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "The export could not be prepared."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(null); }
  }

  return <main className={styles.shell}>
    <header><p className={styles.eyebrow}>Program records</p><h1>Export to Notion</h1><p>Download semester tables in one archive, with an overview and import instructions.</p></header>
    {error && <div role="alert" className={styles.notice}><p>{error}</p>{semesters.length === 0 && busy === null && <button onClick={() => { setError(null); setBusy("load"); setLoadAttempt(value => value + 1); }}>Reload semesters</button>}</div>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {busy === "load" ? <DataLoading label="Loading export semesters" /> : <section className={styles.card} aria-label="Export selection">
      <div className={styles.fields}>
        <label>Semester<select value={semesterId} disabled={busy !== null} onChange={event => { clearPreparedArchive(); setSemesterId(event.target.value); setManifest(null); setNotice(null); }}>
          {!semesters.length && <option value="">No accessible semesters</option>}
          {semesters.map(semester => <option key={semester.id} value={semester.id}>{semester.name}{semester.is_active ? " · Active" : ""}</option>)}
        </select></label>
        <label>Include<select value={scope} disabled={busy !== null} onChange={event => { clearPreparedArchive(); setScope(event.target.value === "outreach" ? "outreach" : "semester"); setManifest(null); setNotice(null); }}><option value="semester">Semester records and Outreach</option><option value="outreach">Outreach only</option></select></label>
      </div>
      <p>Preview the contents and limitations before downloading. Access follows your semester permissions.</p>
      <button disabled={!semesterId || busy !== null} onClick={() => void prepare(false)}>{busy === "preview" ? "Preparing preview…" : "Preview export"}</button>
    </section>}
    {manifest && <section className={styles.card} aria-label="Export contents">
      <h2>{manifest.semester.name}</h2><p>{manifest.datasets.reduce((total, row) => total + row.rowCount, 0).toLocaleString()} records across {manifest.datasets.length} tables.</p>
      <div className={styles.tableWrap}><table><thead><tr><th>Table</th><th>Records</th></tr></thead><tbody>{manifest.datasets.map(dataset => <tr key={dataset.id}><td>{dataset.id.replaceAll("_", " ")}</td><td>{dataset.rowCount.toLocaleString()}</td></tr>)}</tbody></table></div>
      {manifest.exclusions.length > 0 && <><h3>What to know</h3><ul>{manifest.exclusions.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
      <p>CSV files become Notion databases. Import Markdown separately as pages. Source IDs are included to help reconnect related records.</p>
      <button disabled={busy !== null} onClick={() => void prepare(true)}>{busy === "download" ? "Building archive…" : "Download archive"}</button>
      {preparedArchive && <p className={styles.notice}>If the download did not start, <a href={preparedArchive.url} download={preparedArchive.fileName}>Download prepared archive</a>.</p>}
    </section>}
  </main>;
}
