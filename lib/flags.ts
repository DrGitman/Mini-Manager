/**
 * Feature flags.
 *
 * The Strands agent is built behind a flag so the old route keeps serving the
 * app while the new one is proven a piece at a time. Nothing here should stay
 * for long — a flag that outlives its migration becomes a second code path
 * nobody tests.
 */

/**
 * Route the assistant panel through the Strands agent on /agent/v2.
 *
 * **On by default.** The Strands agent is the product now — it streams its tool
 * calls, escalates rather than guessing, and is what the app is for. Requiring
 * anyone to open a console to see that would be absurd.
 *
 * The escape hatch runs the other way: set NEXT_PUBLIC_AGENT_V2=0, or
 * localStorage.setItem('mm.flag.agentV2', '0'), to fall back to the older
 * single-shot route while the two paths still coexist.
 */
export function useStrandsAgent(): boolean {
  if (process.env.NEXT_PUBLIC_AGENT_V2 === '0') return false
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem('mm.flag.agentV2') !== '0'
  } catch {
    return true
  }
}
