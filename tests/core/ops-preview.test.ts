import { describe, expect, it } from 'vitest'
import { freeze } from 'immer'
import { applyOps, type Op } from '../../src/core/ops'
import { validateDocument } from '../../src/core/rules'
import type { FrameNode, MaquetteDocument } from '../../src/core/types'
import { docWith, frame, rect, text } from './helpers'

/** Cadre libre A (avec un cadre automatique B en « hug » et un rectangle), cadre libre C vide. */
function scene(): MaquetteDocument {
  const b = frame('f0000B', { x: 20, y: 20, width: { mode: 'hug' }, layout: { mode: 'auto', direction: 'row' } }) as FrameNode
  b.children.push(rect('r00001', { alignSelf: 'center', minWidth: 10 }), text('t00001'))
  const a = frame('f0000A', { x: 0, y: 0 }) as FrameNode
  a.children.push(b, rect('r00002', { x: 10, y: 10 }))
  const doc = docWith([a, frame('f0000C', { x: 500, y: 0 })])
  doc.pages[0]!.id = 'p00001'
  return freeze(doc, true)
}

const cases: [string, Op[]][] = [
  ['déplacement en x', [{ op: 'update', id: 'r00002', set: { x: 50, y: 60 } }]],
  ['cadre automatique passé en libre', [{ op: 'update', id: 'f0000B', set: { layout: { mode: 'free' } } }]],
  ['enfant en fill dans un parent en hug', [{ op: 'update', id: 'r00001', set: { width: { mode: 'fill' } } }]],
  ['changement de parent vers un cadre automatique', [{ op: 'move', id: 'r00002', parent: 'f0000B', index: 0 }]],
  ['sortie d’un cadre automatique', [{ op: 'move', id: 'r00001', parent: 'f0000C', x: 3, y: 4 }]],
  ['réordonnancement dans son cadre', [{ op: 'move', id: 't00001', parent: 'f0000B', index: 0 }]],
  ['création dans un cadre automatique', [{ op: 'create', parent: 'f0000B', node: { id: '$n', type: 'shape', x: 5, y: 5 } }]],
  ['suppression', [{ op: 'delete', id: 't00001' }]],
  ['opacité hors limites', [{ op: 'update', id: 'r00001', set: { opacity: 2 } }]],
  ['fill hors cadre automatique', [{ op: 'update', id: 'r00002', set: { width: { mode: 'fill' } } }]],
  ['style inconnu', [{ op: 'update', id: 'r00002', set: { fills: [{ style: 'zzz' }] } }]],
  ['plusieurs éléments à la fois', [
    { op: 'update', id: 'r00002', set: { x: 1, y: 2 } },
    { op: 'update', id: 'f0000C', set: { x: 600, y: 7 } },
  ]],
  ['page et style dans le même lot', [
    { op: 'page.create', id: '$p', name: 'Deux' },
    { op: 'style.color.set', id: '$c', name: 'Fond', value: '#123456' },
    { op: 'update', id: 'r00002', set: { fills: [{ style: '$c' }] } },
  ]],
]

describe('applyOps en aperçu (validation locale)', () => {
  it('la scène de départ est valide', () => {
    expect(validateDocument(scene())).toEqual([])
  })

  it.each(cases)('même résultat qu’en mode complet : %s', (_name, ops) => {
    const base = scene()
    const full = applyOps(base, ops)
    const preview = applyOps(base, ops, { preview: true })
    expect(preview.ok).toBe(full.ok)
    if (full.ok && preview.ok) {
      // Identifiants attribués au hasard : remplacés par leur nom temporaire avant comparaison.
      const same = (r: typeof full, v: unknown) =>
        Object.entries(r.ids).reduce((json, [tmp, id]) => json.replaceAll(id, tmp), JSON.stringify(v))
      expect(same(preview, preview.doc)).toBe(same(full, full.doc))
      expect(same(preview, preview.patches)).toBe(same(full, full.patches))
      expect(same(preview, preview.inversePatches)).toBe(same(full, full.inversePatches))
      expect(validateDocument(preview.doc)).toEqual([])
    }
  })
})
