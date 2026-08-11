import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: {
    default: 'Mini Manager: AI File Organizer',
    template: '%s · Mini Manager',
  },
  description:
    'Organize messy folders in minutes. Mini Manager scans your files, proposes clean names and folders with AI, and never touches anything without your approval.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/logo-blue-icon.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/logo-white-icon.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/logo-blue-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`bg-background ${inter.variable}`}>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
