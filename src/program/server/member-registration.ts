import { KnownDatabaseRejectionError } from './canonical-admin.ts';
import { ReconciliationRequiredError } from './user-access.ts';

type MemberInput = { email: string; fullName: string; role: 'mentor' | 'startup' | 'admin'; restoreAccess: boolean };
export type ExistingRegistration = {
  id: string;
  authUserId: string | null;
  status: string;
  isActive: boolean;
  membership: { role: string; status: string } | null;
};
export type WelcomeStatus = 'accepted' | 'not_configured' | 'rejected' | 'unknown';
export class MemberRegistrationConflict extends Error {
  readonly restoreRequired: boolean;
  constructor(message: string, restoreRequired = false) {
    super(message);
    this.restoreRequired = restoreRequired;
  }
}

export async function addProgramMember(input: MemberInput, dependencies: {
  lookup: (email: string) => Promise<ExistingRegistration | null>;
  createIdentity: (email: string, fullName: string) => Promise<string>;
  grantAccess: (profileId: string) => Promise<unknown>;
  removeNewIdentity: (authUserId: string) => Promise<unknown>;
  notify: (email: string, fullName: string) => Promise<WelcomeStatus>;
}) {
  const existing = await dependencies.lookup(input.email);
  if (existing && (!existing.isActive || existing.status === 'rejected') && !input.restoreAccess) {
    throw new MemberRegistrationConflict('This account was rejected or deactivated. Confirm Restore access to add this member.', true);
  }
  if (existing && !existing.authUserId) {
    throw new MemberRegistrationConflict('This profile has no linked sign-in identity. Resolve the identity link before adding access.');
  }
  if (existing?.membership && existing.membership.role !== input.role) {
    throw new MemberRegistrationConflict('This member already has a different role in this cohort. Use Edit member to change their role.');
  }
  if (existing?.membership?.status === 'suspended') {
    throw new MemberRegistrationConflict('This membership is suspended. Restore it through the member access controls.');
  }
  // Repeated submissions must not reset a member's completed onboarding.
  if (existing?.status === 'approved' && existing.isActive && existing.membership
    && ['invited', 'onboarding', 'active'].includes(existing.membership.status)) {
    return { profileId: existing.id, alreadyAdded: true, notification: 'not_configured' as WelcomeStatus };
  }
  const profileId = existing?.id ?? await dependencies.createIdentity(input.email, input.fullName);
  try {
    await dependencies.grantAccess(profileId);
  } catch (cause) {
    if (!existing && cause instanceof KnownDatabaseRejectionError) {
      try { await dependencies.removeNewIdentity(profileId); }
      catch { throw new ReconciliationRequiredError('Membership was rejected and new identity cleanup failed. Check the account before retrying.'); }
    }
    throw cause;
  }
  let notification: WelcomeStatus;
  try { notification = await dependencies.notify(input.email, input.fullName); }
  catch { notification = 'unknown'; }
  return { profileId, alreadyAdded: false, notification };
}
