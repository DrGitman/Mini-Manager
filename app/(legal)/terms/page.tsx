export const metadata = {
  title: 'Terms of Service — Mini Manager',
}

export default function TermsPage() {
  return (
    <article className="prose-custom">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: August 5, 2026</p>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Mini Manager (&ldquo;the
        Service&rdquo;), operated by Mini Manager Inc. (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). By
        creating an account or using Mini Manager, you agree to be bound by these Terms. If you do not agree,
        do not use the Service.
      </p>

      <Section title="1. Description of Service">
        <p>
          Mini Manager is an AI-assisted file organization application that analyzes the names and metadata of
          files stored on your local device and suggests organizational actions such as renaming, moving, or
          categorizing files. The Service operates primarily on your local machine. File metadata (names, sizes,
          modification dates, and directory paths) may be transmitted to third-party AI inference services
          solely for the purpose of generating organization suggestions. File contents are never transmitted.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <p>
          You must be at least 13 years of age to use Mini Manager. If you are under 18, you represent that
          your parent or legal guardian has reviewed and agreed to these Terms on your behalf. By using the
          Service, you represent and warrant that you have the legal capacity to enter into a binding agreement.
        </p>
      </Section>

      <Section title="3. Account Registration">
        <p>
          To access certain features, you must create an account. You agree to provide accurate, current, and
          complete information during registration and to keep your account credentials confidential. You are
          solely responsible for all activity that occurs under your account. Notify us immediately at
          support@minimanager.app if you suspect unauthorized access.
        </p>
        <p className="mt-3">
          We reserve the right to suspend or terminate accounts that violate these Terms, remain inactive for
          an extended period, or are associated with fraudulent or abusive behavior.
        </p>
      </Section>

      <Section title="4. Subscription Plans and Payment">
        <p>
          Mini Manager offers a free tier with limited monthly scans and a Pro subscription with expanded
          capabilities. Subscription fees are billed in advance on a monthly or annual basis depending on the
          plan selected. All prices are in USD and are exclusive of applicable taxes.
        </p>
        <p className="mt-3">
          By providing payment information, you authorize us (or our payment processor) to charge the
          applicable fees to your payment method. Subscriptions automatically renew unless cancelled before the
          renewal date. You may cancel at any time from your account settings; cancellation takes effect at the
          end of the current billing period.
        </p>
      </Section>

      <Section title="5. Refund Policy">
        <p>
          Refunds are available within 14 days of the initial purchase of a paid subscription if you have not
          applied more than five AI-assisted organization batches. After this period, or if the usage threshold
          has been exceeded, refunds are issued at our sole discretion. Annual subscriptions are not refundable
          after the 14-day window except where required by applicable law. To request a refund, contact
          billing@minimanager.app.
        </p>
      </Section>

      <Section title="6. File Operations and No Warranty on Results">
        <p>
          Mini Manager performs file renaming and moving operations on your local file system based on AI
          suggestions that you review and approve. While we strive for accuracy, file organization is
          inherently subjective and errors may occur. You acknowledge that:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5 text-sm text-muted-foreground">
          <li>All file operations are performed at your direction and risk.</li>
          <li>
            Mini Manager maintains a local operation journal allowing you to undo recent changes, but undo
            functionality is not guaranteed to be available in all circumstances (e.g., if files have been
            further modified externally after an operation).
          </li>
          <li>
            We strongly recommend maintaining up-to-date backups of important files before running
            organization operations.
          </li>
          <li>
            We are not liable for any data loss, corruption, or unintended file movements resulting from use
            of the Service.
          </li>
        </ul>
      </Section>

      <Section title="7. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5 text-sm text-muted-foreground">
          <li>Use the Service to organize or manage files that you do not have legal rights to access.</li>
          <li>Attempt to reverse-engineer, decompile, or tamper with the Service or its AI components.</li>
          <li>Use automated means to access the Service in a way that exceeds reasonable usage.</li>
          <li>Introduce malware, spyware, or other malicious code via the Service.</li>
          <li>Resell or sublicense access to the Service without written authorization.</li>
        </ul>
      </Section>

      <Section title="8. Intellectual Property">
        <p>
          Mini Manager and all associated software, branding, UI designs, and documentation are owned by Mini
          Manager Inc. and protected by applicable intellectual property laws. These Terms do not grant you any
          ownership rights in the Service. Your files and content remain entirely your property at all times.
        </p>
      </Section>

      <Section title="9. Third-Party Services">
        <p>
          Mini Manager integrates with third-party AI inference providers (currently Google Gemini) to power
          file organization suggestions. Your use of the Service is subject to those providers&apos; terms and
          privacy policies in addition to ours. We are not responsible for the practices of third-party
          services. We select providers that commit to not training on data submitted via API calls, but you
          should review their terms independently.
        </p>
      </Section>

      <Section title="10. Privacy">
        <p>
          Our collection and use of personal information is described in our{' '}
          <a href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </a>
          , which is incorporated into these Terms by reference.
        </p>
      </Section>

      <Section title="11. Disclaimer of Warranties">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND,
          EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
        </p>
      </Section>

      <Section title="12. Limitation of Liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, MINI MANAGER INC. AND ITS OFFICERS, DIRECTORS,
          EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, LOSS OF PROFITS, OR BUSINESS INTERRUPTION, ARISING OUT OF
          OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF
          SUCH DAMAGES. OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED
          THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) $50.
        </p>
      </Section>

      <Section title="13. Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless Mini Manager Inc. and its affiliates from any
          claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees)
          arising from your use of the Service, violation of these Terms, or infringement of any third-party
          rights.
        </p>
      </Section>

      <Section title="14. Changes to Terms">
        <p>
          We may update these Terms from time to time. When we make material changes, we will notify you via
          email or an in-app notice at least 14 days before the changes take effect. Continued use of the
          Service after the effective date constitutes acceptance of the updated Terms.
        </p>
      </Section>

      <Section title="15. Governing Law and Disputes">
        <p>
          These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict
          of law provisions. Any dispute arising from these Terms or your use of the Service shall be resolved
          through binding arbitration administered by the American Arbitration Association under its Consumer
          Arbitration Rules, except that either party may seek injunctive or other equitable relief in any
          court of competent jurisdiction.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          For questions about these Terms, contact us at{' '}
          <a href="mailto:legal@minimanager.app" className="text-primary hover:underline">
            legal@minimanager.app
          </a>{' '}
          or write to: Mini Manager Inc., 123 Market Street, Suite 400, Wilmington, DE 19801.
        </p>
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
