import { describe, it, expect } from 'vitest'
import { repairDocument } from '../../src/core/repair'
import { validateDocument } from '../../src/core/rules'
import type { MaquetteDocument } from '../../src/core/types'

const raw = (pages: unknown, styles: unknown = { colors: [], text: [] }) => ({ format: 'maquette', version: 1, styles, pages })
const fix = (r: Record<string, unknown>) => {
  const { doc, warnings } = repairDocument(r)
  expect(validateDocument(doc as MaquetteDocument)).toEqual([])
  return { doc: doc as MaquetteDocument, paths: warnings.map((w) => w.path) }
}

describe('repairDocument', () => {
  it('ne touche pas un document valide', () => {
    const r = raw([{ id: 'pAccue', name: 'Accueil', children: [] }])
    expect(repairDocument(r)).toEqual({ doc: r, warnings: [] })
  })

  it('document sans page → une page vide', () => {
    const { doc, paths } = fix(raw([]))
    expect(doc.pages).toHaveLength(1)
    expect(paths).toEqual(['pages'])
  })

  it('élément minimal écrit à la main : complété sans avertissement', () => {
    const { doc, paths } = fix(raw([{ id: 'p1', name: 'P', children: [{ id: 'r1', type: 'shape', x: 10, y: 10 }] }]))
    expect(doc.pages[0]!.children[0]).toMatchObject({ id: 'r1', type: 'shape', width: 100, fills: ['#D9D9D9'], visible: true })
    expect(paths).toEqual([])
  })

  it('propriété inconnue retirée, type inconnu retiré, couleur convertie', () => {
    const { doc, paths } = fix(raw([{ id: 'p1', name: 'P', children: [
      { id: 'r1', type: 'shape', x: 0, y: 0, colour: 'red', fills: ['white'] },
      { id: 'z1', type: 'video' },
    ] }]))
    expect(doc.pages[0]!.children).toHaveLength(1)
    expect(doc.pages[0]!.children[0]).not.toHaveProperty('colour')
    expect(doc.pages[0]!.children[0]).toMatchObject({ fills: ['#FFFFFF'] })
    expect(paths).toEqual(['pages[0].children[0].colour', 'pages[0].children[0].fills[0]', 'pages[0].children[1]'])
  })

  it('identifiants en double renouvelés, références inconnues détachées', () => {
    const { doc, paths } = fix(raw([{ id: 'p1', name: 'P', children: [
      { id: 'r1', type: 'shape', x: 0, y: 0, fills: [{ style: 'absent' }] },
      { id: 'r1', type: 'text', x: 0, y: 0, textStyle: 'absent' },
    ] }]))
    const [a, b] = doc.pages[0]!.children
    expect(a!.type === 'shape' && a.fills).toEqual(['#FF00FF'])
    expect(b!.id).not.toBe('r1')
    expect(b).not.toHaveProperty('textStyle')
    expect(paths).toEqual(['pages[0].children[0].fills[0]', 'pages[0].children[1].id', 'pages[0].children[1].textStyle'])
  })

  it('règles ramenées à l’état valide le plus proche', () => {
    const { doc } = fix(raw([{ id: 'p1', name: 'P', children: [
      { id: 'f1', type: 'frame', x: 0, y: 0, width: { mode: 'hug' }, layout: { mode: 'auto', rowGap: 4, align: 'baseline' }, children: [
        { id: 'r1', type: 'shape', x: 5, y: 5, width: { mode: 'fill' } },
        { id: 't1', type: 'text', width: 200, textSizing: 'auto' },
      ] },
      { id: 'r2', type: 'shape', x: 0, y: 0, width: { mode: 'hug' }, position: 'absolute', minWidth: 10 },
    ] }]))
    const f = doc.pages[0]!.children[0]!
    expect(f).toMatchObject({ width: 100 })
    expect(f.type === 'frame' && f.layout).toMatchObject({ align: 'start' })
    expect(f.type === 'frame' && f.layout).not.toHaveProperty('rowGap')
    expect(f.type === 'frame' && f.children[0]!.x).toBeUndefined()
    expect(f.type === 'frame' && f.children[1]).toMatchObject({ textSizing: 'auto-height' })
    expect(doc.pages[0]!.children[1]).toMatchObject({ width: 100, position: 'flow' })
    expect(doc.pages[0]!.children[1]).not.toHaveProperty('minWidth')
  })
})
