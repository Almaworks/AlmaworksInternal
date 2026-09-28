export interface CalendarDisconnectJob {
  connectionId: string; leaseToken: string; credentialGeneration: number;
}
export interface CalendarDisconnectRepository {
  /** Database leases only after owned hold cleanup and all provider writes have drained. */
  lease(): Promise<CalendarDisconnectJob | null>;
  finish(input: CalendarDisconnectJob): Promise<boolean>;
}

export async function runCalendarDisconnectBatch(input: {
  repository: CalendarDisconnectRepository; limit?: number;
}): Promise<{ applied: number; failed: number; superseded: number }> {
  const limit=input.limit??10;
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error("Invalid Calendar batch limit");
  const counts={applied:0,failed:0,superseded:0};
  for(let index=0;index<limit;index++){
    const job=await input.repository.lease();if(!job)break;
    // Google revocation affects every client in its Cloud project. Disconnect
    // only forgets this app's credentials after owned-hold cleanup has settled.
    const acknowledged=await input.repository.finish({connectionId:job.connectionId,leaseToken:job.leaseToken,credentialGeneration:job.credentialGeneration});
    if(!acknowledged)counts.superseded++;else counts.applied++;
  }
  return counts;
}
