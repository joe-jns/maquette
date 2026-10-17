import { describe, it, expect } from 'vitest'
import { createNode } from '../../src/core/defaults'
import type { MaquetteDocument, Node } from '../../src/core/types'
import { thumbCropHeight, thumbHash, thumbnailTarget } from '../../src/main/thumbModel'

const doc = (children: Node[], more: Node[][] = []): MaquetteDocument => ({
  format: 'maquette',
  version: 1,
  styles: { colors: [], text: [] },
  pages: [{ id: 'p1', name: 'Page 1', children }, ...more.map((c, i) => ({ id: `p${i + 2}`, name: 'Autre', children: c }))],
})

describe('thumbHash', () => {
  it('40 hex, stable ; sous Windows la casse ne compte pas', () => {
    const h = thumbHash('C:\\Sites\\A.maquette', 'win32')
    expect(h).toMatch(/^[0-9a-f]{40}$/)
    expect(thumbHash('c:\\sites\\a.maquette', 'win32')).toBe(h)
    expect(thumbHash('C:\\Sites\\B.maquette', 'win32')).not.toBe(h)
  })
})

describe('thumbnailTarget', () => {
  it('le premier cadre visible de premier niveau de la première page', () => {
    const hidden = createNode({ type: 'frame', name: 'Caché', visible: false }, 'f0')
    const rect = createNode({ type: 'shape', shape: 'rectangle' }, 'r1')
    const frame = createNode({ type: 'frame', width: 1440, height: 900 }, 'f1')
    const other = createNode({ type: 'frame' }, 'f2')
    const d = doc([hidden, rect, frame, other], [[createNode({ type: 'frame' }, 'f9')]])
    const t = thumbnailTarget(d)!
    expect(t.nodeId).toBe('f1')
    expect(t.doc).toBe(d)
    expect(t.designWidth).toBe(1440)
  })

  it('sans cadre : toute la page, dans un cadre transparent qui englobe ses éléments', () => {
    const a = createNode({ type: 'shape', shape: 'rectangle', x: 100, y: 50, width: 200, height: 100 }, 'a')
    const b = createNode({ type: 'shape', shape: 'ellipse', x: 400, y: 300, width: 50, height: 50 }, 'b')
    const gone = createNode({ type: 'shape', shape: 'rectangle', x: -999, y: -999, visible: false }, 'g')
    const d = doc([a, b, gone])
    const t = thumbnailTarget(d)!
    const wrap = t.doc.pages[0]!.children[0]!
    expect(t.nodeId).toBe(wrap.id)
    expect(wrap).toMatchObject({ type: 'frame', width: 350, height: 300, fills: [] })
    expect((wrap as { children: Node[] }).children.map((n) => [n.id, n.x, n.y])).toEqual([['a', 0, 0], ['b', 300, 250]])
    expect(t.designWidth).toBe(350)
    // Le document d'origine n'est pas touché.
    expect(d.pages[0]!.children.map((n) => n.id)).toEqual(['a', 'b', 'g'])
  })

  it('page vide (ou tout masqué) : pas d’aperçu', () => {
    expect(thumbnailTarget(doc([]))).toBeNull()
    expect(thumbnailTarget(doc([createNode({ type: 'text', visible: false }, 't')]))).toBeNull()
  })
})

describe('thumbCropHeight', () => {
  it('page de bureau : le haut, au format 16:10', () => {
    expect(thumbCropHeight(640, 3000, 1440)).toBe(400)
  })
  it('écran de téléphone : jusqu’à 2,2 fois la largeur', () => {
    expect(thumbCropHeight(640, 1386, 375)).toBe(1386)
    expect(thumbCropHeight(640, 5000, 375)).toBe(1408)
  })
  it('image plus basse que la limite : gardée entière', () => {
    expect(thumbCropHeight(640, 300, 1440)).toBe(300)
  })
})
