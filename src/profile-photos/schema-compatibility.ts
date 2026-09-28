export type ProfilePhotoQueryError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

export type ProfilePhotoQueryResult<T> = {
  data: T;
  error: ProfilePhotoQueryError | null;
};

function isMissingProfilesPhotoPath(error: ProfilePhotoQueryError | null): boolean {
  if (!error) return false;
  const message = error.message.trim();
  if (error.code === "42703") {
    return /^column profiles(?:_\d+)?\.photo_path does not exist$/iu.test(message);
  }
  if (error.code === "PGRST204") {
    return /^Could not find the 'photo_path' column of 'profiles' in the schema cache$/iu.test(message);
  }
  return false;
}

export async function selectWithOptionalProfilePhotoPath<TWithPhoto, TWithoutPhoto>(
  withPhotoPath: () => PromiseLike<ProfilePhotoQueryResult<TWithPhoto>>,
  withoutPhotoPath: () => PromiseLike<ProfilePhotoQueryResult<TWithoutPhoto>>,
): Promise<ProfilePhotoQueryResult<TWithPhoto | TWithoutPhoto>> {
  const result = await withPhotoPath();
  if (!isMissingProfilesPhotoPath(result.error)) return result;
  return await withoutPhotoPath();
}
