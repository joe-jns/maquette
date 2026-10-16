import { describe, it, expect } from 'vitest'
import { validateDocument, formatPath } from '../../src/core/rules'
import { newDocument } from '../../src/core/defaults'
import type { FrameNode, TextNode } from '../../src/core/types'
import { docWith, frame, rect, text } from './helpers'

const auto = (dir: 'row' | 'column' = 'column') => ({ mode: 'auto' as const, direction: dir })
const paths = (doc: Parameters<typeof validateDocument>[0]) => validateDocument(doc).map((i) => i.path)

describe('validateDocument', () => {
  it('formatPath écrit des chemins lisibles', () => {
    expect(formatPath(['pages', 0, 'children', 2, 'width'])).toBe('pages[0].children[2].width')
  })

  it('un document valide ne produit aucune erreur', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: auto() }) as FrameNode
    f.children.push(text('t00001'))
    expect(validateDocument(docWith([f]))).toEqual([])
  })

  it('erreur de schéma : opacité hors bornes, avec le chemin exact', () => {
    const f = frame('f00001', { x: 0, y: 0, opacity: 2 })
    expect(paths(docWith([f]))).toEqual(['pages[0].children[0].opacity'])
  })

  it('un document sans page est refusé', () => {
    const doc = newDocument()
    doc.pages = []
    expect(paths(doc)).toEqual(['pages'])
  })

  it('règle 1 : "hug" sur un rectangle est refusé', () => {
    expect(paths(docWith([rect('r00001', { x: 0, y: 0, width: { mode: 'hug' } })]))).toEqual(['pages[0].children[0].width'])
  })

  it('règle 1 : "hug" sur un cadre libre est refusé', () => {
    expect(paths(docWith([frame('f00001', { x: 0, y: 0, height: { mode: 'hug' } })]))).toEqual(['pages[0].children[0].height'])
  })

  it('règle 2 : "fill" sur un cadre de premier niveau est refusé', () => {
    const issues = validateDocument(docWith([frame('f00001', { x: 0, y: 0, width: { mode: 'fill' } })]))
    expect(issues.map((i) => i.path)).toEqual(['pages[0].children[0].width'])
    expect(issues[0]!.message).toContain('"fill"')
  })

  it('règle 2 : "fill" permis dans un cadre automatique, refusé dans un cadre libre', () => {
    const ok = frame('f00001', { x: 0, y: 0, layout: auto() }) as FrameNode
    ok.children.push(rect('r00001', { width: { mode: 'fill' } }))
    expect(validateDocument(docWith([ok]))).toEqual([])

    const ko = frame('f00002', { x: 0, y: 0 }) as FrameNode
    ko.children.push(rect('r00002', { x: 0, y: 0, width: { mode: 'fill' } }))
    expect(paths(docWith([ko]))).toEqual(['pages[0].children[0].children[0].width'])
  })

  it('règle 3 : parent "hug" avec un enfant "fill" sur le même axe est refusé', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: auto('row'), width: { mode: 'hug' } }) as FrameNode
    f.children.push(rect('r00001', { width: { mode: 'fill' } }))
    expect(paths(docWith([f]))).toEqual(['pages[0].children[0].width'])
  })

  it('règle 5 : rowGap sans retour à la ligne, baseline en colonne', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto', rowGap: 8, align: 'baseline' } })
    expect(paths(docWith([f]))).toEqual(['pages[0].children[0].layout.rowGap', 'pages[0].children[0].layout.align'])
  })

  it('règle 6 : x/y interdits sur un enfant en flux, obligatoires ailleurs', () => {
    const a = frame('f00001', { x: 0, y: 0, layout: auto() }) as FrameNode
    a.children.push(rect('r00001', { x: 5, y: 5 }))
    expect(paths(docWith([a]))).toEqual(['pages[0].children[0].children[0].x'])

    const b = frame('f00002', { x: 0, y: 0 }) as FrameNode
    b.children.push(rect('r00002'))
    expect(paths(docWith([b]))).toEqual(['pages[0].children[0].children[0].x'])
  })

  it('"absolute" et alignSelf seulement dans un cadre automatique', () => {
    const f = frame('f00001', { x: 0, y: 0 }) as FrameNode
    f.children.push(rect('r00001', { x: 0, y: 0, position: 'absolute', alignSelf: 'center' }))
    expect(paths(docWith([f]))).toEqual([
      'pages[0].children[0].children[0].position',
      'pages[0].children[0].children[0].alignSelf',
    ])
  })

  it('règle 7 : min/max hors contexte automatique et min > max', () => {
    expect(paths(docWith([rect('r00001', { x: 0, y: 0, minWidth: 10 })]))).toEqual(['pages[0].children[0].minWidth'])
    const f = frame('f00001', { x: 0, y: 0, layout: auto(), minWidth: 50, maxWidth: 40 })
    expect(paths(docWith([f]))).toEqual(['pages[0].children[0].minWidth'])
  })

  it('règle 8 : cohérence de textSizing', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: auto() }) as FrameNode
    f.children.push(text('t00001', { width: 200, textSizing: 'auto' }))
    f.children.push(text('t00002', { width: { mode: 'hug' }, textSizing: 'auto-height' }))
    f.children.push(text('t00003', { width: 200, height: { mode: 'hug' }, textSizing: 'fixed' }))
    expect(paths(docWith([f]))).toEqual([
      'pages[0].children[0].children[0].textSizing',
      'pages[0].children[0].children[1].textSizing',
      'pages[0].children[0].children[2].textSizing',
    ])
  })

  it('règle 11 : références inconnues et identifiants en double', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: auto(), fills: [{ style: 'cZZZZZ' }] }) as FrameNode
    const t = text('t00001', { textStyle: 'tZZZZZ' }) as TextNode
    f.children.push(t, text('f00001'))
    expect(paths(docWith([f]))).toEqual([
      'pages[0].children[0].fills[0]',
      'pages[0].children[0].children[0].textStyle',
      'pages[0].children[0].children[1].id',
    ])
  })

  it('les références vers des styles existants sont acceptées', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0, fills: [{ style: 'c00001' }] })])
    doc.styles.colors.push({ id: 'c00001', name: 'fond', value: '#F4F1EA' })
    expect(validateDocument(doc)).toEqual([])
  })
})
