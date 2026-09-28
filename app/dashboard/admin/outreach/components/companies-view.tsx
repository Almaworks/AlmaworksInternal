"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { QueueView } from "./queue-view";
import { filterCompanyPeople, groupWorkspaceRowsByCompany, type CompanyGroup } from "./company-view-model";
import { formatEnumLabel } from "@/src/presentation/display-labels";
import type { WorkspaceRow } from "./types";
import styles from "../outreach-workspace.module.css";

export function CompaniesView({ rows, onOpen }: { rows: readonly WorkspaceRow[]; onOpen: (row: WorkspaceRow) => void }) {
  const groups = groupWorkspaceRowsByCompany(rows);
  const [selectedCompany, setSelectedCompany] = useState<CompanyGroup<WorkspaceRow> | null>(null);
  const invokingElement = useRef<HTMLElement | null>(null);

  function closeCompany() { setSelectedCompany(null); }
  function openCompany(company: CompanyGroup<WorkspaceRow>, event: MouseEvent<HTMLButtonElement>) { invokingElement.current = event.currentTarget; setSelectedCompany(company); }
  function openPerson(person: WorkspaceRow) { setSelectedCompany(null); onOpen(person); }

  if (!groups.length) return <QueueView rows={[]} onOpen={onOpen} emptyTitle="No companies match this search" emptyCopy="Companies will appear as contacts are connected to them." />;
  return <><div className={styles.companyGrid}>{groups.map((company) => <section className={styles.companyCard} key={company.name}><p className={styles.eyebrow}>{company.domain ?? "Domain unavailable"}</p><h2>{company.name}</h2><p>Company description is not available from the workspace API.</p><p>{company.people.length} related {company.people.length === 1 ? "person" : "people"} · {company.openOpportunityCount} open opportunities</p><button type="button" onClick={(event) => openCompany(company, event)}>View company</button></section>)}</div>{selectedCompany && <CompanyModal company={selectedCompany} onClose={closeCompany} onOpenPerson={openPerson} returnFocus={invokingElement} />}</>;
}

function CompanyModal({ company, onClose, onOpenPerson, returnFocus }: { company: CompanyGroup<WorkspaceRow>; onClose: () => void; onOpenPerson: (person: WorkspaceRow) => void; returnFocus: RefObject<HTMLElement | null> }) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const people = filterCompanyPeople(company.people, search);

  useEffect(() => {
    const returnFocusElement = returnFocus.current;
    searchRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); returnFocusElement?.focus(); };
  }, [onClose, returnFocus]);

  return <div className={styles.companyModalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={styles.companyModal} role="dialog" aria-modal="true" aria-labelledby="company-modal-title" aria-describedby="company-modal-copy"><button className={styles.close} type="button" onClick={onClose} aria-label={`Close ${company.name}`}><X size={18} /></button><p className={styles.eyebrow}>Company</p><h2 id="company-modal-title">{company.name}</h2><p className={styles.companyModalCopy} id="company-modal-copy">Company information currently returned by the Outreach workspace.</p><dl className={styles.companyDetails}><div><dt>Domain</dt><dd>{company.domain ?? "Not available"}</dd></div><div><dt>Related people</dt><dd>{company.people.length}</dd></div><div><dt>Open opportunities</dt><dd>{company.openOpportunityCount}</dd></div></dl><p className={styles.companyDataGap}>A company description, website, sector, and company record ID are not available from this workspace response.</p><section className={styles.companyPeople} aria-labelledby="company-people-title"><div className={styles.companyPeopleHeading}><div><h3 id="company-people-title">Associated people</h3><p>{people.length} of {company.people.length} shown</p></div><label className={styles.companyPeopleSearch}><Search size={15} aria-hidden="true" /><span className={styles.srOnly}>Search associated people by name</span><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people" /></label></div>{people.length ? <ul className={styles.companyPeopleList}>{people.map((person) => <li key={person.id}><button type="button" onClick={() => onOpenPerson(person)}><span><strong>{person.contactName}</strong><small>{person.contactEmail ?? "No email on record"}</small></span><span className={styles.stage}>{formatEnumLabel(person.stage)}</span></button></li>)}</ul> : <p className={styles.companyNoResults}>No associated people match “{search.trim()}”.</p>}</section></section></div>;
}
