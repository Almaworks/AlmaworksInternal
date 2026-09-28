import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Only this project's confirmation email is changed; no auth/security toggles.
const project = 'layjdjfvxkowxidwuvbs';
const env = { ...parseEnv(readFileSync('.env.local', 'utf8')), ...process.env };
if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co`) throw new Error('Supabase target mismatch');
const token = env.SUPABASE_ACCESS_TOKEN || readFileSync('supabase/Supabase Codex CLI Token.txt', 'utf8').trim();
const url = `https://api.supabase.com/v1/projects/${project}/config/auth`;
async function config(method = 'GET', body) {
  const response = await fetch(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Auth configuration request failed (${response.status})`);
  return response.json();
}
const desired = {
  mailer_subjects_confirmation: 'Verify your Almaworks email',
  mailer_templates_confirmation_content: readFileSync('supabase/templates/confirmation.html', 'utf8'),
};
const before = await config();
if (process.argv.includes('--apply')) {
  mkdirSync('work', { recursive: true });
  const backup = Object.fromEntries(Object.keys(desired).map(key => [key, before[key]]));
  writeFileSync(`work/signup-email-backup-${Date.now()}.json`, JSON.stringify(backup, null, 2), { flag: 'wx' });
  await config('PATCH', desired);
}
const actual = process.argv.includes('--apply') ? await config() : before;
const matches = Object.entries(desired).every(([key, value]) => actual[key] === value);
console.log(JSON.stringify({ project, applied: process.argv.includes('--apply'), templateMatches: matches,
  confirmationRequired: actual.mailer_autoconfirm === false, smtpConfigured: !!actual.smtp_host,
  emailEnabled: actual.external_email_enabled, googleEnabled: actual.external_google_enabled }));
if (process.argv.includes('--apply') && !matches) process.exitCode = 1;
