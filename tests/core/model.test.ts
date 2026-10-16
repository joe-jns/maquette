import { describe, it, expect } from 'vitest'
import { DocumentSchema, NodeSchema } from '../../src/core/schema'
import { newId } from '../../src/core/ids'
import { createNode, newDocument } from '../../src/core/defaults'
import { collectIds, containsId, findNode, isFill, isHug } from '../../src/core/tree'
import type { FrameNode } from '../../src/core/types'
import { docWith, frame, text } from './helpers'

describe('modèle', () => {
  it('un document neuf est valide et a une page « Page 1 »', () => {
    const doc = newDocument()
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
    expect(doc.pages).toHaveLength(1)
    expect(doc.pages[0]!.name).toBe('Page 1')
  })

  it('un texte reçoit un interligne de 1,2 × la taille par défaut', () => {
    const t = createNode({ type: 'text', fontSize: 20 }, 'abc123')
    expect(t).toMatchObject({ id: 'abc123', type: 'text', lineHeight: 24, width: { mode: 'hug' }, textSizing: 'auto' })
  })

  it('un interligne fourni est conservé', () => {
    const t = createNode({ type: 'text', fontSize: 20, lineHeight: 30 }, 'abc123')
    expect(t).toMatchObject({ lineHeight: 30 })
  })

  it('une mise en page automatique partielle est complétée', () => {
    const f = createNode({ type: 'frame', layout: { mode: 'auto', direction: 'row' } }, 'f00001') as FrameNode
    expect(f.layout).toEqual({
      mode: 'auto', direction: 'row', gap: 0, padding: [0, 0, 0, 0],
      justify: 'start', align: 'start', wrap: false, reverseZ: false,
    })
  })

  it('le schéma refuse une propriété inconnue', () => {
    const t = { ...text('t00001'), colour: 'red' }
    expect(NodeSchema.safeParse(t).success).toBe(false)
  })

  it('newId produit des identifiants de 6 caractères sans ambiguïté', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const id = newId(seen)
      expect(id).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{6}$/)
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
  })

  it('findNode trouve un élément imbriqué avec son parent et son chemin', () => {
    const inner = text('t00001')
    const outer = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    outer.children.push(inner)
    const doc = docWith([outer])
    const loc = findNode(doc, 't00001')
    expect(loc?.parent?.id).toBe('f00001')
    expect(loc?.index).toBe(0)
    expect(loc?.path).toBe('pages[0].children[0].children[0]')
    expect(findNode(doc, 'absent')).toBeNull()
  })

  it('collectIds rassemble pages, éléments et styles', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0 })])
    doc.styles.colors.push({ id: 'c00001', name: 'fond', value: '#FFFFFF' })
    const ids = collectIds(doc)
    expect(ids.has(doc.pages[0]!.id)).toBe(true)
    expect(ids.has('f00001')).toBe(true)
    expect(ids.has('c00001')).toBe(true)
  })

  it('containsId, isHug, isFill', () => {
    const outer = frame('f00001', { x: 0, y: 0 }) as FrameNode
    outer.children.push(text('t00001'))
    expect(containsId(outer, 't00001')).toBe(true)
    expect(containsId(outer, 'f00001')).toBe(true)
    expect(containsId(outer, 'zzzzzz')).toBe(false)
    expect(isHug({ mode: 'hug' })).toBe(true)
    expect(isFill({ mode: 'fill' })).toBe(true)
    expect(isHug(10)).toBe(false)
  })
})
