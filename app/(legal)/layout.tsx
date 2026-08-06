import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={15} />
            Back
          </Link>
          <Link href="/">
            <Image src="/logo-blue-full.png" alt="Mini Manager" width={120} height={40} className="object-contain" />
          </Link>
          {/* Spacer to balance the back button */}
          <div className="w-12" />
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
        <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Sign in
        </Link>
      </footer>
    </div>
  )
}
