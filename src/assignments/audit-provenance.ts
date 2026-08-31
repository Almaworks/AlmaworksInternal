export interface AuditProvenanceRow {
  session_id: string;
}

export interface AuditProvenanceLookupResult {
  data: readonly AuditProvenanceRow[] | null;
  count: number | null;
  error: unknown | null;
}

export type AuditProvenanceLookup = (
  sessionIds: readonly string[],
) => Promise<AuditProvenanceLookupResult>;

const AUDIT_LOOKUP_CHUNK_SIZE = 100;
const AUDIT_LOOKUP_ERROR = "Unable to verify assignment audit protection. The schedule was not refreshed.";

function auditLookupFailure(): Error {
  return new Error(AUDIT_LOOKUP_ERROR);
}

export async function loadAuditedSessionIds(
  visibleSessionIds: readonly string[],
  lookup: AuditProvenanceLookup,
): Promise<ReadonlySet<string>> {
  const uniqueSessionIds = [...new Set(visibleSessionIds)];
  const auditedSessionIds = new Set<string>();

  for (let offset = 0; offset < uniqueSessionIds.length; offset += AUDIT_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueSessionIds.slice(offset, offset + AUDIT_LOOKUP_CHUNK_SIZE);
    let result: AuditProvenanceLookupResult;
    try {
      result = await lookup(chunk);
    } catch {
      throw auditLookupFailure();
    }

    if (result.error !== null || result.data === null || result.count === null || result.count !== result.data.length) {
      throw auditLookupFailure();
    }

    const requestedSessionIds = new Set(chunk);
    for (const row of result.data) {
      if (!requestedSessionIds.has(row.session_id)) throw auditLookupFailure();
      auditedSessionIds.add(row.session_id);
    }
  }

  return auditedSessionIds;
}
