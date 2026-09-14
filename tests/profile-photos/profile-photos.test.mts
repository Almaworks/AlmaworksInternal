import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  PROFILE_PHOTO_MAX_BYTES,
  ProfilePhotoError,
  createProfilePhotoService,
  type ProfilePhotoRepository,
} from "../../src/profile-photos/profile-photos.ts";
import { processProfileImage } from "../../src/profile-images/process-profile-image.ts";
import { createProfilePhotoUrlResolver } from "../../src/profile-photos/urls.ts";

const PROFILE_ID = "10000000-0000-0000-0000-000000000001";

const onePixelPng = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();

function png(bytes: Uint8Array = onePixelPng): File {
  return new File([Uint8Array.from(bytes).buffer], "portrait.png", { type: "image/png" });
}

function repository(overrides: Partial<ProfilePhotoRepository> = {}): ProfilePhotoRepository {
  return {
    load: async () => ({ eligible: true, photoPath: null, role: "mentor" }),
    upload: async () => undefined,
    sign: async (path) => `https://signed.test/${path}`,
    replacePath: async () => true,
    clearLegacyMentorPhoto: async () => undefined,
    remove: async () => undefined,
    ...overrides,
  };
}

test("shared image processor normalizes accepted profile images", async () => {
  const processed = await processProfileImage(png(), "Profile photos");

  assert.equal(processed.extension, "png");
  assert.equal(processed.file.type, "image/png");
});

test("uploads a validated image to a versioned owned path", async () => {
  const uploads: Array<{ path: string; contentType: string }> = [];
  const writes: Array<{ expected: string | null; next: string | null }> = [];
  const service = createProfilePhotoService(repository({
    upload: async (path, file) => { uploads.push({ path, contentType: file.type }); },
    replacePath: async (_profileId, expected, next) => { writes.push({ expected, next }); return true; },
  }), () => "20000000-0000-0000-0000-000000000002");

  const result = await service.upload(PROFILE_ID, png());

  const path = `${PROFILE_ID}/20000000-0000-0000-0000-000000000002.png`;
  assert.deepEqual(uploads, [{ path, contentType: "image/png" }]);
  assert.deepEqual(writes, [{ expected: null, next: path }]);
  assert.deepEqual(result, { photoUrl: `https://signed.test/${path}` });
});

test("rejects unsupported, empty, oversized, and spoofed image files", async () => {
  const service = createProfilePhotoService(repository());
  const invalidFiles = [
    new File([], "empty.png", { type: "image/png" }),
    new File([new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1)], "large.png", { type: "image/png" }),
    new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], "photo.gif", { type: "image/gif" }),
    new File([new TextEncoder().encode("not an image")], "spoofed.jpg", { type: "image/jpeg" }),
  ];

  for (const file of invalidFiles) {
    await assert.rejects(
      service.upload(PROFILE_ID, file),
      (error: unknown) => error instanceof ProfilePhotoError && error.status === 400,
    );
  }
});

test("fully decodes and scales large images to avatar dimensions", async () => {
  const largeImage = await sharp({ create: { width: 5000, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  let uploaded: File | null = null;
  const service = createProfilePhotoService(repository({ upload: async (_path, file) => { uploaded = file; } }));

  await service.upload(PROFILE_ID, png(largeImage));
  const uploadedFile = uploaded as File | null;
  assert.ok(uploadedFile);
  const metadata = await sharp(Buffer.from(await uploadedFile.arrayBuffer())).metadata();
  assert.ok((metadata.width ?? 0) <= 1024);
  assert.ok((metadata.height ?? 0) <= 1024);
});

test("rejects a decoded image whose real format does not match its declared MIME type", async () => {
  const service = createProfilePhotoService(repository());
  const disguised = new File([Uint8Array.from(onePixelPng).buffer], "portrait.jpg", { type: "image/jpeg" });

  await assert.rejects(service.upload(PROFILE_ID, disguised), (error: unknown) => error instanceof ProfilePhotoError && error.status === 400);
});

test("cleans up the new object and preserves the prior path after a concurrent replacement", async () => {
  const removed: string[][] = [];
  const service = createProfilePhotoService(repository({
    load: async () => ({ eligible: true, photoPath: `${PROFILE_ID}/old.jpg`, role: "startup" }),
    replacePath: async () => false,
    remove: async (paths) => { removed.push(paths); },
  }), () => "20000000-0000-0000-0000-000000000002");

  await assert.rejects(
    service.upload(PROFILE_ID, png()),
    (error: unknown) => error instanceof ProfilePhotoError && error.status === 409,
  );
  assert.deepEqual(removed, [[`${PROFILE_ID}/20000000-0000-0000-0000-000000000002.png`]]);
});

test("cleans up an uploaded object when the profile write fails", async () => {
  const removed: string[][] = [];
  const service = createProfilePhotoService(repository({
    replacePath: async () => { throw new Error("database unavailable"); },
    remove: async (paths) => { removed.push(paths); },
  }), () => "20000000-0000-0000-0000-000000000002");

  await assert.rejects(service.upload(PROFILE_ID, png()), /database unavailable/u);
  assert.deepEqual(removed, [[`${PROFILE_ID}/20000000-0000-0000-0000-000000000002.png`]]);
});

test("replacement deletes only the previously observed managed object", async () => {
  const oldPath = `${PROFILE_ID}/old.jpg`;
  const removed: string[][] = [];
  const service = createProfilePhotoService(repository({
    load: async () => ({ eligible: true, photoPath: oldPath, role: "mentor" }),
    remove: async (paths) => { removed.push(paths); },
  }), () => "20000000-0000-0000-0000-000000000002");

  await service.upload(PROFILE_ID, png());

  assert.deepEqual(removed, [[oldPath]]);
});

test("removal clears the global reference and legacy mentor photo before deleting storage", async () => {
  const oldPath = `${PROFILE_ID}/old.jpg`;
  const events: string[] = [];
  const service = createProfilePhotoService(repository({
    load: async () => ({ eligible: true, photoPath: oldPath, role: "mentor" }),
    replacePath: async (_profileId, expected, next) => { events.push(`replace:${expected}:${next}`); return true; },
    clearLegacyMentorPhoto: async () => { events.push("clear-legacy"); },
    remove: async (paths) => { events.push(`remove:${paths.join(",")}`); },
  }));

  assert.deepEqual(await service.remove(PROFILE_ID), { photoUrl: null });
  assert.deepEqual(events, ["clear-legacy", `replace:${oldPath}:null`, `remove:${oldPath}`]);
});

test("ineligible profiles cannot upload or remove photos", async () => {
  const service = createProfilePhotoService(repository({
    load: async () => ({ eligible: false, photoPath: null, role: null }),
  }));

  for (const action of [() => service.upload(PROFILE_ID, png()), () => service.remove(PROFILE_ID)]) {
    await assert.rejects(action(), (error: unknown) => error instanceof ProfilePhotoError && error.status === 403);
  }
});

test("URL resolver signs managed paths once and preserves an HTTPS legacy fallback", async () => {
  const signed: string[] = [];
  const resolver = createProfilePhotoUrlResolver({
    createSignedUrl: async (path) => {
      signed.push(path);
      return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
    },
  });
  const path = `${PROFILE_ID}/photo.jpg`;

  assert.equal(await resolver(path), `https://signed.test/${path}`);
  assert.equal(await resolver(path), `https://signed.test/${path}`);
  assert.equal(await resolver(null, "https://legacy.test/photo.jpg"), "https://legacy.test/photo.jpg");
  assert.equal(await resolver(null, "javascript:alert(1)"), null);
  assert.deepEqual(signed, [path]);
});

test("URL resolver returns null when signing throws", async () => {
  const resolver = createProfilePhotoUrlResolver({
    createSignedUrl: async () => { throw new Error("storage unavailable"); },
  });

  assert.equal(await resolver(`${PROFILE_ID}/photo.jpg`), null);
});
