import { describe, it, expect } from 'vitest'
import type { FrameNode } from '../../src/core/types'
import { locateFinding, quotes } from '../../src/taste/locate'
import { docWith, frame, text } from '../core/helpers'

function scene() {
  const f = frame('F', { x: 0, y: 0, width: 1440, height: 900 }) as FrameNode
  const inner = frame('G', {}) as FrameNode
  inner.children.push(text('T2', { content: 'Une phrase   beaucoup trop longue pour un titre de page' }))
  f.children.push(text('T1', { content: 'Bonjour' }), inner)
  return docWith([f])
}

describe('épingler une faute', () => {
  it('extrait les textes cités, sans points de suspension', () => {
    expect(quotes('2 headline(s): "Une phrase beaucoup…" → 3 lines; "Autre titre" → 4')).toEqual(['une phrase beaucoup', 'autre titre'])
  })

  it('retrouve le texte cité, même imbriqué et aux espaces près', () => {
    expect(locateFinding(scene(), 'F', '1 headline(s) wrap: "Une phrase beaucoup trop longue pour un titre de pa" → 3 lines')).toBe('T2')
  })

  it('sans citation, ou citation introuvable : le cadre', () => {
    expect(locateFinding(scene(), 'F', 'Body text is grey')).toBe('F')
    expect(locateFinding(scene(), 'F', '"Texte absent" is wrong')).toBe('F')
    expect(locateFinding(scene(), 'inconnu', '"Bonjour"')).toBe('inconnu')
  })
})
