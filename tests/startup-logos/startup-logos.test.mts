import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  StartupLogoError,
  createStartupLogoService,
  type StartupLogoRepository,
} from "../../src/startup-logos/startup-logos.ts";
import { createStartupLogoUrlResolver } from "../../src/startup-logos/urls.ts";

const PROFILE_ID = "10000000-0000-0000-0000-000000000001";
const ORGANIZATION_ID = "40000000-0000-0000-0000-000000000001";
const onePixelPng = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();

function png(bytes: Uint8Array = onePixelPng): File {
  return new File([Uint8Array.from(bytes).buffer], "logo.png", { type: "image/png" });
}

function repository(overrides: Partial<StartupLogoRepository> = {}): StartupLogoRepository {
  return {
    loadForProfile: async () => ({ eligible: true, organizationId: ORGANIZATION_ID, logoPath: null, legacyLogoUrl: null }),
    upload: async () => undefined,
    sign: async (path) => `https://signed.test/${path}`,
    replacePath: async () => true,
    remove: async () => undefined,
    ...overrides,
  };
}

test("uploads a processed startup logo to a versioned organization path", async () => {
  const uploads: Array<{ path: string; type: string }> = [];
  const writes: Array<{ expected: string | null; next: string | null }> = [];
  const service = createStartupLogoService(repository({
    upload: async (path, file) => { uploads.push({ path, type: file.type }); },
    replacePath: async (_organizationId, expected, next) => { writes.push({ expected, next }); return true; },
  }), () => "50000000-0000-0000-0000-000000000002");

  const result = await service.upload(PROFILE_ID, png());
  const path = `${ORGANIZATION_ID}/50000000-0000-0000-0000-000000000002.png`;
  assert.deepEqual(uploads, [{ path, type: "image/png" }]);
  assert.deepEqual(writes, [{ expected: null, next: path }]);
  assert.deepEqual(result, { logoUrl: `https://signed.test/${path}` });
});

test("rejects a participant without an active assigned startup", async () => {
  const service = createStartupLogoService(repository({
    loadForProfile: async () => ({ eligible: false, organizationId: null, logoPath: null, legacyLogoUrl: null }),
  }));
  await assert.rejects(
    service.upload(PROFILE_ID, png()),
    (error: unknown) => error instanceof StartupLogoError && error.status === 403,
  );
});

test("a concurrent replacement deletes only the new object", async () => {
  const removed: string[][] = [];
  const service = createStartupLogoService(repository({
    loadForProfile: async () => ({ eligible: true, organizationId: ORGANIZATION_ID, logoPath: `${ORGANIZATION_ID}/old.jpg`, legacyLogoUrl: null }),
    replacePath: async () => false,
    remove: async (paths) => { removed.push(paths); },
  }), () => "50000000-0000-0000-0000-000000000002");

  await assert.rejects(service.upload(PROFILE_ID, png()), (error: unknown) => error instanceof StartupLogoError && error.status === 409);
  assert.deepEqual(removed, [[`${ORGANIZATION_ID}/50000000-0000-0000-0000-000000000002.png`]]);
});

test("signing and database failures compensate the new object", async () => {
  for (const failingMethod of ["sign", "replacePath"] as const) {
    const removed: string[][] = [];
    const service = createStartupLogoService(repository({
      [failingMethod]: async () => { throw new Error("unavailable"); },
      remove: async (paths) => { removed.push(paths); },
    }), () => "50000000-0000-0000-0000-000000000002");
    await assert.rejects(service.upload(PROFILE_ID, png()), /unavailable/u);
    assert.deepEqual(removed, [[`${ORGANIZATION_ID}/50000000-0000-0000-0000-000000000002.png`]]);
  }
});

test("removal clears the managed path without resurrecting a legacy logo", async () => {
  const events: string[] = [];
  const service = createStartupLogoService(repository({
    loadForProfile: async () => ({ eligible: true, organizationId: ORGANIZATION_ID, logoPath: `${ORGANIZATION_ID}/old.jpg`, legacyLogoUrl: "https://legacy.test/logo.png" }),
    replacePath: async (_organizationId, expected, next) => { events.push(`replace:${expected}:${next}`); return true; },
    remove: async (paths) => { events.push(`remove:${paths.join(",")}`); },
  }));

  assert.deepEqual(await service.remove(PROFILE_ID), { logoUrl: null });
  assert.deepEqual(events, [`replace:${ORGANIZATION_ID}/old.jpg:null`, `remove:${ORGANIZATION_ID}/old.jpg`]);
});

test("failed removal leaves the managed object untouched", async () => {
  const removed: string[][] = [];
  const service = createStartupLogoService(repository({
    loadForProfile: async () => ({ eligible: true, organizationId: ORGANIZATION_ID, logoPath: `${ORGANIZATION_ID}/old.jpg`, legacyLogoUrl: null }),
    replacePath: async () => false,
    remove: async (paths) => { removed.push(paths); },
  }));
  await assert.rejects(service.remove(PROFILE_ID), (error: unknown) => error instanceof StartupLogoError && error.status === 409);
  assert.deepEqual(removed, []);
});

test("URL resolver signs managed paths once and preserves an HTTPS legacy fallback", async () => {
  const signed: string[] = [];
  const resolver = createStartupLogoUrlResolver({
    createSignedUrl: async (path) => {
      signed.push(path);
      return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
    },
  });
  const path = `${ORGANIZATION_ID}/logo.jpg`;

  assert.equal(await resolver(path), `https://signed.test/${path}`);
  assert.equal(await resolver(path), `https://signed.test/${path}`);
  assert.equal(await resolver(null, "https://legacy.test/logo.jpg"), "https://legacy.test/logo.jpg");
  assert.equal(await resolver(null, "javascript:alert(1)"), null);
  assert.deepEqual(signed, [path]);
});

test("URL resolver preserves an HTTPS legacy fallback when signing reports an error", async () => {
  const resolver = createStartupLogoUrlResolver({
    createSignedUrl: async () => ({ data: null, error: { message: "storage unavailable" } }),
  });

  assert.equal(
    await resolver(`${ORGANIZATION_ID}/logo.jpg`, "https://legacy.test/logo.jpg"),
    "https://legacy.test/logo.jpg",
  );
});

test("URL resolver preserves an HTTPS legacy fallback when signing throws", async () => {
  const resolver = createStartupLogoUrlResolver({
    createSignedUrl: async () => { throw new Error("storage unavailable"); },
  });

  assert.equal(
    await resolver(`${ORGANIZATION_ID}/logo.jpg`, "https://legacy.test/logo.jpg"),
    "https://legacy.test/logo.jpg",
  );
});
