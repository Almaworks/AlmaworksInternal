type SemesterOption = { id: string; is_active: boolean };

export type BookingDeepLinkSelection = { semesterId: string | null; requestId: string | null; error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function selectBookingDeepLink(semesters: readonly SemesterOption[], requestedSemesterId: string | null, requestedBookingId: string | null): BookingDeepLinkSelection {
  if (requestedSemesterId && !semesters.some((semester) => semester.id === requestedSemesterId && semester.is_active)) {
    return { semesterId: null, requestId: null, error: 'This booking is not available in your semesters.' };
  }
  if (requestedBookingId && !UUID.test(requestedBookingId)) {
    return { semesterId: null, requestId: null, error: 'This booking link is invalid.' };
  }
  return {
    semesterId: requestedSemesterId ?? semesters.find((semester) => semester.is_active)?.id ?? null,
    requestId: requestedBookingId,
    error: null,
  };
}
