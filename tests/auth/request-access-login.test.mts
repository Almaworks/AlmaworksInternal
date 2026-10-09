import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { signOutParticipant } from '../../src/auth/participant-sign-out.ts';

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

async function harness(signedIn: boolean, signOut: (options: { scope: 'local' }) => Promise<{ error: { message: string } | null }>) {
  const states: unknown[] = [];
  let index = 0, mounted = false;
  const effects: Array<() => void> = [];
  const destinations: string[] = [];
  const client = { auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'fixture', email: 'fixture@example.test' } : null }, error: null }), signOut } };
  const hooks = {
    useState(initial: unknown) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (next: unknown) => { states[i] = next; }]; },
    useMemo(factory: () => unknown) { return factory(); },
    useEffect(effect: () => void) { if (!mounted) effects.push(effect); },
  };
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(new URL('../../app/request-access/page.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const componentModule = { exports: {} as { default: () => unknown } };
  const imports: Record<string, unknown> = {
    react: hooks,
    'next/link': { default: 'a', __esModule: true },
    '@/utils/supabase/client': { createClient: () => client },
    '@/components/AlmaworksBrand': { AlmaworksBrand: 'brand' },
    '@/src/auth/password-registration': {},
    '@/src/auth/authenticated-fetch': {},
    '@/src/program/canonical-access': { loadCanonicalAccess: async () => ({ status: 'unregistered', full_name: 'Fixture' }) },
    '@/src/auth/profile-access': {},
    '@/src/auth/participant-sign-out': { signOutParticipant },
  };
  new Function('require', 'module', 'exports', 'window', compiled.outputText)(
    (id: string) => imports[id] ?? require(id), componentModule, componentModule.exports,
    { location: { assign: (href: string) => destinations.push(href), replace: (href: string) => destinations.push(href) } },
  );
  const render = () => { index = 0; return elements(componentModule.exports.default()); };
  render(); mounted = true; effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  return { render, destinations };
}

test('both request-access Sign in controls clear the current session before navigating', async () => {
  for (const buttonIndex of [0, 1]) {
    let release!: () => void;
    const scopes: string[] = [];
    const h = await harness(true, async options => { scopes.push(options.scope); await new Promise<void>(resolve => { release = resolve; }); return { error: null }; });
    const control = h.render().filter(e => (e.type === 'button' || e.type === 'a') && label(e.props.children) === 'Sign in')[buttonIndex];
    assert.equal(typeof control.props.onClick, 'function', 'Sign in must clear the signed-in session, not just link home');
    const action = (control.props.onClick as () => Promise<void>)();
    assert.deepEqual(h.destinations, []);
    assert.deepEqual(scopes, ['local']);
    release(); await action;
    assert.deepEqual(h.destinations, ['/']);
  }
});

test('a sign-out failure keeps the account page open and offers a recoverable error', async () => {
  const h = await harness(true, async () => ({ error: { message: 'Network unavailable' } }));
  const control = h.render().find(e => (e.type === 'button' || e.type === 'a') && label(e.props.children) === 'Sign in')!;
  assert.equal(typeof control.props.onClick, 'function');
  await (control.props.onClick as () => Promise<void>)();
  assert.deepEqual(h.destinations, []);
  assert.ok(h.render().some(e => e.props.role === 'alert' && label(e.props.children).includes('try again')));
  assert.equal(h.render().find(e => (e.type === 'button' || e.type === 'a') && label(e.props.children) === 'Sign in')?.props.disabled, false);
});

test('signed-out visitors can return to login without a sign-out request', async () => {
  let calls = 0;
  const h = await harness(false, async () => { calls++; return { error: null }; });
  const control = h.render().find(e => (e.type === 'button' || e.type === 'a') && label(e.props.children) === 'Sign in')!;
  assert.equal(typeof control.props.onClick, 'function');
  await (control.props.onClick as () => Promise<void>)();
  assert.deepEqual(h.destinations, ['/']);
  assert.equal(calls, 0);
});
