import { redirect } from 'next/navigation'

// Previously sent setup URLs remain usable. Verification begins with a fresh
// code from normal sign-in instead of relying on the original invitation.
export default function ActivatePage() {
  redirect('/')
}
