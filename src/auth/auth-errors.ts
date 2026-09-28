type AuthFailure = { code?: string; name?: string; status?: number } | null;

export function isAuthServiceUnavailable(error: AuthFailure): boolean {
  return error?.name === 'AuthRetryableFetchError' || (error?.status ?? 0) >= 500;
}

export function callbackErrorDestination(error: AuthFailure): string {
  if (isAuthServiceUnavailable(error)) return '/?error=auth_unavailable';
  return error?.code === 'otp_expired' ? '/?error=link_expired' : '/?error=signin_failed';
}
