/**
 * Single source of truth for the contact address shown anywhere in the app.
 *
 * Previously every page hardcoded an @minimanager.app address — a domain we
 * don't own, so all of it bounced. That matters beyond etiquette: the Privacy
 * Policy tells users to write here to exercise data rights, and Paddle checks
 * these pages during domain approval.
 *
 * Override with NEXT_PUBLIC_SUPPORT_EMAIL. Swap this one value for a real
 * support@ address once the domain is set up.
 */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'orilionaobeb+minimanager@gmail.com'

/** `mailto:` link with a pre-filled subject, so replies can be filtered. */
export function mailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
