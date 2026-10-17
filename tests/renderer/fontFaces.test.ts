import { describe, it, expect } from 'vitest'
import { createNode } from '../../src/core/defaults'
import type { MaquetteDocument } from '../../src/core/types'
import { documentFaces } from '../../src/renderer/fonts/fontLoader'

describe('coupes de police chargées pour un rendu', () => {
  it('chaque graisse et l’italique utilisés, textes imbriqués et styles de texte compris, sans doublon', () => {
    const title = createNode({ type: 'text', content: 'Avance', fontFamily: 'Alegreya Sans', fontWeight: 800 }, 't1')
    const quote = createNode({ type: 'text', content: 'Merci', fontFamily: 'Cormorant Garamond', fontWeight: 600, fontStyle: 'italic' }, 't2')
    const again = createNode({ type: 'text', content: 'Encore', fontFamily: 'Alegreya Sans', fontWeight: 800 }, 't3')
    const frame = { ...createNode({ type: 'frame', name: 'Section' }, 'f1'), children: [quote, again] }
    const doc = {
      format: 'maquette', version: 1,
      styles: { colors: [], text: [{ id: 's1', name: 'Petit', fontFamily: 'Alegreya Sans SC', fontWeight: 700, fontStyle: 'normal', fontSize: 13, lineHeight: 18, letterSpacing: 0 }] },
      pages: [{ id: 'p1', name: 'Page', children: [title, frame] }],
    } as unknown as MaquetteDocument
    expect(documentFaces(doc)).toEqual([
      { family: 'Alegreya Sans', weight: 800, style: 'normal' },
      { family: 'Cormorant Garamond', weight: 600, style: 'italic' },
      { family: 'Alegreya Sans SC', weight: 700, style: 'normal' },
    ])
  })
})
