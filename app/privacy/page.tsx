import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy | Almaworks Internal',
  description: 'How Almaworks Internal handles account, mentorship, scheduling, and connected Google account data.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <section>
        <h2>1. About this policy</h2>
        <p>The Almaworks program team (&ldquo;Almaworks,&rdquo; &ldquo;we,&rdquo; or &ldquo;us&rdquo;) operates Almaworks Internal, a platform for program administration, mentorship, startup profiles, scheduling, and outreach. This policy explains how we handle information in this platform. It does not cover unrelated university websites or the independent practices of external services.</p>
        <p>Questions or privacy requests: <a href="mailto:almaworkscu@gmail.com">almaworkscu@gmail.com</a>.</p>
      </section>
      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li><strong>Account and profile information:</strong> name, email address, authentication identifiers, role and cohort membership, onboarding responses, profile photo, contact information, professional background, expertise, and startup information you or an authorized administrator provide.</li>
          <li><strong>Program activity:</strong> availability, booking requests, meeting topics and logistics, participation and attendance records, feedback, program assignments, and administrative notes.</li>
          <li><strong>Outreach information:</strong> professional contact details, organizations, recruiting categories, pipeline stages, ownership, notes, email drafts, sent messages, and delivery records supplied by authorized administrators.</li>
          <li><strong>Technical information:</strong> authentication/session cookies, security and operational logs, request information such as IP address and browser details processed by our hosting providers, and integration status or errors needed to operate and protect the service.</li>
        </ul>
        <p>Passwords are handled by our authentication provider. Connecting Google uses Google authorization; Almaworks does not ask for your Google password.</p>
      </section>
      <section>
        <h2>3. Google account connections</h2>
        <p><strong>Google sign-in:</strong> we receive basic identity information, such as your Google account identifier, email address, name, and profile information made available during sign-in, to authenticate and link your Almaworks account.</p>
        <p><strong>Google Calendar:</strong> when you connect Calendar, we access your connected account identity and calendar free/busy intervals to avoid scheduling conflicts. We also create, check, update, or remove Almaworks mentorship holds on the connected calendar. We store connection identifiers, encrypted authorization tokens, busy intervals, sync status, and identifiers for the events we manage. Our availability synchronization uses busy times, rather than importing the titles or descriptions of unrelated personal events. Other program users may see whether time is available, not the details of your personal calendar events.</p>
        <p><strong>Gmail for administrators:</strong> when an administrator connects Gmail, we use send permission to submit outreach messages the administrator chooses to send. We retain the sender and recipient, subject and message content composed in Almaworks, send status, and returned Gmail message and thread identifiers. The current integration does not request inbox-reading permission or automatically import incoming replies. Sending shares the message and sender identity with its recipients and Google.</p>
        <p>We use Google data only to provide and improve these user-facing functions, protect the service, and meet applicable obligations. We do not sell Google user data, use it for advertising, or use it to train generalized artificial intelligence or machine-learning models. We do not use connected Gmail or Calendar data to generate AI summaries or drafts in the current implementation.</p>
        <p>Almaworks Internal&apos;s use and transfer of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements. Human access to Google user data is limited to the access you authorize for the feature, your specific consent where required, security investigations, legal requirements, or other uses permitted by that policy.</p>
      </section>
      <section>
        <h2>4. How we use and share information</h2>
        <p>We use information to manage access, provide profiles and directories, coordinate mentorship and program activities, send operational messages and outreach, troubleshoot problems, and prevent misuse.</p>
        <p>Authorized program administrators can access information needed to administer the program. Mentors and startups can see relevant directory/profile information and information for meetings or teams in which they participate, according to their access permissions. Do not put confidential trade secrets or unnecessary sensitive information in profiles or meeting notes.</p>
        <p>Service providers process information needed for their functions: Supabase for authentication, database and file storage; Vercel for hosting; Google for connected account services; and Sequenzy or Resend for email features where configured. These providers may process data outside your country. Information you send to recipients or external forms is also subject to those recipients&apos; or services&apos; practices.</p>
        <p>We do not sell personal information or share it for targeted advertising. We may disclose information where reasonably necessary to comply with law, protect people or the service, investigate abuse, or follow your instructions. Google data remains subject to the additional restrictions above.</p>
      </section>
      <section>
        <h2>5. Cookies and security</h2>
        <p>We use cookies and browser storage for sign-in, session continuity, and related application functions. Blocking them may prevent login. The platform does not use advertising cookies.</p>
        <p>We use role-based access controls, protected network connections, and encrypted stored Google authorization tokens. Access is restricted according to program responsibilities. No online service or security measure can guarantee absolute protection.</p>
      </section>
      <section>
        <h2>6. Retention, disconnection, and deletion</h2>
        <p>We retain information for program operation, ongoing or alumni participation, legitimate recordkeeping, security, and applicable legal needs. Retention depends on the record and purpose; ending a cohort or suspending an account does not automatically delete its information.</p>
        <p>You can disconnect supported integrations in Almaworks and revoke Google access through your <a href="https://myaccount.google.com/connections">Google Account connections</a>. Revocation stops future authorized access, but does not by itself delete program records, messages already sent, or copies held by recipients. Calendar cleanup may require an active connection; you may need to remove remaining holds directly in Google Calendar.</p>
        <p>Contact us to request access to, correction of, or deletion of your information, or to close your account. We may verify your identity and authority before acting. Account-and-personal-data deletion can retain anonymized program history and shared startup records. Active bookings, linked records, or legal obligations may need resolution first. Backups, provider logs, and recipients&apos; copies are not necessarily removed immediately by application deletion. We will explain material limitations when handling your request.</p>
      </section>
      <section>
        <h2>7. Your choices and updates</h2>
        <p>You can edit available profile fields, choose whether to connect Google integrations, and contact us about privacy concerns or rights available under applicable law. Declining or disconnecting an integration can limit the related feature. For outreach opt-outs, reply to the sender or contact us.</p>
        <p>The platform is intended for Almaworks program participants and professional contacts, not for children under 13. If you believe a child has provided personal information, contact us.</p>
        <p>We will update this page and its effective date when our practices change. Material changes will be communicated through an appropriate in-app or email notice where required. We will obtain additional authorization where a new use of Google data requires it.</p>
      </section>
    </LegalPage>
  )
}
