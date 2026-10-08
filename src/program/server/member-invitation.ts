import { isIP } from 'node:net';

import { submitSequenzyNotification } from '../../notifications/sequenzy.ts';
import { ReconciliationRequiredError } from './user-access.ts';

type GeneratedInvitation = {
  data: { user?: { id: string } | null; properties?: { hashed_token?: string; email_otp?: string } | null } | null;
  error: { message: string } | null;
};

export class MemberInvitationDeliveryError extends Error {
  readonly accountCreated = true;
  readonly deliveryStatus: 'rejected' | 'unknown';

  constructor(deliveryStatus: 'rejected' | 'unknown') {
    super(deliveryStatus === 'rejected'
      ? 'The account was created, but the invitation email was rejected. Check the mail provider and arrange a new invitation link; do not create the account again.'
      : 'The account was created, but invitation email delivery could not be confirmed. Check the mail provider before arranging a new link; do not create the account again.');
    this.name = 'MemberInvitationDeliveryError';
    this.deliveryStatus = deliveryStatus;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function publicInvitationOrigin(value: string | undefined): string {
  const configured = value?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      const hostname = parsed.hostname.toLowerCase();
      if (parsed.protocol === 'https:' && parsed.origin === configured && !parsed.username && !parsed.password
        && hostname.includes('.') && !hostname.includes(':') && !isIP(hostname) && hostname !== 'localhost'
        && !hostname.endsWith('.localhost') && !hostname.endsWith('.local') && !hostname.endsWith('.internal')) {
        return parsed.origin;
      }
    } catch {
      // Invalid configuration must fail before creating an Auth account.
    }
  }
  throw new Error('Invitation origin is not configured as a public HTTPS URL. No account was created.');
}

export async function createAndDeliverMemberInvitation(input: {
  apiKey: string | undefined;
  email: string;
  fullName: string;
  origin: string | undefined;
  generateLink: (redirectTo: string) => Promise<GeneratedInvitation>;
  provision: (userId: string) => Promise<unknown>;
  submit?: typeof submitSequenzyNotification;
}): Promise<{ emailSendId: string; userId: string }> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) throw new Error('Invitation email is not configured. No account was created.');
  const origin = publicInvitationOrigin(input.origin);

  const callback = new URL('/auth/callback', origin);
  callback.searchParams.set('next', '/account/password?reset=1');
  const link = await input.generateLink(callback.toString());
  if (link.error || !link.data?.user?.id) {
    throw new Error('Could not create the invitation. No email was submitted.');
  }
  const userId = link.data.user.id;
  const tokenHash = link.data.properties?.hashed_token;
  const code = link.data.properties?.email_otp;
  if (!tokenHash || !code || !/^(?:\d{6}|\d{8})$/u.test(code)) {
    throw new ReconciliationRequiredError(
      'Auth created an invitation without a usable verification code. Check the account before retrying.',
    );
  }

  await input.provision(userId);

  const name = escapeHtml(input.fullName);
  const invitationUrl = escapeHtml(new URL('/activate?invite=1', origin).toString());
  let delivery: Awaited<ReturnType<typeof submitSequenzyNotification>>;
  try {
    delivery = await (input.submit ?? submitSequenzyNotification)({
      apiKey,
      to: input.email,
      subject: 'You are invited to Almaworks',
      html: `<p>Hello ${name},</p><p>You have been invited to Almaworks. <a href="${invitationUrl}">Set up your account</a> using this email address and the verification code below.</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>After verifying, create your password and complete your profile. This code expires and can only be used once. If it expires, request a fresh code on the setup screen.</p><p>If you were not expecting this invitation, you can ignore this email.</p>`,
    });
  } catch {
    throw new MemberInvitationDeliveryError('unknown');
  }
  if (delivery.kind !== 'accepted') throw new MemberInvitationDeliveryError(delivery.kind);
  return { emailSendId: delivery.emailSendId, userId };
}
