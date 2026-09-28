export async function saveRegistrationPreference(
  auth: { updateUser(input: { data: { requested_role: 'mentor' | 'startup' } }): Promise<{ error: { message: string } | null }> },
  preference: string,
): Promise<{ ok: boolean; error?: string }> {
  if (preference !== 'mentor' && preference !== 'startup') return { ok: false, error: 'Choose mentor or startup.' };
  try {
    const { error } = await auth.updateUser({ data: { requested_role: preference } });
    return error ? { ok: false, error: 'Your preference could not be saved. Please try again.' } : { ok: true };
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' };
  }
}
