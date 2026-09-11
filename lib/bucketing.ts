import type { ConfidenceBucket } from '@/lib/types'

/**
 * Which pile a proposed change belongs in.
 *
 * Extracted from the Organize screen so the rule can be tested on its own. It
 * was four inline ternaries, and the bug it hid was not obvious by reading it:
 * bucketing on confidence alone put `passport_scan.jpg` — classified `identity`
 * at 0.99 confidence — into `auto`, which is the set the screen pre-ticks for
 * Apply. It was highlighted amber and counted as sensitive, and still selected
 * by default.
 *
 * **Sensitivity outranks confidence.** This mirrors `propose_changes` on the
 * server, which routes anything private to `escalate` regardless of score. A
 * correct guess about someone's passport is still their decision to make.
 *
 * Deliberately pure and dependency-free so it can be exercised directly.
 */
export function bucketFor(
  confidence: number,
  sensitivity: string | null | undefined,
  autoAt = 0.85,
  reviewAt = 0.7,
): ConfidenceBucket {
  if ((sensitivity ?? 'none') !== 'none') return 'input'
  if (confidence >= autoAt) return 'auto'
  if (confidence >= reviewAt) return 'review'
  return 'input'
}

/**
 * Whether a proposal may be ticked for the user before they have looked.
 *
 * Two conditions rather than one. `bucketFor` should already keep anything
 * private out of `auto`, but stating the requirement separately means a future
 * change to bucketing cannot quietly start pre-selecting a passport again —
 * the same defence-in-depth reasoning the server uses when it re-derives
 * sensitivity instead of trusting an earlier step to have set it.
 */
export function mayPreselect(
  bucket: ConfidenceBucket,
  sensitivity: string | null | undefined,
): boolean {
  return bucket === 'auto' && (sensitivity ?? 'none') === 'none'
}
