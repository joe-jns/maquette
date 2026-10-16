import { describe, it, expect } from 'vitest'
import { parseDocument, serializeDocument } from '../../src/core/format'
import { docWith, text } from './helpers'

describe('format .maquette', () => {
  it('aller-retour exact, y compris accents, guillemets, emoji et retours à la ligne', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0, content: 'Été « ok » 🌿\nligne 2' })])
    const textOut = serializeDocument(doc)
    expect(parseDocument(textOut)).toEqual({ ok: true, doc, warnings: [] })
    expect(textOut.endsWith('\n')).toBe(true)
    expect(textOut).toContain('\n  "format": "maquette"')
    expect(textOut).toContain('Été « ok » 🌿')
  })

  it('JSON cassé : message clair', () => {
    const r = parseDocument('{ "format": ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/^JSON invalide/)
  })

  it('autre format : refusé', () => {
    const r = parseDocument('{"hello": 1}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toEqual({ path: 'format', message: 'ce fichier n’est pas un document Maquette' })
  })

  it('version future : refusée avec un message explicite', () => {
    const r = parseDocument(JSON.stringify({ format: 'maquette', version: 99, styles: { colors: [], text: [] }, pages: [] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.message).toContain('plus récente')
  })

  it('version absente : refusée', () => {
    const r = parseDocument(JSON.stringify({ format: 'maquette' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('version')
  })

  it('un document qui enfreint une règle est ouvert et réparé, avec un avertissement', () => {
    const doc = docWith([text('t00001', { content: 'sans position' })])
    const r = parseDocument(JSON.stringify(doc))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc.pages[0]!.children[0]).toMatchObject({ x: 0, y: 0 })
      expect(r.warnings.map((w) => w.path)).toEqual(['pages[0].children[0].x'])
    }
  })

  it('une valeur de mauvais type non réparable : refus', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0 })]) as unknown as { pages: { children: Record<string, unknown>[] }[] }
    doc.pages[0]!.children[0]!.opacity = 'abc'
    const r = parseDocument(JSON.stringify(doc))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('pages[0].children[0].opacity')
  })

  it('un fichier commençant par un BOM UTF-8 (éditeurs Windows) s’ouvre', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0 })])
    expect(parseDocument('﻿' + serializeDocument(doc))).toEqual({ ok: true, doc, warnings: [] })
  })
})
