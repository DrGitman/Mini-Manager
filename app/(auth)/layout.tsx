'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const TESTIMONIALS = [
  {
    quote: 'Cut my Downloads folder from 1,847 files to 12 clean folders in 20 minutes. Nothing else comes close.',
    name: 'Amara K.',
    role: 'Freelance Designer, Windhoek',
  },
  {
    quote: 'The undo feature alone is worth it. I accidentally moved a whole project folder and got it back in one click.',
    name: 'Jürgen M.',
    role: 'Software Engineer, Berlin',
  },
  {
    quote: 'Finally understand my own file structure. The AI naming is scary accurate.',
    name: 'Thandiwe N.',
    role: 'Accountant, Johannesburg',
  },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [testimonialIdx, setTestimonialIdx] = useState(0)
  const [testimonialKey, setTestimonialKey] = useState(0)
  const [mounted, setMounted] = useState(false)

  // Blue panel on LEFT for signup, RIGHT for login & forgot-password
  const blueOnLeft = pathname === '/signup'

  useEffect(() => { setMounted(true) }, [])

  function changeTestimonial(next: number) {
    setTestimonialIdx(next)
    setTestimonialKey(k => k + 1)
  }

  const testimonial = TESTIMONIALS[testimonialIdx]

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">

      {/* ── BLUE PANEL — slides between left and right ── */}
      <div
        className="absolute hidden w-[calc(50%-24px)] md:flex md:flex-col rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #1a1f5e 0%, #0d1b4b 40%, #060d2e 100%)',
          top: 12,
          bottom: 12,
          left: blueOnLeft ? 12 : 'calc(50% + 12px)',
          transition: mounted ? 'left 0.6s cubic-bezier(0.77,0,0.18,1)' : 'none',
          zIndex: 10,
        }}
      >
        {/* Dot-grid texture */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Glow orbs */}
        <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10 px-10 pt-10">
          <Image
            src="/logo-white-full.png"
            alt="Mini Manager"
            width={130}
            height={44}
            className="object-contain"
            priority
          />
        </div>

        {/* Testimonial */}
        <div className="relative z-10 mt-auto px-10 pb-12">
          <div className="mb-4 text-6xl font-serif leading-none text-white/20">&ldquo;</div>

          <div key={testimonialKey} className="animate-testimonial-in">
            <p className="mb-5 text-lg font-medium leading-relaxed text-white">
              {testimonial.quote}
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{testimonial.name}</p>
                <p className="text-xs text-white/50">{testimonial.role}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => changeTestimonial((testimonialIdx - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/60 transition-colors hover:border-white/50 hover:text-white"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => changeTestimonial((testimonialIdx + 1) % TESTIMONIALS.length)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/60 transition-colors hover:border-white/50 hover:text-white"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-1.5">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => changeTestimonial(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === testimonialIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── WHITE FORM PANEL ── */}
      <div
        className="relative z-0 flex min-h-screen flex-col md:w-1/2 bg-white"
        style={{
          marginLeft: blueOnLeft ? '50%' : '0',
          transition: mounted ? 'margin-left 0.6s cubic-bezier(0.77,0,0.18,1)' : 'none',
        }}
      >
        <div key={pathname} className="animate-auth-form-in flex flex-1 items-center justify-center px-8 py-10">
          {children}
        </div>

        <div className="flex justify-center gap-4 pb-6">
          <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">Terms</Link>
          <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">Privacy</Link>
        </div>
      </div>
    </div>
  )
}
