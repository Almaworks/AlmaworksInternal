import assert from "node:assert/strict";
import test from "node:test";

import { readStartupLogoUpload, StartupLogoUploadRequestError } from "../../src/startup-logos/upload-request.ts";

function request(form: FormData, headers?: HeadersInit): Request {
  return new Request("https://example.test/api/startup-logo", { method: "POST", body: form, headers });
}

test("accepts exactly one file field", async () => {
  const form = new FormData();
  form.set("file", new File(["image"], "logo.png", { type: "image/png" }));
  assert.equal((await readStartupLogoUpload(request(form))).name, "logo.png");
});

test("rejects missing, repeated, and extra fields", async () => {
  const missing = new FormData();
  await assert.rejects(readStartupLogoUpload(request(missing)), StartupLogoUploadRequestError);
  const repeated = new FormData();
  repeated.append("file", new File(["1"], "a.png"));
  repeated.append("file", new File(["2"], "b.png"));
  await assert.rejects(readStartupLogoUpload(request(repeated)), StartupLogoUploadRequestError);
  const extra = new FormData();
  extra.set("file", new File(["1"], "a.png"));
  extra.set("organizationId", "untrusted");
  await assert.rejects(readStartupLogoUpload(request(extra)), StartupLogoUploadRequestError);
});

test("rejects nonmultipart and an oversized declared body", async () => {
  const nonmultipart = new Request("https://example.test/api/startup-logo", { method: "POST", body: "text" });
  await assert.rejects(readStartupLogoUpload(nonmultipart), StartupLogoUploadRequestError);
  const form = new FormData();
  form.set("file", new File(["1"], "a.png"));
  await assert.rejects(readStartupLogoUpload(request(form, { "content-length": String(5 * 1024 * 1024) })), StartupLogoUploadRequestError);
});
