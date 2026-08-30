"use client";

import { useMemo, useState } from "react";

import styles from "./cohort-management.module.css";

type Area = "Overview" | "Outreach people" | "Mentors";
type Person = { id: string; name: string; email: string; role: string; cohort: string; status: "Active" | "Inactive" };

const people: Person[] = [
  { id: "1", name: "Amara Johnson", email: "amara@northstar.io", role: "Startup member", cohort: "Fall 2025", status: "Active" },
  { id: "2", name: "Jordan Lee", email: "jordan@orbitlabs.com", role: "Startup member", cohort: "Spring 2026", status: "Active" },
  { id: "3", name: "Riley Chen", email: "riley@almaworks.org", role: "Mentor", cohort: "Spring 2026", status: "Active" },
  { id: "4", name: "Sofia Martinez", email: "sofia@harborhealth.com", role: "Admin", cohort: "Fall 2025", status: "Inactive" },
  { id: "5", name: "Owen Brooks", email: "owen@studiofoundry.com", role: "Startup member", cohort: "Fall 2024", status: "Active" },
];

export default function CohortManagementPreviewPage() {
  const [area, setArea] = useState<Area>("Overview");
  const [cohort, setCohort] = useState("Spring 2026");
  const [showWarning, setShowWarning] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const isAllTime = cohort === "All time";
  const visible = useMemo(() => people.filter((person) => {
    const matchesCohort = isAllTime || person.cohort === cohort;
    const haystack = `${person.name} ${person.email} ${person.role}`.toLowerCase();
    return matchesCohort && haystack.includes(query.toLowerCase());
  }), [cohort, isAllTime, query]);

  function changeCohort(value: string) {
    if (value === "All time") { setShowWarning(true); return; }
    setCohort(value); setSelected([]);
  }

  return <main className={styles.page}>
    <div className={styles.kicker}>Frontend proposal · cohort controls</div>
    <div className={styles.heading}><div><h1>People, organized by cohort</h1><p>One consistent control for Overview, Outreach, and Mentors.</p></div><span className={styles.previewBadge}>Mockup only · no data changes</span></div>
    <section className={styles.shell}>
      <nav className={styles.tabs} aria-label="Area preview">{(["Overview", "Outreach people", "Mentors"] as Area[]).map((item) => <button className={area === item ? styles.activeTab : ""} onClick={() => setArea(item)} key={item}>{item}</button>)}</nav>
      <div className={styles.toolbar}><div><p className={styles.eyebrow}>{area}</p><h2>{area === "Overview" ? "Program roster" : area}</h2></div><div className={styles.actions}><label>Cohort<select value={cohort} onChange={(event) => changeCohort(event.target.value)}><option>Spring 2026</option><option>Fall 2025</option><option>Spring 2025</option><option>All time</option></select></label><button className={styles.secondary} onClick={() => setShowImport(true)}>Import from cohort</button></div></div>
      {isAllTime && <div className={styles.warning}><strong>All-time view can take a moment.</strong><span>We’ll load every cohort and keep your filters applied.</span></div>}
      <div className={styles.filters}><label className={styles.search}>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this cohort" /></label><span>{visible.length} people · {cohort}</span></div>
      {selected.length > 0 && <div className={styles.bulkBar}><strong>{selected.length} selected</strong><button onClick={() => setSelected([])}>Set inactive</button><button className={styles.ghost} onClick={() => setSelected([])}>Clear selection</button></div>}
      <div className={styles.tableWrap}><table><thead><tr><th><input aria-label="Select all" type="checkbox" checked={visible.length > 0 && selected.length === visible.length} onChange={(event) => setSelected(event.target.checked ? visible.map((person) => person.id) : [])} /></th><th>Person</th><th>Role</th><th>Cohort</th><th>Status</th></tr></thead><tbody>{visible.map((person) => <tr key={person.id}><td><input aria-label={`Select ${person.name}`} type="checkbox" checked={selected.includes(person.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} /></td><td><strong>{person.name}</strong><small>{person.email}</small></td><td>{person.role}</td><td><span className={styles.tag}>{person.cohort}</span></td><td><span className={person.status === "Active" ? styles.active : styles.inactive}>{person.status}</span></td></tr>)}</tbody></table></div>
    </section>
    {showWarning && <div className={styles.backdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="all-time-title"><p className={styles.eyebrow}>All-time roster</p><h2 id="all-time-title">Load every cohort?</h2><p>This view may take longer to load because it combines all previous sessions.</p><div className={styles.modalActions}><button className={styles.ghost} onClick={() => setShowWarning(false)}>Cancel</button><button className={styles.primary} onClick={() => { setCohort("All time"); setSelected([]); setShowWarning(false); }}>Continue</button></div></section></div>}
    {showImport && <div className={styles.backdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="import-title"><button className={styles.close} onClick={() => setShowImport(false)} aria-label="Close">×</button><p className={styles.eyebrow}>Bring people forward</p><h2 id="import-title">Import from Fall 2025</h2><p>Choose individual people or import the filtered cohort in bulk. Existing profiles stay linked to their history.</p><label className={styles.check}><input type="checkbox" defaultChecked /> Include selected people only</label><div className={styles.modalActions}><button className={styles.ghost} onClick={() => setShowImport(false)}>Cancel</button><button className={styles.primary} onClick={() => setShowImport(false)}>Review import</button></div></section></div>}
  </main>;
}
