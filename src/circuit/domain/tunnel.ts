/** A covered stretch of the lap, in metres from the start line. */
export interface TunnelSpan {
  from: number;
  to: number;
}

/** Cross-section shared by the physical walls and the tunnel model. */
export const TUNNEL = {
  /** Barrier distance from the centreline while inside. */
  wallOffset: 13.5,
  /** Inner half-width and height of the arch, just outside the barrier. */
  archHalfWidth: 14.6,
  archHeight: 9,
  /** Distance over which the barriers funnel in before a portal. */
  funnel: 40,
} as const;

/** Distance from `dist` to the nearest tunnel (0 inside one). */
export function distanceToTunnel(tunnels: readonly TunnelSpan[], dist: number): number {
  let best = Infinity;
  for (const t of tunnels) best = Math.min(best, dist < t.from ? t.from - dist : dist > t.to ? dist - t.to : 0);
  return best;
}
