import { describe, it, expect } from 'vitest'
import { createNode } from '../../src/core/defaults'
import type { Node } from '../../src/core/types'
import { selectionContext, selectionLabel } from '../../src/renderer/chat/connect'
import { docWith, rect } from '../core/helpers'

const img = (id: string, name: string, width = 800, height = 500): Node =>
  createNode({ type: 'image', name, src: `assets/${id}.png`, width, height }, id)

describe('contexte de la sélection pour Claude', () => {
  const doc = docWith([img('i1', 'Dribbble 1'), img('i2', 'Capture'), img('i3', 'Tweet', 600, 900), rect('R1', { name: 'Bleu' })])

  it('pastille : « 3 images », ou le nombre d’images parmi les éléments', () => {
    expect(selectionLabel(doc, ['i1', 'i2', 'i3'])).toBe('3 images')
    expect(selectionLabel(doc, ['i1', 'R1'])).toBe('2 éléments dont 1 image')
    expect(selectionLabel(doc, ['R1', 'R1'])).toBe('2 éléments sélectionnés')
    expect(selectionLabel(doc, ['i2'])).toBe('Capture')
  })

  it('les images sont annoncées comme références, avec taille d’origine et l’appel capture à faire', () => {
    const natural = (id: string) => (id === 'i1' ? { width: 1440, height: 900 } : null)
    const context = selectionContext(doc, ['i1', 'i2', 'i3', 'R1'], natural)
    expect(context.split('\n')).toEqual([
      'Sélection dans Maquette : i1 (image, « Dribbble 1 »), i2 (image, « Capture »), i3 (image, « Tweet »), R1 (shape rectangle, « Bleu »)',
      '3 images de référence sélectionnées : i1 (Dribbble 1, 1440×900), i2 (Capture, 800×500), i3 (Tweet, 600×900) — regarde-les avec capture({ ids: ["i1", "i2", "i3"] }).',
    ])
  })

  it('sans image : contexte inchangé ; une image : capture({ id })', () => {
    expect(selectionContext(doc, ['R1'])).toBe('Sélection dans Maquette : R1 (shape rectangle, « Bleu »)')
    expect(selectionContext(doc, ['i2'])).toContain('1 image de référence sélectionnée : i2 (Capture, 800×500) — regarde-les avec capture({ id: "i2" }).')
    expect(selectionContext(doc, [])).toBe('')
  })
})
