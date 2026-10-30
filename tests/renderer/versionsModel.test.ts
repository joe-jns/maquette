import { describe, it, expect } from 'vitest'
import { defaultVersionName, versionAge } from '../../src/renderer/panels/versionsModel'

describe('fenêtre des versions', () => {
  const now = new Date(2026, 9, 31, 14, 5).getTime()

  it('âge d’une version, en anglais', () => {
    expect(versionAge(now - 10_000, now)).toBe('Just now')
    expect(versionAge(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(versionAge(now - 2 * 3_600_000, now)).toBe('2 hours ago')
    expect(versionAge(new Date(2026, 9, 30, 9, 0).getTime(), now)).toBe('Yesterday')
    expect(versionAge(new Date(2026, 9, 3, 9, 0).getTime(), now)).toBe('October 3')
  })

  it('nom proposé : date et heure locales', () => {
    expect(defaultVersionName(now)).toBe('Version Oct 31, 14:05')
  })
})
