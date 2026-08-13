/** @type {import('next').NextConfig} */

// Content-Security-Policy for the frontend
// - 'unsafe-inline' and 'unsafe-eval' are required by Next.js dev/Turbopack
// - Tighten these for production (remove unsafe-eval, use nonces)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com",
  "style-src 'self' 'unsafe-inline' https://sandbox-cdn.paddle.com https://cdn.paddle.com",
  "img-src 'self' data: blob: https://*.paddle.com",
  "font-src 'self'",
  "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 https://*.neon.tech https://*.paddle.com",
  "frame-src https://sandbox-buy.paddle.com https://buy.paddle.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  // Block clickjacking
  { key: 'X-Frame-Options',          value: 'DENY' },
  // Legacy XSS filter (belt-and-suspenders; CSP is primary)
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  // Don't send full URL as referrer to external sites
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  // Restrict browser features
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  // Force HTTPS for 1 year (only active over HTTPS)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  // Content Security Policy
  { key: 'Content-Security-Policy',  value: CSP },
]

const nextConfig = {
  allowedDevOrigins: ['fca2-197-234-87-243.ngrok-free.app'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://127.0.0.1:8000/api/v1/:path*',
      },
    ]
  },
}

export default nextConfig
