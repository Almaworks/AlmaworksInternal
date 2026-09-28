import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ReactElement, ReactNode } from "react";
import ts from "typescript";

type StateSetter = (next: unknown) => void;
type HookSlot = { kind: "state"; value: unknown } | { kind: "ref"; value: { current: unknown } };
type ElementProps = Record<string, unknown> & { children?: ReactNode };

function createHookHarness() {
  const slots: HookSlot[] = [];
  let cursor = 0;
  return {
    begin() { cursor = 0; },
    useState(initial: unknown): [unknown, StateSetter] {
      const index = cursor++;
      if (!slots[index]) slots[index] = { kind: "state", value: typeof initial === "function" ? (initial as () => unknown)() : initial };
      const slot = slots[index];
      assert.equal(slot.kind, "state");
      return [slot.value, (next) => { slot.value = typeof next === "function" ? (next as (current: unknown) => unknown)(slot.value) : next; }];
    },
    useRef(initial: unknown): { current: unknown } {
      const index = cursor++;
      if (!slots[index]) slots[index] = { kind: "ref", value: { current: initial } };
      const slot = slots[index];
      assert.equal(slot.kind, "ref");
      return slot.value;
    },
  };
}

function loadUiModule(filename: string, hooks: ReturnType<typeof createHookHarness>, authenticatedFetch: (input: string, init?: RequestInit) => Promise<Response>): Record<string, unknown> {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  function load(current: string): Record<string, unknown> {
    if (cache.has(current)) return cache.get(current)!.exports;
    const loaded = { exports: {} as Record<string, unknown> };
    cache.set(current, loaded);
    const nativeRequire = createRequire(current);
    const requireLocal = (name: string): unknown => {
      if (name === "react") return { ...nativeRequire("react"), useState: hooks.useState, useRef: hooks.useRef };
      if (name === "@/src/auth/authenticated-fetch") return { authenticatedFetch };
      if (name.endsWith(".css")) return new Proxy({}, { get: (_target, key) => String(key) });
      if (!name.startsWith(".") && !name.startsWith("@/")) return nativeRequire(name);
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(current), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
      if (!resolved) throw new Error(`Cannot resolve ${name}`);
      return load(resolved);
    };
    const compiled = ts.transpileModule(readFileSync(current, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", compiled)(requireLocal, loaded, loaded.exports);
    return loaded.exports;
  }
  return load(filename);
}

function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  const element = node as ReactElement<ElementProps>;
  return [element, ...elements(element.props?.children)];
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return textContent((node as ReactElement<{ children?: ReactNode }>).props?.children);
}

test("avatar renders initials, falls back after an image error, and retries a changed URL", () => {
  const hooks = createHookHarness();
  const filename = path.resolve("components/profile-photo/ProfileAvatar.tsx");
  const { ProfileAvatar } = loadUiModule(filename, hooks, async () => new Response()) as {
    ProfileAvatar: (props: { name: string; photoUrl?: string | null }) => ReactElement;
  };

  hooks.begin();
  const empty = ProfileAvatar({ name: "  Ada   Lovelace ", photoUrl: null });
  assert.equal(elements(empty).some((element) => element.type === "img"), false);
  assert.match(textContent(empty), /AL/u);

  hooks.begin();
  const withImage = ProfileAvatar({ name: "Ada Lovelace", photoUrl: "https://signed.test/old" });
  const image = elements(withImage).find((element) => element.type === "img");
  assert.ok(image);
  assert.equal(image.props.src, "https://signed.test/old");
  assert.equal(image.props.alt, "");
  (image.props.onError as () => void)();

  hooks.begin();
  const failed = ProfileAvatar({ name: "Ada Lovelace", photoUrl: "https://signed.test/old" });
  assert.equal(elements(failed).some((element) => element.type === "img"), false);
  assert.match(textContent(failed), /AL/u);

  hooks.begin();
  const replacement = ProfileAvatar({ name: "Ada Lovelace", photoUrl: "https://signed.test/new" });
  assert.equal(elements(replacement).find((element) => element.type === "img")?.props.src, "https://signed.test/new");
});

test("preview photo control exposes no actionable upload or remove element", () => {
  const hooks = createHookHarness();
  const requests: string[] = [];
  const filename = path.resolve("components/profile-photo/ProfilePhotoControl.tsx");
  const { ProfilePhotoControl } = loadUiModule(filename, hooks, async (input) => { requests.push(input); return Response.json({ photoUrl: "unexpected" }); }) as {
    ProfilePhotoControl: (props: { name: string; photoUrl: string | null; preview: boolean; onPhotoChange: (value: string | null) => void }) => ReactElement;
  };

  hooks.begin();
  const preview = ProfilePhotoControl({ name: "Ada Lovelace", photoUrl: "https://signed.test/photo", preview: true, onPhotoChange: () => assert.fail("preview changed photo") });
  assert.equal(elements(preview).some((element) => element.type === "input" || element.type === "button"), false);
  assert.match(textContent(preview), /Photo changes are disabled/u);
  assert.equal(requests.length, 0);
});

test("photo control validates locally and applies only a successful upload response", async () => {
  const hooks = createHookHarness();
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const changes: Array<string | null> = [];
  const filename = path.resolve("components/profile-photo/ProfilePhotoControl.tsx");
  const { ProfilePhotoControl } = loadUiModule(filename, hooks, async (input, init) => {
    requests.push({ input, init });
    return Response.json({ photoUrl: "https://signed.test/versioned" });
  }) as {
    ProfilePhotoControl: (props: { name: string; photoUrl: string | null; preview: boolean; onPhotoChange: (value: string | null) => void }) => ReactElement;
  };
  const props = { name: "Ada Lovelace", photoUrl: null, preview: false, onPhotoChange: (value: string | null) => changes.push(value) };

  hooks.begin();
  const initial = ProfilePhotoControl(props);
  const input = elements(initial).find((element) => element.type === "input");
  assert.ok(input);
  (input.props.onChange as (event: { target: { files: File[] } }) => void)({ target: { files: [new File(["not an image"], "photo.gif", { type: "image/gif" })] } });

  hooks.begin();
  const invalid = ProfilePhotoControl(props);
  assert.match(textContent(invalid), /Choose a JPEG, PNG, or WebP image/u);
  assert.equal(requests.length, 0);
  assert.equal(changes.length, 0);

  const validInput = elements(invalid).find((element) => element.type === "input");
  assert.ok(validInput);
  (validInput.props.onChange as (event: { target: { files: File[] } }) => void)({ target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" })] } });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 1);
  const request = requests.at(0);
  assert.ok(request);
  assert.equal(request.input, "/api/profile-photo");
  assert.equal(request.init?.method, "POST");
  assert.ok(request.init?.body instanceof FormData);
  assert.deepEqual(changes, ["https://signed.test/versioned"]);

  hooks.begin();
  const succeeded = ProfilePhotoControl({ ...props, photoUrl: changes[0] });
  assert.match(textContent(succeeded), /Profile photo updated/u);
});
