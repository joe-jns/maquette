import { describe, it, expect } from 'vitest'
import { relativeDate } from '../../src/renderer/chat/dates'

describe('dates du menu des conversations', () => {
  const now = new Date(2026, 9, 18, 15, 30).getTime()
  it('aujourd’hui, hier, puis jour et mois (année si ce n’est pas celle-ci)', () => {
    expect(relativeDate(new Date(2026, 9, 18, 14, 5).getTime(), now)).toBe('Today 14:05')
    expect(relativeDate(new Date(2026, 9, 18, 0, 0).getTime(), now)).toBe('Today 00:00')
    expect(relativeDate(new Date(2026, 9, 17, 18, 42).getTime(), now)).toBe('Yesterday 18:42')
    expect(relativeDate(new Date(2026, 9, 12, 9, 0).getTime(), now)).toBe('Oct 12')
    expect(relativeDate(new Date(2026, 1, 3).getTime(), now)).toBe('Feb 3')
    expect(relativeDate(new Date(2025, 7, 1).getTime(), now)).toBe('Aug 1, 2025')
  })
  it('hier au passage d’un mois ou d’une année', () => {
    expect(relativeDate(new Date(2025, 11, 31, 23, 59).getTime(), new Date(2026, 0, 1, 8).getTime())).toBe('Yesterday 23:59')
  })
})
