import { describe, it, expect } from 'vitest'
import { nodeCss } from '../../src/core/css'
import { serializeDocument } from '../../src/core/format'
import { applyOps } from '../../src/core/ops'
import { repairDocument } from '../../src/core/repair'
import { validateDocument } from '../../src/core/rules'
import type { DocStyles, MaquetteDocument, ShapeNode } from '../../src/core/types'
import { docWith, frame, rect, text } from './helpers'

const styles: DocStyles = { colors: [], text: [] }

describe('flous', () => {
  it('rendu : filter et backdrop-filter, rien quand absents ou à 0', () => {
    expect(nodeCss(rect('r00001', { x: 0, y: 0, blur: 4, backgroundBlur: 12 }), null, styles))
      .toMatchObject({ filter: 'blur(4px)', backdropFilter: 'blur(12px)' })
    const none = nodeCss(rect('r00002', { x: 0, y: 0, blur: 0 }), null, styles)
    expect(none.filter).toBeUndefined()
    expect(none.backdropFilter).toBeUndefined()
    expect(nodeCss(frame('f00001', { x: 0, y: 0, backgroundBlur: 20, fills: ['#FFFFFF80'] }), null, styles).backdropFilter).toBe('blur(20px)')
  })

  it('appliquer : pose et retire (null) ; refusés sur un texte, négatifs refusés', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 }), text('t00001', { x: 0, y: 0 })])
    const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { blur: 6, backgroundBlur: 30 } }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.doc.pages[0]!.children[0]).toMatchObject({ blur: 6, backgroundBlur: 30 })
    const off = applyOps(r.doc, [{ op: 'update', id: 'r00001', set: { blur: null } }])
    expect(off.ok && 'blur' in (off.doc.pages[0]!.children[0] as ShapeNode)).toBe(false)
    expect(applyOps(doc, [{ op: 'update', id: 't00001', set: { blur: 2 } }]).ok).toBe(false)
    expect(applyOps(doc, [{ op: 'update', id: 'r00001', set: { blur: -1 } }]).ok).toBe(false)
  })

  it('réparation : gardés sur une forme, retirés d’un texte', () => {
    const raw = JSON.parse(serializeDocument(docWith([rect('r00001', { x: 0, y: 0, blur: 3 }), text('t00001', { x: 0, y: 0 })]))) as {
      pages: { children: Record<string, unknown>[] }[]
    }
    raw.pages[0]!.children[1]!.backgroundBlur = 8
    const { doc, warnings } = repairDocument(raw as unknown as Record<string, unknown>)
    expect((doc as MaquetteDocument).pages[0]!.children[0]).toMatchObject({ blur: 3 })
    expect(warnings).toEqual([{ path: 'pages[0].children[1].backgroundBlur', message: 'unknown property “backgroundBlur” removed' }])
    expect(validateDocument(doc as MaquetteDocument)).toEqual([])
  })
})
