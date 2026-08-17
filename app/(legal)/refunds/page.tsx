import { SUPPORT_EMAIL } from '@/lib/contact'

export const metadata = {
  title: 'Refund Policy — Mini Manager',
}

export default function RefundsPage() {
  return (
    <article className="prose-custom">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: August 14, 2026</p>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        This Refund Policy explains when and how you can obtain a refund for a Mini Manager
        subscription. It forms part of our{' '}
        <a href="/terms" className="underline underline-offset-2">
          Terms of Service
        </a>
        .
      </p>

      <Section title="1. 14-Day Refund Window">
        <p>
          If you are not satisfied with a paid Mini Manager subscription, you may request a full
          refund within <strong>14 days</strong> of the original charge. You do not need to give a
          reason. Refunds requested within this window are granted automatically.
        </p>
      </Section>

      <Section title="2. Renewals">
        <p>
          Subscriptions renew automatically until cancelled. The 14-day window applies to each
          individual charge, including renewals — so if a renewal charge catches you by surprise,
          you can request a refund for it within 14 days of that charge.
        </p>
        <p>
          You can cancel at any time from Settings. Cancelling stops future charges; it does not by
          itself refund a charge already taken. Request a refund as well if you want the most recent
          payment returned.
        </p>
      </Section>

      <Section title="3. After 14 Days">
        <p>
          Refunds outside the 14-day window are considered case by case, and are generally granted
          where a technical fault on our side prevented you from using the Service, or where you
          were charged in error. Contact us and explain what happened.
        </p>
      </Section>

      <Section title="4. How to Request a Refund">
        <p>
          Email <strong>{SUPPORT_EMAIL}</strong> from the address on your account, including
          the date of the charge. We aim to respond within two business days.
        </p>
        <p>
          Payments are processed by Paddle, our authorised reseller. You may also request a refund
          directly through the receipt Paddle emailed you at the time of purchase.
        </p>
      </Section>

      <Section title="5. How Refunds Are Issued">
        <p>
          Approved refunds are returned to the original payment method. Paddle typically processes
          them within 3–5 business days, though your bank may take up to 10 business days to show
          the credit. Once a refund is issued, access to paid features ends and your account returns
          to the Free plan.
        </p>
      </Section>

      <Section title="6. Your Files and Data">
        <p>
          A refund affects billing only. It does not delete your account or touch any files on your
          device. Your organisation history and undo journal remain intact on the Free plan. If you
          also want your account removed, you can delete it from your Profile page.
        </p>
      </Section>

      <Section title="7. Statutory Rights">
        <p>
          Nothing in this policy limits any refund or cancellation rights you have under the consumer
          law of your country. Where local law grants you a longer or broader right of withdrawal,
          that law applies.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          Questions about this policy: <strong>{SUPPORT_EMAIL}</strong>.
        </p>
      </Section>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-foreground mb-3">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

