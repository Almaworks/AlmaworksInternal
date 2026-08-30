"use client";

import { Fragment, useMemo, useState } from "react";

import styles from "./mentor-needs.module.css";

type Need = { label: string; custom?: boolean };
type Category = {
  name: string;
  requested: number;
  mentors: string[];
  outreach: string[];
  note: string;
};

const canonicalNeeds = [
  "Fundraising strategy",
  "Enterprise sales",
  "Go-to-market",
  "Product strategy",
  "Hiring and team building",
  "Legal and incorporation",
  "Marketing and brand",
];

const categories: Category[] = [
  { name: "Enterprise sales", requested: 8, mentors: ["Dana Okafor", "Samir Rao"], outreach: ["Nora Kim · warm", "Elliot Park · researching"], note: "Strong demand from B2B founders; one more active mentor would reduce matching wait time." },
  { name: "Fundraising strategy", requested: 6, mentors: ["Priya Shah"], outreach: ["Avery Lin · contacted", "Joanne Wu · ready"], note: "Requests are covered this month, but the active bench is thin for September." },
  { name: "Regulated health", requested: 4, mentors: [], outreach: ["Maya Patel · replied", "Luis Ortega · researching", "Rae Johnson · identified"], note: "Priority gap: no active mentor has tagged experience in this category." },
  { name: "Marketing and brand", requested: 3, mentors: ["Lena Brooks", "Owen Chen", "Tara Singh"], outreach: [], note: "Healthy coverage. Keep contacts visible for next cohort recruiting." },
];

export default function MentorNeedsPreviewPage() {
  const [view, setView] = useState<"form" | "board">("form");
  const [query, setQuery] = useState("");
  const [primary, setPrimary] = useState<Need | null>(null);
  const [secondary, setSecondary] = useState<Need | null>(null);
  const [noPreference, setNoPreference] = useState(false);
  const [context, setContext] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null>("Regulated health");
  const [needsSectionOpen, setNeedsSectionOpen] = useState(true);
  const [needsView, setNeedsView] = useState<"table" | "chart">("table");
  const [cohort, setCohort] = useState("Fall 2026");
  const [showAllTime, setShowAllTime] = useState(false);

  const suggestions = useMemo(() => canonicalNeeds.filter((item) => item.toLowerCase().includes(query.toLowerCase()) && item !== primary?.label && item !== secondary?.label), [primary, query, secondary]);
  const hasNeed = Boolean(primary || secondary);

  function chooseNeed(label: string, custom = false) {
    const need = { label, custom };
    if (!primary) setPrimary(need);
    else if (!secondary) setSecondary(need);
    setQuery("");
    setNoPreference(false);
  }

  function setNoPreferencePath() {
    setNoPreference((value) => !value);
    setPrimary(null);
    setSecondary(null);
    setQuery("");
  }

  function savePreview() {
    setNotice(noPreference ? "Preference saved locally for this preview." : "Mentor needs saved locally for this preview.");
  }

  function categoryDetail(category: Category) {
    return <div className={styles.detail}><p>{category.note}</p><div><h3>Active mentors</h3>{category.mentors.length ? category.mentors.map((name) => <span className={styles.person} key={name}>{name}</span>) : <span className={styles.empty}>None tagged</span>}</div><div><h3>Outreach pipeline</h3>{category.outreach.length ? category.outreach.map((name) => <span className={styles.person} key={name}>{name}</span>) : <span className={styles.empty}>No active contacts</span>}</div></div>;
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>Frontend proposal · Mentor needs</p><h1>Make the need visible before the match.</h1><p className={styles.subhead}>A no-write preview of the startup intake and the recruiting signal it gives Outreach.</p></div>
      <span className={styles.previewBadge}>Fictional data · no changes saved</span>
    </header>

    <nav className={styles.tabs} aria-label="Mentor needs preview views">
      <button className={view === "form" ? styles.activeTab : ""} onClick={() => setView("form")}>Startup request</button>
      <button className={view === "board" ? styles.activeTab : ""} onClick={() => setView("board")}>Outreach needs board</button>
    </nav>

    {view === "form" ? <section className={styles.formShell} aria-labelledby="form-title">
      <div className={styles.formIntro}><p className={styles.eyebrow}>Northstar Health · Fall 2026</p><h2 id="form-title">What kind of mentor would move you forward?</h2><p>Choose up to two areas. A short explanation helps Almaworks make a more useful introduction.</p></div>
      <div className={styles.formBody}>
        <div className={styles.field}><label htmlFor="need-search">Primary mentor need <span>required unless you have no preference</span></label>
          <div className={styles.searchWrap}><input id="need-search" value={query} onChange={(event) => setQuery(event.target.value)} disabled={noPreference || Boolean(secondary)} placeholder={primary ? "Add an optional second need" : "Search common mentor needs"} autoComplete="off" />
            {query && !noPreference && !secondary && <div className={styles.suggestions} role="listbox">{suggestions.map((item) => <button key={item} role="option" aria-selected={false} onClick={() => chooseNeed(item)}>{item}<small>Canonical category</small></button>)}<button className={styles.customSuggestion} onClick={() => chooseNeed(query.trim(), true)} disabled={!query.trim()}>Create “{query.trim() || "this category"}” <small>Custom category</small></button></div>}
          </div>
          {primary && <div className={styles.selectedNeed}><span>{primary.label}{primary.custom && <em>Custom</em>}</span><button onClick={() => setPrimary(null)} aria-label={`Remove ${primary.label}`}>×</button></div>}
        </div>
        {primary && !secondary && !noPreference && <button className={styles.addSecondary} onClick={() => { setQuery(""); const input = document.getElementById("need-search"); input?.focus(); }}>+ Add a secondary need <span>optional</span></button>}
        {primary && !secondary && !noPreference && query === "" && <div className={styles.secondaryHint}>Search above to add a second category.</div>}
        {secondary && <div className={styles.selectedNeed}><span>{secondary.label}{secondary.custom && <em>Custom</em>}</span><button onClick={() => setSecondary(null)} aria-label={`Remove ${secondary.label}`}>×</button></div>}
        <label className={styles.noPreference}><input type="checkbox" checked={noPreference} onChange={setNoPreferencePath} /> <span><strong>I don’t have a preference yet.</strong><small>Almaworks can recommend the right mentor based on your context.</small></span></label>
        <div className={styles.field}><label htmlFor="context">Context for your mentor <span>optional but helpful</span></label><textarea id="context" value={context} onChange={(event) => setContext(event.target.value)} placeholder="What decision, challenge, or milestone would you like to discuss?" rows={5} /><small className={styles.helper}>For example: “We’re preparing our first enterprise pilot and need help navigating procurement.”</small></div>
        <div className={styles.formFooter}><span>{hasNeed || noPreference ? "Ready to share with the program team" : "Choose a category or indicate no preference"}</span><button className={styles.primaryButton} disabled={!hasNeed && !noPreference} onClick={savePreview}>Save mentor needs</button></div>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
      </div>
    </section> : <section className={styles.boardShell} aria-labelledby="board-title">
      <div className={styles.boardHeader}><div><p className={styles.eyebrow}>Recruiting signal</p><h2 id="board-title">Where mentorship demand outpaces supply</h2><p>Compare active startup requests with active mentors and manually tagged Outreach contacts.</p></div><label className={styles.cohortControl}>Cohort<select value={cohort} onChange={(event) => event.target.value === "All time" ? setShowAllTime(true) : setCohort(event.target.value)}><option>Fall 2026</option><option>Spring 2026</option><option>All time</option></select></label></div>
      {cohort === "All time" && <div className={styles.warning}><strong>All-time comparison.</strong> This combines historic tags and requests; use the cohort view for active recruiting decisions.</div>}
      <div className={styles.summary}><article><strong>21</strong><span>active startup requests</span></article><article><strong>6</strong><span>active mentors</span></article><article><strong>7</strong><span>active Outreach contacts</span></article><article className={styles.gapCard}><strong>1</strong><span>priority mentor gap</span></article></div>
      <section className={styles.needsSection} aria-labelledby="individual-needs-title">
        <button className={styles.needsSectionButton} onClick={() => setNeedsSectionOpen((open) => !open)} aria-expanded={needsSectionOpen} aria-controls="individual-needs-content">
          <span><span className={styles.eyebrow}>Coverage detail</span><strong id="individual-needs-title">Individual mentor needs</strong><small>Compare demand, active capacity, and the Outreach pipeline by category.</small></span><span className={styles.chevron}>{needsSectionOpen ? "−" : "+"}</span>
        </button>
        {needsSectionOpen && <div className={styles.needsSectionContent} id="individual-needs-content">
          <div className={styles.viewControls} role="group" aria-label="Individual needs view">
            <span>View</span><button className={needsView === "table" ? styles.activeView : ""} onClick={() => setNeedsView("table")} aria-pressed={needsView === "table"}>Table</button><button className={needsView === "chart" ? styles.activeView : ""} onClick={() => setNeedsView("chart")} aria-pressed={needsView === "chart"}>Signal bars</button>
          </div>
          {needsView === "table" ? <div className={styles.tableWrap}><table className={styles.needsTable}><caption>Individual mentor needs for the selected cohort. Select a need type to show active mentors and Outreach contacts.</caption><thead><tr><th scope="col">Need type</th><th scope="col">Startup requests</th><th scope="col">Active mentors</th><th scope="col">Active Outreach contacts</th><th scope="col">Status</th></tr></thead><tbody>{categories.map((category) => {
            const open = expanded === category.name;
            const gap = category.mentors.length === 0;
            return <Fragment key={category.name}><tr className={gap ? styles.priorityRow : ""}><th scope="row"><button className={styles.needNameButton} onClick={() => setExpanded(open ? null : category.name)} aria-expanded={open} aria-controls={`need-detail-${category.name.replaceAll(" ", "-")}`}>{category.name}<span>{open ? "Hide details" : "Show details"}</span></button></th><td>{category.requested}</td><td>{category.mentors.length}</td><td>{category.outreach.length}</td><td><span className={gap ? styles.gapPill : styles.statusPill}>{gap ? "Gap" : "Tracking"}</span></td></tr>{open && <tr className={styles.tableDetailRow} id={`need-detail-${category.name.replaceAll(" ", "-")}`}><td colSpan={5}>{categoryDetail(category)}</td></tr>}</Fragment>;
          })}</tbody></table></div> : <><aside className={styles.legend} aria-label="Coverage signal legend"><span><i className={styles.requestKey} />Startup requests</span><span><i className={styles.mentorKey} />Active mentors</span><span><i className={styles.outreachKey} />Active Outreach contacts</span><small>Bar length is relative to startup requests in each category.</small></aside><div className={styles.categoryList}>{categories.map((category) => {
        const open = expanded === category.name;
        const mentorCount = category.mentors.length;
        const outreachCount = category.outreach.length;
        const gap = mentorCount === 0;
        const shortfall = Math.max(category.requested - mentorCount, 0);
        const percentage = (value: number) => `${Math.min((value / category.requested) * 100, 100)}%`;

        return <article className={`${styles.category} ${gap ? styles.priorityCategory : ""}`} key={category.name}>
          <button className={styles.categoryButton} onClick={() => setExpanded(open ? null : category.name)} aria-expanded={open}>
            <span><strong>{category.name}</strong><small>{gap ? "Uncovered need — recruiter action needed" : `${shortfall} more mentor${shortfall === 1 ? "" : "s"} than active mentors`}</small></span>
            <span className={gap ? styles.gapPill : styles.statusPill}>{gap ? "Priority gap" : "Tracking"}</span><span className={styles.chevron}>{open ? "−" : "+"}</span>
          </button>
          <div className={styles.signalPanel} role="img" aria-label={`coverage for ${category.name}: ${category.requested} startup requests, ${mentorCount} active mentors, ${outreachCount} active Outreach contacts; mentor shortfall of ${shortfall}.`}>
            <div className={styles.signalHeader}><strong>Coverage signals</strong><span className={gap ? styles.shortfall : ""}>{gap ? "No active mentor" : `${shortfall} mentor shortfall`}</span></div>
            <div className={styles.signalRow}><span className={styles.signalLabel}><i className={styles.requestKey} />Startup requests</span><strong>{category.requested}</strong><span className={styles.track}><span className={`${styles.bar} ${styles.requestBar}`} style={{ width: "100%" }} /></span></div>
            <div className={styles.signalRow}><span className={styles.signalLabel}><i className={styles.mentorKey} />Active mentors</span><strong>{mentorCount}</strong><span className={styles.track}><span className={`${styles.bar} ${styles.mentorBar} ${gap ? styles.emptyBar : ""}`} style={{ width: percentage(mentorCount) }} /></span></div>
            <div className={styles.signalRow}><span className={styles.signalLabel}><i className={styles.outreachKey} />Outreach contacts</span><strong>{outreachCount}</strong><span className={styles.track}><span className={`${styles.bar} ${styles.outreachBar}`} style={{ width: percentage(outreachCount) }} /></span></div>
            <p className={styles.srOnly}>{category.name}: {category.requested} startup requests, {mentorCount} active mentors, and {outreachCount} active Outreach contacts. The mentor shortfall is {shortfall}.</p>
          </div>
          {open && categoryDetail(category)}
        </article>;
      })}</div></>}
        </div>}
      </section>
    </section>}
    {showAllTime && <div className={styles.backdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="all-time-title"><p className={styles.eyebrow}>Broader comparison</p><h2 id="all-time-title">Include every cohort?</h2><p>Historic demand is useful for recruiting trends, but it is not the same as the current cohort’s active need.</p><div><button className={styles.ghostButton} onClick={() => setShowAllTime(false)}>Cancel</button><button className={styles.primaryButton} onClick={() => { setCohort("All time"); setShowAllTime(false); }}>View all time</button></div></section></div>}
  </main>;
}
