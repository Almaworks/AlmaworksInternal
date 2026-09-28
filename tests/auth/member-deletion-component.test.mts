import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as model from '../../components/member-deletion-model.ts';
import { parseDeletionPreview, deletionReady, DeletionRequestSequence, deletionOutcome } from '../../components/member-deletion-model.ts';

const preview = { profileId: 'target', fullName: 'Test member', email: 'fixture@example.test', version: 'v1', status: 'ready', counts: { memberships: 2 }, blockers: [], impact: { semesters: ['Fall fixture'], sharedStartups: ['Fixture organization'], upcomingMentorMeetings: [] } };
test('preview rejects incorrect target, incomplete counts and unknown status', () => {
  assert.equal(parseDeletionPreview({ data: preview }, 'other'), null);
  assert.equal(parseDeletionPreview({ data: { ...preview, counts: { memberships: -1 } } }, 'target'), null);
  assert.equal(parseDeletionPreview({ data: { ...preview, status: 'unknown' } }, 'target'), null);
  assert.equal(parseDeletionPreview({ data: { ...preview, counts: {} } }, 'target'), null);
  assert.equal(parseDeletionPreview({ data: { ...preview, impact: undefined } }, 'target'), null);
  assert.ok(parseDeletionPreview({ data: { ...preview, status: 'completed', email: '' } }, 'target'));
  assert.ok(parseDeletionPreview({ data: preview }, 'target'));
});
test('execution requires loaded unblocked preview and both confirmations', () => {
  const parsed = parseDeletionPreview({ data: preview }, 'target')!;
  assert.equal(deletionReady(null, preview.email, 'DELETE', 'Requested removal'), false);
  assert.equal(deletionReady(parsed, preview.email, 'DELETE', 'Requested removal'), true);
  assert.equal(deletionReady(parsed, 'different@example.test', 'DELETE', 'Requested removal'), false);
  assert.equal(deletionReady(parsed, preview.email, 'delete', 'Requested removal'), false);
  assert.equal(deletionReady(parsed, preview.email, 'DELETE', 'x'.repeat(501)), false);
  assert.equal(deletionReady({ ...parsed, blockers: ['Dependency remains'] }, preview.email, 'DELETE', 'Requested removal'), false);
  assert.equal(deletionReady({ ...parsed, status: 'completed' }, preview.email, 'DELETE', 'Requested removal'), false);
});
test('late preview cannot overwrite a newer request or a closed dialog', () => {
  const requests = new DeletionRequestSequence();
  const first = requests.begin();
  const second = requests.begin();
  assert.equal(requests.current(first), false);
  assert.equal(requests.current(second), true);
  requests.invalidate();
  assert.equal(requests.current(second), false);
});
test('completed outcome remains irreversible on refresh failure; partial deletion can recover', () => {
  assert.deepEqual(deletionOutcome('completed', false), { canRetryDeletion: false, canRetryRefresh: true });
  assert.deepEqual(deletionOutcome('in_progress', false), { canRetryDeletion: true, canRetryRefresh: false });
});

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function label(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(label).join('');
  if (node && typeof node === 'object' && 'props' in node) return label((node as Element).props.children);
  return '';
}
function harness(fetcher: (input: string, init?: RequestInit) => Promise<Response>, refresh: () => Promise<void>) {
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [];
  let stateIndex = 0, refIndex = 0, locks = 0, completions = 0, ready = 0;
  const hooks = {
    useState(initial: unknown) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], (next: unknown) => { states[index] = next; }]; },
    useRef(initial: unknown) { return refs[refIndex++] ??= { current: initial }; },
    useId() { return 'deletion-test'; }, useEffect() {},
  };
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync('components/MemberDeletionControl.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports: Record<string, unknown> = {};
  new Function('require', 'exports', compiled.outputText)((name: string) => name === 'react' ? hooks : name === './member-deletion-model' ? model : name === '@/src/auth/authenticated-fetch' ? { authenticatedFetch: fetcher } : require(name), exports);
  const Component = exports.MemberDeletionControl as (props: Record<string, unknown>) => unknown;
  const render = () => { stateIndex = 0; refIndex = 0; return Component({ profileId: 'target', onLocked: () => locks++, onReady: () => ready++, onCompleted: () => completions++, onChanged: refresh }); };
  const button = (name: string) => { const result = elements(render()).find(element => element.type === 'button' && label(element.props.children) === name); assert.ok(result, name); return result; };
  const click = (name: string) => (button(name).props.onClick as () => void)();
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
  return { render, button, click, tick, locks: () => locks, completions: () => completions, ready: () => ready, fill() {
    const fields = elements(render()).filter(element => element.type === 'input' || element.type === 'textarea');
    for (const [index, value] of ['Requested fixture removal', preview.email, 'DELETE'].entries()) (fields[index].props.onChange as (event: unknown) => void)({ target: { value } });
  } };
}

test('component prevents duplicate submission and preserves completion after refresh fails', async () => {
  let writes = 0;
  let finish: (response: Response) => void = () => {};
  const h = harness(async (_url, init) => {
    if (init?.method === 'DELETE') { writes++; return await new Promise<Response>(resolve => { finish = resolve; }); }
    return Response.json({ data: preview });
  }, async () => { throw new Error('offline'); });
  h.click('Delete account and personal data'); await h.tick(); h.fill();
  assert.equal(h.button('Permanently delete').props.disabled, false);
  const submit = h.button('Permanently delete').props.onClick as () => void;
  submit(); submit(); assert.equal(writes, 1);
  finish(Response.json({ data: { profileId: 'target', status: 'completed' } })); await h.tick();
  assert.match(label(h.render()), /Deletion complete/);
  assert.match(label(h.render()), /Members list could not refresh/);
  assert.ok(h.button('Retry refresh'));
  assert.equal(elements(h.render()).some(element => label(element.props.children) === 'Permanently delete'), false);
  assert.equal(h.locks(), 1);
  assert.equal(h.completions(), 1);
});

test('component invalidates stale preview after partial failure and reloads before retry', async () => {
  let writes = 0;
  const h = harness(async (_url, init) => {
    if (init?.method === 'DELETE') { writes++; return Response.json({ error: { message: 'Storage cleanup interrupted', reconciliationRequired: true } }, { status: 503 }); }
    return Response.json({ data: { ...preview, status: writes ? 'in_progress' : 'ready' } });
  }, async () => {});
  h.click('Delete account and personal data'); await h.tick(); h.fill();
  h.click('Permanently delete'); await h.tick();
  assert.equal(h.button('Permanently delete').props.disabled, true);
  h.click('Reload preview'); await h.tick();
  assert.equal(h.ready(), 1, 'in-progress preview never unlocks account actions');
  assert.equal(h.button('Resume deletion').props.disabled, true);
  h.fill(); assert.equal(h.button('Resume deletion').props.disabled, false);
});

test('lost deletion response recovers completed state from a preview with erased email', async () => {
  let deleted = false;
  const h = harness(async (_url, init) => {
    if (init?.method === 'DELETE') { deleted = true; throw new Error('Connection lost'); }
    return Response.json({ data: deleted ? { ...preview, status: 'completed', email: '', fullName: 'Deleted member' } : preview });
  }, async () => {});
  h.click('Delete account and personal data'); await h.tick(); h.fill();
  h.click('Permanently delete'); await h.tick();
  h.click('Reload preview'); await h.tick();
  assert.match(label(h.render()), /Deletion complete/);
  assert.ok(h.button('Retry refresh'));
  assert.equal(h.completions(), 1);
  assert.equal(elements(h.render()).some(element => label(element.props.children) === 'Permanently delete'), false);
});
