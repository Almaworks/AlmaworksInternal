import { AccountAccessNotice } from '@/components/AccountAccessNotice'
export default function RejectedAccessPage() {
  return <AccountAccessNotice title="Access request declined"><p>An administrator declined this account’s access request. Contact Almaworks if you believe this was a mistake.</p><p>An administrator can restore your access using Add member. You do not need to create another account.</p></AccountAccessNotice>
}
