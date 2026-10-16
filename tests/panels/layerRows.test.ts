import { describe, it, expect } from 'vitest'
import type { FrameNode } from '../../src/core/types'
import { layerDrop, layerRows } from '../../src/renderer/panels/layerRows'
import { docWith, frame, rect, text } from '../core/helpers'

function build() {
  const auto = frame('A1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
  auto.children.push(text('T1'), text('T2'))
  const free = frame('L1', { x: 0, y: 0 }) as FrameNode
  free.children.push(rect('R1', { x: 0, y: 0 }), rect('R2', { x: 0, y: 0 }))
  return docWith([auto, free, rect('R3', { x: 0, y: 0 })]).pages[0]!
}

describe('arbre des calques', () => {
  const page = build()

  it('ordre de Figma : dessus en premier, mais ordre de la mise en page dans un cadre automatique', () => {
    const rows = layerRows(page, new Set(['A1', 'L1']))
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ['R3', 0], ['L1', 0], ['R2', 1], ['R1', 1], ['A1', 0], ['T1', 1], ['T2', 1],
    ])
    expect(rows.find((r) => r.id === 'T1')).toMatchObject({ parentId: 'A1', auto: true })
  })

  it('un cadre replié cache ses enfants', () => {
    expect(layerRows(page, new Set()).map((r) => r.id)).toEqual(['R3', 'L1', 'A1'])
  })

  it('dépôt avant / après / dans', () => {
    const rows = layerRows(page, new Set(['A1', 'L1']))
    const at = (id: string) => rows.findIndex((r) => r.id === id)
    // Avant R3 (tout en haut de la page) = au-dessus de tout = fin du tableau children de la page.
    expect(layerDrop(page, rows, at('R3'), 0.1, ['R1'])).toEqual({ parent: page.id, index: 3 })
    // Après T1 dans le cadre automatique = indice 1.
    expect(layerDrop(page, rows, at('T1'), 0.9, ['R3'])).toEqual({ parent: 'A1', index: 1 })
    // Au milieu du cadre libre L1 = à l'intérieur, au-dessus = fin de ses enfants.
    expect(layerDrop(page, rows, at('L1'), 0.5, ['R3'])).toEqual({ parent: 'L1', index: 2 })
    // Au milieu d'un rectangle = avant lui.
    expect(layerDrop(page, rows, at('R2'), 0.5, ['R3'])).toEqual({ parent: 'L1', index: 2 })
    // Dans soi-même : interdit.
    expect(layerDrop(page, rows, at('T1'), 0.5, ['A1'])).toBeNull()
  })
})

describe('arbre des calques : cas du glisser', () => {
  const page = build()
  const rows = layerRows(page, new Set(['A1', 'L1']))
  const at = (id: string) => rows.findIndex((r) => r.id === id)

  it('décrit chaque ligne', () => {
    expect(rows.find((r) => r.id === 'L1')).toMatchObject({
      parentId: null, hasChildren: true, expanded: true, auto: false, visible: true, locked: false, type: 'frame',
    })
    expect(rows.find((r) => r.id === 'R1')).toMatchObject({ parentId: 'L1', hasChildren: false, auto: false })
    expect(layerRows(page, new Set()).find((r) => r.id === 'A1')).toMatchObject({ hasChildren: true, expanded: false })
  })

  it('glisser dans son propre parent : indice final, après retrait', () => {
    // A1 (indice 0 de la page) tout en haut : [L1, R3, A1].
    expect(layerDrop(page, rows, at('R3'), 0.1, ['A1'])).toEqual({ parent: page.id, index: 2 })
    // R3 (indice 2) tout en bas, sous A1 : [R3, A1, L1].
    expect(layerDrop(page, rows, at('A1'), 0.9, ['R3'])).toEqual({ parent: page.id, index: 0 })
    // T1 après T2 dans le cadre automatique : [T2, T1].
    expect(layerDrop(page, rows, at('T2'), 0.9, ['T1'])).toEqual({ parent: 'A1', index: 1 })
    // R1 au-dessus de R2 dans le cadre libre : [R2, R1].
    expect(layerDrop(page, rows, at('R2'), 0.1, ['R1'])).toEqual({ parent: 'L1', index: 1 })
    // R1 déposé dans son propre cadre : tout en haut, [R2, R1].
    expect(layerDrop(page, rows, at('L1'), 0.5, ['R1'])).toEqual({ parent: 'L1', index: 1 })
  })

  it('plusieurs éléments tirés', () => {
    // Seul T1 est déjà dans A1 avant l'indice visé : 2 - 1.
    expect(layerDrop(page, rows, at('T2'), 0.9, ['T1', 'R3'])).toEqual({ parent: 'A1', index: 1 })
    // Venus d'ailleurs : rien à retrancher.
    expect(layerDrop(page, rows, at('A1'), 0.5, ['R1', 'R2'])).toEqual({ parent: 'A1', index: 2 })
    // A1 et L1 tout en haut de la page : 3 - 2.
    expect(layerDrop(page, rows, at('R3'), 0.1, ['A1', 'L1'])).toEqual({ parent: page.id, index: 1 })
    // L'un des éléments tirés contient la cible : interdit.
    expect(layerDrop(page, rows, at('R2'), 0.5, ['R3', 'L1'])).toBeNull()
  })

  it('dépôt sur une ligne d’un autre niveau de profondeur', () => {
    // De la profondeur 1 vers la page.
    expect(layerDrop(page, rows, at('R3'), 0.1, ['T2'])).toEqual({ parent: page.id, index: 3 })
    // De la page vers un cadre libre, sous R1 = tout en dessous.
    expect(layerDrop(page, rows, at('R1'), 0.9, ['R3'])).toEqual({ parent: 'L1', index: 0 })
    // Un cadre vers un cadre automatique, avant T2.
    expect(layerDrop(page, rows, at('T2'), 0.1, ['L1'])).toEqual({ parent: 'A1', index: 1 })
  })

  it('ligne inexistante ou rien de tiré : null', () => {
    expect(layerDrop(page, rows, 99, 0.5, ['R3'])).toBeNull()
    expect(layerDrop(page, rows, at('R1'), 0.5, [])).toBeNull()
  })
})
