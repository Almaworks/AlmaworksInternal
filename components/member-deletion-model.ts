import type { MemberDeletionPreview } from '../src/auth/member-deletion';

export function parseDeletionPreview(payload: unknown, profileId: string): MemberDeletionPreview | null {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return null;
  const data = payload.data;
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  const impact = value.impact;
  if (!impact || typeof impact !== 'object' || Array.isArray(impact)) return null;
  const lists = impact as Record<string, unknown>;
  if (!['semesters', 'sharedStartups', 'upcomingMentorMeetings'].every(key => Array.isArray(lists[key]) && (lists[key] as unknown[]).every(item => typeof item === 'string'))) return null;
  if (value.profileId !== profileId || typeof value.email !== 'string' || (!value.email && value.status !== 'completed') ||
      typeof value.fullName !== 'string' ||
      typeof value.version !== 'string' || !value.version ||
      !['ready', 'in_progress', 'completed'].includes(String(value.status)) ||
      !Array.isArray(value.blockers) || !value.blockers.every(item => typeof item === 'string') ||
      !value.counts || typeof value.counts !== 'object' || Array.isArray(value.counts) ||
      Object.keys(value.counts).length === 0 ||
      !Object.values(value.counts).every(item => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0)) return null;
  return data as MemberDeletionPreview;
}

export function deletionReady(preview: MemberDeletionPreview | null, email: string, confirmation: string, reason: string): boolean {
  return !!preview && preview.status !== 'completed' && preview.blockers.length === 0 &&
    email.trim().toLowerCase() === preview.email.toLowerCase() && confirmation === 'DELETE' && reason.trim().length >= 10 && reason.length <= 500;
}

export class DeletionRequestSequence {
  private sequence = 0;
  begin(): number { return ++this.sequence; }
  invalidate(): void { this.sequence++; }
  current(sequence: number): boolean { return sequence === this.sequence; }
}

export function deletionOutcome(status: MemberDeletionPreview['status'], refreshed: boolean) {
  return { canRetryDeletion: status === 'in_progress', canRetryRefresh: status === 'completed' && !refreshed };
}
