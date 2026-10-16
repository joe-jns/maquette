import { describe, it, expect } from 'vitest'
import { normalizeColor, normalizeColorValue } from '../../src/core/color'

describe('normalizeColor', () => {
  it.each([
    ['#fff', '#FFFFFF'], ['#ffff', '#FFFFFF'], ['#FFF8', '#FFFFFF88'], ['#c2410c', '#C2410C'],
    ['#C2410C80', '#C2410C80'], ['white', '#FFFFFF'], ['RebeccaPurple', '#663399'],
    ['transparent', '#00000000'], ['rgb(194, 65, 12)', '#C2410C'], ['rgb(194 65 12)', '#C2410C'],
    ['rgba(0, 0, 0, 0.25)', '#00000040'], ['rgba(0,0,0,25%)', '#00000040'], ['rgba(255,255,255,1)', '#FFFFFF'],
  ])('%s → %s', (input, expected) => expect(normalizeColor(input)).toBe(expected))

  it.each(['', 'bleu', '#12', 'rgb(300, 0, 0)', 'rgba(0,0,0,2)', 'hsl(0, 0%, 0%)'])('%s → null', (input) =>
    expect(normalizeColor(input)).toBeNull())

  it('normalizeColorValue garde les références de style', () => {
    expect(normalizeColorValue({ style: 'c00001' })).toEqual({ style: 'c00001' })
    expect(normalizeColorValue('navy')).toBe('#000080')
    expect(normalizeColorValue(42)).toBeNull()
  })
})
