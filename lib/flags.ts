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
 * Off by default. Turn it on with NEXT_PUBLIC_AGENT_V2=1, or from the browser
 * console with localStorage.setItem('mm.flag.agentV2', '1') — which is how to
 * demo it without a rebuild, since NEXT_PUBLIC_* values are baked in at build
 * time.
 */
export function useStrandsAgent(): boolean {
  if (process.env.NEXT_PUBLIC_AGENT_V2 === '1') return true
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem('mm.flag.agentV2') === '1'
  } catch {
    return false
  }
}
