/**
 * Next's `output: 'standalone'` build deliberately omits `public/` and
 * `.next/static/` — it assumes your deploy pipeline copies them in.
 *
 * The Electron app boots `.next/standalone/server.js` directly, so without this
 * step the packaged .exe serves HTML with no CSS, no JS and no images.
 *
 * Runs automatically as part of `pnpm electron:build`.
 */
import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const standalone = join(root, '.next', 'standalone')

if (!existsSync(standalone)) {
  console.error(
    '[prepare-standalone] .next/standalone missing.\n' +
      "  Is output: 'standalone' set in next.config.mjs, and did `next build` run?",
  )
  process.exit(1)
}

const copies = [
  { from: join(root, 'public'), to: join(standalone, 'public'), label: 'public/' },
  {
    from: join(root, '.next', 'static'),
    to: join(standalone, '.next', 'static'),
    label: '.next/static/',
  },
]

for (const { from, to, label } of copies) {
  if (!existsSync(from)) {
    console.error(`[prepare-standalone] missing source: ${from}`)
    process.exit(1)
  }
  cpSync(from, to, { recursive: true })
  console.log(`[prepare-standalone] copied ${label}`)
}

console.log('[prepare-standalone] standalone build is ready to package')
