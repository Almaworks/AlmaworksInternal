import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('admin navigation never starts retired schedule or attendance traffic', () => {
  const source = readFileSync(new URL('../../app/dashboard/admin/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/api\/admin\/session-attendance|loadSessionRsvpStates|false &&|\/api\/admin\/sessions/);
});

test('Friday Program has no dependency on the management page or directory loaders', () => {
  const source = readFileSync(new URL('../../app/dashboard/admin/friday-program/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\.\/page['"]|loadAll|loadMentorDirectory|useCohortScreen/);
  assert.match(source, /FridayProgramPanel/);
});
