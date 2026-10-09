import { startConfiguredEmailSignIn } from '@/src/auth/sign-in-server';
import { handleEmailSignInStart } from '@/src/auth/sign-in-http';

export async function POST(request: Request) {
  return handleEmailSignInStart(request, startConfiguredEmailSignIn);
}
