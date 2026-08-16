/** @type {import('next').NextConfig} */

// Where the FastAPI backend lives. Local by default; set API_URL (or
// NEXT_PUBLIC_API_URL) to the deployed backend when hosting, e.g.
// https://mini-manager-api.onrender.com
const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

// Content-Security-Policy for the frontend
// - 'unsafe-inline' and 'unsafe-eval' are required by Next.js dev/Turbopack
// - Tighten these for production (remove unsafe-eval, use nonces)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com",
  "style-src 'self' 'unsafe-inline' https://sandbox-cdn.paddle.com https://cdn.paddle.com",
  "img-src 'self' data: blob: https://*.paddle.com",
  "font-src 'self'",
  // The API origin must be listed or the browser blocks every request to it.
  // Hardcoding localhost here is what would break a hosted build.
  `connect-src 'self' ${API_URL} http://localhost:8000 http://127.0.0.1:8000 https://*.neon.tech https://*.paddle.com`,
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
  // Required by the packaged desktop app: electron/main.js boots
  // .next/standalone/server.js. Without this, that file is never produced and
  // the .exe opens with no frontend at all.
  output: 'standalone',
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
        // Proxy API calls so the browser sees them as same-origin. Driven by
        // API_URL so a hosted build points at the deployed backend instead of
        // this machine.
        source: '/api/v1/:path*',
        destination: `${API_URL}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
