export interface CompanyWorkspaceRow {
  id: string;
  contactName: string;
  companyName?: string | null;
  companyDomain?: string | null;
  stage: string;
}

export interface CompanyGroup<Row extends CompanyWorkspaceRow> {
  name: string;
  domain: string | null;
  people: readonly Row[];
  openOpportunityCount: number;
}

export function groupWorkspaceRowsByCompany<Row extends CompanyWorkspaceRow>(rows: readonly Row[]): CompanyGroup<Row>[] {
  const groups = new Map<string, CompanyGroup<Row>>();

  for (const row of rows) {
    const name = row.companyName ?? "Independent / no company";
    const group = groups.get(name);
    if (group) {
      groups.set(name, { ...group, people: [...group.people, row], openOpportunityCount: group.openOpportunityCount + (row.stage === "closed" ? 0 : 1) });
    } else {
      groups.set(name, { name, domain: row.companyDomain ?? null, people: [row], openOpportunityCount: row.stage === "closed" ? 0 : 1 });
    }
  }

  return [...groups.values()];
}

export function filterCompanyPeople<Row extends Pick<CompanyWorkspaceRow, "contactName">>(people: readonly Row[], query: string): Row[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return normalizedQuery ? people.filter((person) => person.contactName.toLocaleLowerCase().includes(normalizedQuery)) : [...people];
}
