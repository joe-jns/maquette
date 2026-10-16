import { describe, it, expect } from 'vitest'
import { applyOps } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode } from '../../src/core/types'
import { evalNumber, formatNumber, mixed, positionOps, setOps, sizeOps, sizingChoices } from '../../src/renderer/panels/props'
import { docWith, frame, rect, text } from '../core/helpers'

describe('saisie numérique', () => {
  it.each([
    ['24*2', 48], [' 10 + 5 ', 15], ['1,5', 1.5], ['(2+3)*4', 20], ['-8', -8], ['10/4', 2.5], ['-(2+2)', -4], ['3.25', 3.25],
  ])('%s → %s', (input, expected) => expect(evalNumber(input)).toBe(expected))

  it.each(['', 'abc', '2**3', '1/0', '2+', 'alert(1)', '1e999'])('%s → null', (input) => expect(evalNumber(input)).toBeNull())

  it('formatNumber', () => {
    expect(formatNumber(12)).toBe('12')
    expect(formatNumber(12.345)).toBe('12.35')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(-0)).toBe('0')
  })

  it('mixed', () => {
    expect(mixed([1, 1])).toBe(1)
    expect(mixed([1, 2])).toBe('mixed')
    expect(mixed([{ mode: 'hug' }, { mode: 'hug' }])).toEqual({ mode: 'hug' })
    expect(mixed([])).toBeNull()
  })
})

describe('tailles', () => {
  const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
  f.children.push(text('T1'), rect('R1'))
  const doc = docWith([f, rect('R2', { x: 500, y: 0 })])

  it('choix permis et raisons', () => {
    const top = sizingChoices(doc, 'R2', 'width')
    expect(top.fixed.ok).toBe(true)
    expect(top.hug).toMatchObject({ ok: false })
    expect(top.hug.reason).toContain('cadres en mise en page automatique')
    expect(top.fill.reason).toContain('enfants d’un cadre')
    expect(sizingChoices(doc, 'T1', 'width')).toMatchObject({ hug: { ok: true }, fill: { ok: true } })
    expect(sizingChoices(doc, 'F1', 'height')).toMatchObject({ hug: { ok: true }, fill: { ok: false } })
  })

  it('sizeOps : fixe = taille mesurée ; les éléments où le choix est impossible sont ignorés', () => {
    const ops = sizeOps(doc, ['T1', 'R2'], 'width', 'fixed', (id) => (id === 'T1' ? { x: 0, y: 0, width: 87.6, height: 19 } : undefined))
    const r = applyOps(doc, ops)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(findNode(r.doc, 'T1')!.node).toMatchObject({ width: 88, textSizing: 'auto-height' })
    expect(sizeOps(doc, ['R2'], 'width', 'fill', () => undefined)).toEqual([])
  })

  it('positionOps ignore les enfants en flux ; setOps', () => {
    expect(positionOps(doc, ['R1', 'R2'], 'x', 40)).toEqual([{ op: 'update', id: 'R2', set: { x: 40 } }])
    expect(setOps(['R1', 'R2'], { opacity: 0.5 })).toEqual([
      { op: 'update', id: 'R1', set: { opacity: 0.5 } },
      { op: 'update', id: 'R2', set: { opacity: 0.5 } },
    ])
  })
})
