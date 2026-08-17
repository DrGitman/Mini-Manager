/**
 * Customer reviews, in one place so the auth panel, upgrade page and any future
 * surface stay in sync.
 *
 * ⚠️  REPLACE BEFORE LAUNCH — these are illustrative placeholders, not real
 * customers. Publishing invented reviews is a claim about real people, so swap
 * them for genuine quotes (with permission) or cut the section entirely.
 * Set `verified: true` only for quotes from a real, consenting user.
 */

export interface Review {
  id: string
  quote: string
  name: string
  role: string
  /** False = placeholder. Filter on this to hide unverified quotes publicly. */
  verified: boolean
}

export const REVIEWS: Review[] = [
  {
    id: 'r1',
    quote:
      'Cut my Downloads folder from 1,847 files to 12 clean folders in 20 minutes. Nothing else comes close.',
    name: 'Amara K.',
    role: 'Freelance Designer, Windhoek',
    verified: false,
  },
  {
    id: 'r2',
    quote:
      'The undo feature alone is worth it. I accidentally moved a whole project folder and got it back in one click.',
    name: 'Jürgen M.',
    role: 'Software Engineer, Berlin',
    verified: false,
  },
  {
    id: 'r3',
    quote: 'Finally understand my own file structure. The AI naming is scary accurate.',
    name: 'Thandiwe N.',
    role: 'Accountant, Johannesburg',
    verified: false,
  },
]

/** Only quotes cleared for public display. */
export const VERIFIED_REVIEWS = REVIEWS.filter(r => r.verified)
