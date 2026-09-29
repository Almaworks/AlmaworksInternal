import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service | Almaworks Internal',
  description: 'Terms for using the Almaworks Internal mentorship and program administration platform.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <section>
        <h2>1. Using Almaworks Internal</h2>
        <p>These terms govern your use of Almaworks Internal, operated by the Almaworks program team (&ldquo;Almaworks,&rdquo; &ldquo;we,&rdquo; or &ldquo;us&rdquo;). By using the platform, you agree to these terms. If you do not agree, do not use the platform. Questions may be sent to <a href="mailto:almaworkscu@gmail.com">almaworkscu@gmail.com</a>.</p>
        <p>The platform supports mentorship, startup profiles, scheduling, outreach, and program administration. These terms do not replace a separate program participation agreement or create a contract on behalf of Columbia University. Our <Link href="/privacy">Privacy Policy</Link> describes how we handle information.</p>
      </section>
      <section>
        <h2>2. Accounts and access</h2>
        <p>Provide accurate information, use only accounts you are authorized to access, protect your credentials, and notify us of suspected account misuse. You must have authority to provide information or act on behalf of a startup or organization. Registration does not guarantee approval, a particular role, admission to a program, or continued access.</p>
        <p>Access depends on administrator approval, role, cohort, and account status. We may restrict or suspend access to protect the service, address misuse, comply with law, or reflect program eligibility. You may contact us to question a restriction or request account closure.</p>
      </section>
      <section>
        <h2>3. Acceptable use</h2>
        <ul>
          <li>Use the platform for authorized Almaworks activities. Treat participants respectfully and keep shared information accurate.</li>
          <li>Do not impersonate others, harass people, send spam or deceptive outreach, upload malicious material, or infringe privacy or intellectual-property rights.</li>
          <li>Do not bypass access controls, access another person&apos;s private records, share credentials, scrape participant information without authorization, or interfere with service operation.</li>
          <li>Do not upload information you lack permission to share. Avoid unnecessary sensitive personal information and confidential business material.</li>
        </ul>
      </section>
      <section>
        <h2>4. Your content and communications</h2>
        <p>You retain your rights in the material you provide. You give Almaworks permission to host, store, process, and display that material only as needed to operate the platform and provide authorized program functions, consistent with the Privacy Policy. This includes sharing appropriate profile and meeting information with program participants and administrators.</p>
        <p>You are responsible for the accuracy and lawfulness of your submissions and messages. Administrators must have an appropriate basis to contact recipients, honor opt-out requests, and review recipients and content before sending outreach. Connecting Gmail permits the platform to send authorized messages from the connected account; it does not authorize unrelated use of that account.</p>
        <p>Access to someone&apos;s profile or startup information does not grant ownership or permission to publish it elsewhere. Separate confidentiality obligations remain your responsibility.</p>
      </section>
      <section>
        <h2>5. Meetings and third-party services</h2>
        <p>A meeting request is not a confirmed appointment until the relevant workflow confirms it. Keep availability current, review meeting details, and communicate cancellations promptly. Calendar synchronization and email delivery can be delayed or fail; check the platform and your calendar when timing matters.</p>
        <p>Google, our infrastructure and email providers, and linked websites operate under their own terms. You control whether to authorize optional connections and can revoke access. Revocation may limit features and does not recall already sent messages. We do not guarantee the availability or behavior of third-party services.</p>
      </section>
      <section>
        <h2>6. Mentorship and service limitations</h2>
        <p>Mentorship and program information are provided for general educational and networking purposes. They do not guarantee funding, business results, introductions, or admission. Participants&apos; views are their own. Obtain qualified advice before relying on information for legal, financial, tax, medical, or other professional decisions.</p>
        <p>We work to keep the platform useful and reliable, but provide it on an &ldquo;as available&rdquo; basis. To the extent permitted by applicable law, we do not warrant uninterrupted or error-free operation, or that the platform will meet every user&apos;s needs. Nothing in these terms excludes rights, remedies, or liability that applicable law does not permit us to exclude.</p>
      </section>
      <section>
        <h2>7. Ending access and changes</h2>
        <p>You may stop using the platform at any time and contact us to request account closure or deletion. Suspension or closure does not automatically delete all records; retention and deletion are described in the Privacy Policy. Responsibilities concerning prior communications, others&apos; rights, and misuse continue where relevant after access ends.</p>
        <p>We may update features and these terms. We will post the revised terms with an updated effective date and provide appropriate notice of material changes. Changes will not retroactively alter rights where prohibited by law; any required consent will be requested. Contact us before continuing if you have questions about a change.</p>
      </section>
    </LegalPage>
  )
}
