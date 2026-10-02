import { PROFILE_IMAGE_MAX_BYTES } from "../profile-images/process-profile-image.ts";

export class StartupLogoUploadRequestError extends Error {
  readonly status = 400;
}

export async function readStartupLogoUpload(request: Request): Promise<File> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(?:;|$)/iu.test(contentType)) {
    throw new StartupLogoUploadRequestError("A multipart image upload is required.");
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > PROFILE_IMAGE_MAX_BYTES + 256 * 1024) {
    throw new StartupLogoUploadRequestError("Startup logos must be 4 MiB or smaller.");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new StartupLogoUploadRequestError("A multipart image upload is required.");
  }
  if ([...form.keys()].length !== 1 || !form.has("file")) {
    throw new StartupLogoUploadRequestError("Upload exactly one file field named 'file'.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new StartupLogoUploadRequestError("A file field named 'file' is required.");
  }
  return file;
}
