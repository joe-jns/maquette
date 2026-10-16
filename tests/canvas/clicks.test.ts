import { describe, it, expect } from 'vitest'
import { createClickTracker } from '../../src/renderer/canvas/clicks'

describe('double-clic maison', () => {
  it('deux clics rapprochés = 2, puis la séquence repart', () => {
    const t = createClickTracker()
    expect(t.track(0, 0, 0)).toBe(1)
    expect(t.track(200, 2, 2)).toBe(2)
    expect(t.track(300, 2, 2)).toBe(1)
  })
  it('trop lent ou trop loin = 1', () => {
    const t = createClickTracker()
    expect(t.track(0, 0, 0)).toBe(1)
    expect(t.track(400, 0, 0)).toBe(1)
    expect(t.track(500, 10, 0)).toBe(1)
  })
})
