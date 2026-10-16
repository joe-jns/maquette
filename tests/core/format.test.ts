import { describe, it, expect } from 'vitest'
import { parseDocument, serializeDocument } from '../../src/core/format'
import { docWith, text } from './helpers'

describe('format .maquette', () => {
  it('aller-retour exact, y compris accents, guillemets, emoji et retours à la ligne', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0, content: 'Été « ok » 🌿\nligne 2' })])
    const textOut = serializeDocument(doc)
    const back = parseDocument(textOut)
    expect(back).toEqual({ ok: true, doc })
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

  it('document invalide selon les règles : erreurs avec chemin', () => {
    const doc = docWith([text('t00001', { content: 'sans position' })])
    const r = parseDocument(JSON.stringify(doc))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('pages[0].children[0].x')
  })
})
