import { AccountAccessNotice } from '@/components/AccountAccessNotice'
export default function MissingMembershipPage() {
  return <AccountAccessNotice title="Program membership needs attention"><p>Your account is approved, but no available program membership is assigned to this sign-in.</p><p>Ask an administrator to check your role and cohort. You do not need another access request.</p></AccountAccessNotice>
}
