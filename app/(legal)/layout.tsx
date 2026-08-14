import Image from 'next/image'
import Link from 'next/link'
import { LegalBackButton } from '@/components/legal/back-button'

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        {/* Three equal columns so the logo is genuinely centred — a fixed-width
            spacer never matched the width of the Back button. */}
        <div className="max-w-3xl mx-auto px-6 h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="justify-self-start">
            <LegalBackButton />
          </div>
          <Link href="/" className="justify-self-center">
            {/* Intrinsic size is the file's real 457x283; height drives the
                render so the aspect ratio is preserved and it can't overflow
                the header the way a fixed 120x40 box did. */}
            <Image
              src="/logo-dark_blue-full.png"
              alt="Mini Manager"
              width={457}
              height={283}
              priority
              className="h-9 w-auto object-contain"
            />
          </Link>
          <div aria-hidden />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-card border border-border rounded-xl px-8 py-10 shadow-sm">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-6 pb-10 flex justify-center gap-6">
        <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Terms of Service
        </Link>
        <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Privacy Policy
        </Link>
        <Link href="/refunds" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Refund Policy
        </Link>
        <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Sign in
        </Link>
      </footer>
    </div>
  )
}
