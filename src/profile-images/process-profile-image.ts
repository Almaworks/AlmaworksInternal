import sharp from "sharp";

export const PROFILE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const PROFILE_IMAGE_OUTPUT_DIMENSION = 1024;
const PROFILE_IMAGE_MAX_PIXELS = 50_000_000;

const extensionByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type ProfileImageMimeType = keyof typeof extensionByMimeType;

export class ProfileImageError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ProfileImageError";
  }
}

export async function processProfileImage(
  file: File,
  subject: "Profile photos" | "Startup logos",
): Promise<{ extension: "jpg" | "png" | "webp"; file: File }> {
  if (file.size === 0) throw new ProfileImageError("Choose a non-empty image file.");
  if (file.size > PROFILE_IMAGE_MAX_BYTES) throw new ProfileImageError(`${subject} must be 4 MiB or smaller.`);
  if (!Object.hasOwn(extensionByMimeType, file.type)) {
    throw new ProfileImageError(`${subject} must be JPEG, PNG, or WebP images.`);
  }

  const mimeType = file.type as ProfileImageMimeType;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { failOn: "error", limitInputPixels: PROFILE_IMAGE_MAX_PIXELS });
    const metadata = await image.metadata();
    const expectedFormat = mimeType === "image/jpeg" ? "jpeg" : mimeType.slice("image/".length);
    if (!metadata.width || !metadata.height || metadata.format !== expectedFormat) {
      throw new ProfileImageError("The selected file does not match its image type.");
    }
    const normalized = image.rotate().resize({
      width: PROFILE_IMAGE_OUTPUT_DIMENSION,
      height: PROFILE_IMAGE_OUTPUT_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
    const output = mimeType === "image/jpeg"
      ? await normalized.jpeg({ quality: 85, progressive: true }).toBuffer()
      : mimeType === "image/png"
        ? await normalized.png({ compressionLevel: 9 }).toBuffer()
        : await normalized.webp({ quality: 85 }).toBuffer();
    if (output.byteLength > PROFILE_IMAGE_MAX_BYTES) {
      throw new ProfileImageError(`The processed ${subject.toLowerCase()} image is larger than 4 MiB.`);
    }
    return {
      extension: extensionByMimeType[mimeType],
      file: new File([new Uint8Array(output)], file.name, { type: mimeType }),
    };
  } catch (cause) {
    if (cause instanceof ProfileImageError) throw cause;
    throw new ProfileImageError("The selected file is not a valid image.");
  }
}
