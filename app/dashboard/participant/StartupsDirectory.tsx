"use client";

import { useEffect, useState } from "react";
import { Building2, ExternalLink, Mail, Search } from "lucide-react";
import { filterStartupDirectory, type StartupDirectoryProfile } from "@/src/dashboard/participant-startups";
import { ProfileAvatar } from "@/components/profile-photo/ProfileAvatar";
import { formatEnumLabel } from "@/src/presentation/display-labels";
import styles from "./startups-directory.module.css";

function websiteHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

export default function StartupsDirectory({ startups, semesterName, preview }: {
  startups: StartupDirectoryProfile[];
  semesterName: string;
  preview: boolean;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (/^startup-[a-f0-9-]+$/i.test(id)) document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [startups]);
  const filtered = filterStartupDirectory(startups, query);
  return <section className={styles.directory} aria-labelledby="startups-heading">
    <header className={styles.heading}>
      <p className={styles.eyebrow}>{semesterName}</p>
      <h1 id="startups-heading">Startups</h1>
      <p>Get to know the companies in your cohort and the people building them.</p>
    </header>
    <label className={styles.search}>
      <Search size={18} aria-hidden="true" />
      <input aria-label="Search startups" placeholder="Search startups, industries, needs, or people" value={query} onChange={(event) => setQuery(event.target.value)} />
    </label>
    <p className={styles.count} aria-live="polite">{filtered.length} of {startups.length} startups</p>
    <div className={styles.list}>
      {filtered.map((startup) => {
        const website = websiteHref(startup.websiteUrl);
        return <article id={`startup-${startup.id}`} key={startup.id} className={styles.card}>
          <div className={styles.cardHeading}>
            <div className={styles.companyIcon}><Building2 size={24} aria-hidden="true" /></div>
            <div><h2>{startup.name}</h2><p className={styles.metadata}>{[startup.industry, startup.stage && formatEnumLabel(startup.stage)].filter(Boolean).join(" · ") || "Company profile"}</p></div>
            {website && (preview ? <span className={styles.website}>Website<ExternalLink size={14} /></span> : <a className={styles.website} href={website} target="_blank" rel="noreferrer">Website<ExternalLink size={14} /></a>)}
          </div>
          <p className={styles.description}>{startup.description || "This startup is completing its profile."}</p>
          {startup.mentorshipNeeds.length > 0 && <div className={styles.detail}><h3>Mentorship needs</h3><div className={styles.tags}>{startup.mentorshipNeeds.map((need) => <span key={need}>{need}</span>)}</div></div>}
          {startup.mentorNeedContext && <div className={styles.detail}><h3>How mentors can help</h3><p>{startup.mentorNeedContext}</p></div>}
          {startup.goals.length > 0 && <div className={styles.detail}><h3>Goals</h3><ul>{startup.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul></div>}
          <div className={styles.team}>
            <h3>People <span>{startup.people.length}</span></h3>
            {startup.people.length === 0 ? <p className={styles.metadata}>No active team members listed yet.</p> : <ul>{startup.people.map((person) => <li key={person.id}>
              <ProfileAvatar name={person.name} photoUrl={person.photoUrl} size="small" />
              <strong>{person.name}</strong>
              {person.email && (preview ? <span className={styles.email}><Mail size={14} />{person.email}</span> : <a className={styles.email} href={`mailto:${person.email}`}><Mail size={14} />{person.email}</a>)}
            </li>)}</ul>}
          </div>
        </article>;
      })}
    </div>
    {filtered.length === 0 && <div className={styles.empty}>
      <Building2 size={28} aria-hidden="true" />
      <h2>{startups.length ? "No startups match" : "No startups yet"}</h2>
      <p>{startups.length ? "Try another company name, industry, or team member." : "Startup profiles will appear here as companies join your cohort."}</p>
      {query && <button onClick={() => setQuery("")}>Clear search</button>}
    </div>}
  </section>;
}
