export const metadata = {
  title: 'Privacy Policy — Mini Manager',
}

export default function PrivacyPage() {
  return (
    <article className="prose-custom">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: August 5, 2026</p>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        Mini Manager Inc. (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your
        privacy. This Privacy Policy explains what information we collect, how we use it, and the choices you
        have in connection with Mini Manager (&ldquo;the Service&rdquo;). By using the Service, you agree to the
        collection and use of information as described in this policy.
      </p>

      <Section title="1. Information We Collect">
        <h3 className="text-sm font-medium text-foreground mb-2">1.1 Account Information</h3>
        <p>
          When you create an account, we collect your name, email address, and (for paid plans) billing
          information processed by our payment provider. We do not store raw payment card details on our
          servers.
        </p>

        <h3 className="text-sm font-medium text-foreground mt-4 mb-2">1.2 File Metadata</h3>
        <p>
          To generate organization suggestions, the Service reads metadata from files on your local device.
          This includes file names, extensions, sizes, creation dates, and directory paths. This metadata may
          be transmitted to our AI inference provider (Google Gemini API) to produce suggestions.
        </p>
        <div className="mt-3 p-3 bg-primary/5 border border-primary/15 rounded-lg">
          <p className="text-sm font-medium text-foreground">Important: We never read or transmit file contents.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Only metadata (names, sizes, dates, paths) is ever sent to external services. The actual contents
            of your documents, images, videos, and other files remain entirely on your local device and are
            never accessed or uploaded by Mini Manager.
          </p>
        </div>

        <h3 className="text-sm font-medium text-foreground mt-4 mb-2">1.3 Usage Data</h3>
        <p>
          We collect information about how you interact with the Service, including features used, scan
          frequency, number of files organized, error logs, and session duration. This data is used to improve
          the Service and is not linked to individual file operations.
        </p>

        <h3 className="text-sm font-medium text-foreground mt-4 mb-2">1.4 Device and Technical Data</h3>
        <p>
          We may collect your operating system type and version, app version, IP address (for security and
          abuse prevention), and crash reports. This information helps us diagnose issues and maintain
          compatibility.
        </p>
      </Section>

      <Section title="2. How We Use Your Information">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To provide, operate, and improve the Service.</li>
          <li>To generate AI-powered file organization suggestions using metadata you choose to analyze.</li>
          <li>To process payments and manage your subscription.</li>
          <li>To send transactional emails (account confirmation, password reset, billing receipts).</li>
          <li>
            To send product updates and feature announcements. You may opt out of these at any time from
            account settings.
          </li>
          <li>To detect, prevent, and respond to fraud, abuse, or security incidents.</li>
          <li>To comply with legal obligations.</li>
        </ul>
        <p className="mt-3">
          We do not sell your personal information to third parties. We do not use your file metadata for
          advertising or share it with data brokers.
        </p>
      </Section>

      <Section title="3. AI and Third-Party Inference Services">
        <p>
          Mini Manager uses the Google Gemini API to analyze file metadata and generate organization
          suggestions. When you initiate an AI scan:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5">
          <li>File names, paths, sizes, and dates from your selected folder are sent to the Gemini API.</li>
          <li>Google processes this metadata to return categorization and naming suggestions.</li>
          <li>
            Google&apos;s use of data submitted through API calls is governed by the{' '}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Gemini API Terms of Service
            </a>
            . Google does not use API data to train its models.
          </li>
          <li>We retain the suggestions returned by the API in our database linked to your account.</li>
        </ul>
      </Section>

      <Section title="4. Data Storage and Retention">
        <p>
          Account information and scan history are stored in Google Firestore (Firebase), hosted in the United
          States. Data is encrypted at rest and in transit using industry-standard protocols.
        </p>
        <p className="mt-3">
          We retain your account data for as long as your account is active. If you delete your account, we
          will delete your personal information within 30 days, except where retention is required for legal
          compliance, dispute resolution, or enforcement of our agreements.
        </p>
        <p className="mt-3">
          Anonymized and aggregated usage statistics may be retained indefinitely for product analytics and do
          not contain information that identifies you.
        </p>
      </Section>

      <Section title="5. Data Sharing and Disclosure">
        <p>We may share your information only in the following limited circumstances:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5">
          <li>
            <span className="font-medium text-foreground">Service providers:</span> Third parties that help us
            operate the Service (e.g., cloud hosting, payment processing, email delivery, analytics). These
            providers are contractually prohibited from using your data for any purpose other than providing
            services to us.
          </li>
          <li>
            <span className="font-medium text-foreground">Legal requirements:</span> If required by law,
            subpoena, or other legal process, or if we believe disclosure is necessary to protect our rights,
            prevent fraud, or respond to a government request.
          </li>
          <li>
            <span className="font-medium text-foreground">Business transfers:</span> In connection with a
            merger, acquisition, or sale of assets, your information may be transferred. We will notify you
            before your data is subject to a different privacy policy.
          </li>
          <li>
            <span className="font-medium text-foreground">With your consent:</span> In any other circumstances
            with your explicit consent.
          </li>
        </ul>
      </Section>

      <Section title="6. Your Rights and Choices">
        <p>Depending on your jurisdiction, you may have the following rights regarding your personal data:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5">
          <li>
            <span className="font-medium text-foreground">Access:</span> Request a copy of the personal data
            we hold about you.
          </li>
          <li>
            <span className="font-medium text-foreground">Correction:</span> Ask us to correct inaccurate or
            incomplete data.
          </li>
          <li>
            <span className="font-medium text-foreground">Deletion:</span> Request deletion of your account
            and associated personal data.
          </li>
          <li>
            <span className="font-medium text-foreground">Portability:</span> Receive your data in a
            structured, machine-readable format.
          </li>
          <li>
            <span className="font-medium text-foreground">Opt-out of marketing:</span> Unsubscribe from
            non-transactional emails at any time using the link in any email or from account settings.
          </li>
          <li>
            <span className="font-medium text-foreground">Restriction:</span> Ask us to limit the processing
            of your data in certain circumstances.
          </li>
        </ul>
        <p className="mt-3">
          To exercise these rights, contact us at{' '}
          <a href="mailto:privacy@minimanager.app" className="text-primary hover:underline">
            privacy@minimanager.app
          </a>
          . We will respond within 30 days. We may ask you to verify your identity before processing your
          request.
        </p>
      </Section>

      <Section title="7. Cookies and Local Storage">
        <p>
          Mini Manager uses browser local storage to maintain your session and preferences on the device. We
          do not use third-party advertising cookies. We may use first-party analytics cookies to understand
          aggregate usage patterns. You can clear local storage at any time through your browser settings,
          which will sign you out of the Service.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          We implement industry-standard security measures including TLS encryption for data in transit,
          encryption at rest for data stored in Firestore, access controls limiting employee access to
          production data, and regular security reviews. No method of transmission or storage is 100% secure.
          If you discover a vulnerability, please report it responsibly to{' '}
          <a href="mailto:security@minimanager.app" className="text-primary hover:underline">
            security@minimanager.app
          </a>
          .
        </p>
      </Section>

      <Section title="9. Children's Privacy">
        <p>
          The Service is not directed to children under 13. We do not knowingly collect personal information
          from children under 13. If we become aware that we have collected such information, we will delete
          it promptly. If you believe we may have collected information from a child under 13, please contact
          us at privacy@minimanager.app.
        </p>
      </Section>

      <Section title="10. International Data Transfers">
        <p>
          Mini Manager is based in the United States. If you access the Service from outside the US, your
          information may be transferred to and processed in the US, where data protection laws may differ
          from those in your country. By using the Service, you consent to this transfer. For users in the
          European Economic Area, we rely on Standard Contractual Clauses as the legal mechanism for
          international transfers.
        </p>
      </Section>

      <Section title="11. Changes to This Policy">
        <p>
          We may update this Privacy Policy periodically. When we make material changes, we will notify you by
          email or through an in-app notice at least 14 days before the changes take effect. The &ldquo;Last
          updated&rdquo; date at the top of this page reflects the most recent revision. We encourage you to
          review this policy regularly.
        </p>
      </Section>

      <Section title="12. Contact Us">
        <p>
          If you have questions, concerns, or requests regarding this Privacy Policy or our data practices,
          please contact our Privacy Team:
        </p>
        <address className="not-italic mt-3 text-sm text-muted-foreground space-y-0.5">
          <p>Mini Manager Inc.</p>
          <p>Attn: Privacy Team</p>
          <p>123 Market Street, Suite 400</p>
          <p>Wilmington, DE 19801</p>
          <p>
            <a href="mailto:privacy@minimanager.app" className="text-primary hover:underline">
              privacy@minimanager.app
            </a>
          </p>
        </address>
      </Section>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-foreground mb-3">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  )
}
