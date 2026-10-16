/**
 * Détection maison du double-clic : un clic compte comme « 2 » s'il suit le précédent
 * de moins de `intervalMs` et à au plus `radius` px. Après un 2, la séquence repart à 1.
 */
export function createClickTracker(opts: { intervalMs: number; radius: number } = { intervalMs: 300, radius: 4 }): {
  track(time: number, x: number, y: number): 1 | 2
} {
  let last: { time: number; x: number; y: number } | null = null
  return {
    track(time, x, y) {
      if (last && time - last.time < opts.intervalMs && Math.hypot(x - last.x, y - last.y) <= opts.radius) {
        last = null
        return 2
      }
      last = { time, x, y }
      return 1
    },
  }
}
