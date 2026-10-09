import { submitSequenzyNotification } from '../../notifications/sequenzy.ts';
import type { WelcomeStatus } from './member-registration.ts';

const escapeHtml = (value: string) => value.replace(/[&<>"']/gu,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

export async function sendMemberWelcome(input: { apiKey?: string; origin?: string; email: string; fullName: string }): Promise<WelcomeStatus> {
  if (!input.apiKey?.trim() || !input.origin) return 'not_configured';
  const url = new URL(input.origin);
  if (url.protocol !== 'https:' || url.origin !== input.origin || url.username || url.password) return 'not_configured';
  const result = await submitSequenzyNotification({
    apiKey: input.apiKey,
    to: input.email,
    subject: 'Your Almaworks access is ready',
    html: `<p>Hello ${escapeHtml(input.fullName)},</p><p>You have been added to Almaworks. Visit <a href="${escapeHtml(url.origin)}">the Almaworks website</a> and sign in with this email address whenever you are ready.</p><p>On your first sign-in, we will send a fresh verification code and guide you through account setup. You do not need to request access or activate an invitation link.</p>`,
  });
  return result.kind;
}
