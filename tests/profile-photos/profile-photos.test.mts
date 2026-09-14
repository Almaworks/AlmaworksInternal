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
// A structurally valid PNG header for 10,000 x 5,001 pixels. It has no pixel payload,
// so Sharp rejects it at its decoded-pixel-limit guard without allocating a large image.
const overPixelLimitPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 39, 16, 0, 0, 19, 137,
  8, 2, 0, 0, 0, 83, 105, 51, 186, 0, 0, 0, 0, 73, 68, 65, 84, 53, 175, 6, 30, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
]);

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

test("shared image processor accepts JPEG and WebP inputs", async () => {
  const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).jpeg().toBuffer();
  const webp = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).webp().toBuffer();

  const processedJpeg = await processProfileImage(new File([jpeg], "portrait.jpg", { type: "image/jpeg" }), "Profile photos");
  const processedWebp = await processProfileImage(new File([webp], "portrait.webp", { type: "image/webp" }), "Profile photos");

  assert.equal(processedJpeg.extension, "jpg");
  assert.equal(processedJpeg.file.type, "image/jpeg");
  assert.equal(processedWebp.extension, "webp");
  assert.equal(processedWebp.file.type, "image/webp");
});

test("shared image processor does not enlarge sub-1024 images", async () => {
  const source = await sharp({ create: { width: 320, height: 180, channels: 3, background: "white" } }).png().toBuffer();
  const processed = await processProfileImage(png(source), "Profile photos");
  const metadata = await sharp(Buffer.from(await processed.file.arrayBuffer())).metadata();

  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 180);
});

test("shared image processor rejects PNG headers above the decoded pixel limit", async () => {
  const oversizedDimensions = new File([overPixelLimitPng], "too-many-pixels.png", { type: "image/png" });

  await assert.rejects(
    processProfileImage(oversizedDimensions, "Profile photos"),
    (error: unknown) => error instanceof Error && error.message === "The selected file is not a valid image.",
  );
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
