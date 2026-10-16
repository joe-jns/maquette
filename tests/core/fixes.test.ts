import { describe, it, expect } from 'vitest'
import { alignTextSizing } from '../../src/core/fixes'
import type { TextNode } from '../../src/core/types'
import { text } from './helpers'

describe('alignTextSizing', () => {
  it('largeur fixe + hauteur hug → auto-height', () => {
    const t = text('t00001', { width: 300 }) as TextNode
    expect(alignTextSizing(t)).toBe(true)
    expect(t.textSizing).toBe('auto-height')
  })
  it('largeur et hauteur fixes → fixed', () => {
    const t = text('t00001', { width: 300, height: 80 }) as TextNode
    alignTextSizing(t)
    expect(t.textSizing).toBe('fixed')
  })
  it('largeur hug → auto, hauteur ramenée à hug', () => {
    const t = text('t00001', { height: 80, textSizing: 'fixed' }) as TextNode
    alignTextSizing(t)
    expect(t).toMatchObject({ textSizing: 'auto', height: { mode: 'hug' } })
  })
  it('déjà cohérent → false', () => {
    expect(alignTextSizing(text('t00001') as TextNode)).toBe(false)
  })
})
