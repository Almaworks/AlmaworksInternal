export const LEGACY_CONVERSION_ISSUE = "converted_mentor_unresolved" as const;

export interface LegacyMentorCandidate {
  id: string;
  userId: string | null;
}

export interface LegacyMentorConversionResolution {
  convertedMentorProfileId: string | null;
  issueCodes: readonly (typeof LEGACY_CONVERSION_ISSUE)[];
}

export function resolveLegacyMentorConversion(
  legacyMentorId: string | null,
  mentors: readonly LegacyMentorCandidate[],
  mentorProfileIds: ReadonlySet<string>,
): LegacyMentorConversionResolution {
  if (legacyMentorId === null) {
    return { convertedMentorProfileId: null, issueCodes: [] };
  }

  const profileId = mentors.find((mentor) => mentor.id === legacyMentorId)?.userId ?? null;
  if (profileId === null || !mentorProfileIds.has(profileId)) {
    return {
      convertedMentorProfileId: null,
      issueCodes: [LEGACY_CONVERSION_ISSUE],
    };
  }

  return { convertedMentorProfileId: profileId, issueCodes: [] };
}
