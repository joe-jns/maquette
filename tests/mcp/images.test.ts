import { describe, it, expect } from 'vitest'
import { applyOps } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode, ImageNode, MaquetteDocument } from '../../src/core/types'
import type { ImageHost } from '../../src/mcp/images'
import { runTool, type ToolHost } from '../../src/mcp/tools'
import { docWith, frame, rect } from '../core/helpers'

interface Fake extends ToolHost { current(): MaquetteDocument; labels: string[]; placed: (string | number)[] }

function host(start: MaquetteDocument, opts: { images?: Partial<ImageHost> } = {}): Fake {
  let doc = start
  const labels: string[] = []
  const placed: (string | number)[] = []
  const images: ImageHost = {
    search: async (_q, n, sheet) => ({
      ok: true,
      notes: [],
      hits: Array.from({ length: n }, (_, i) => ({ n: i + 1, ref: `openverse:${i}`, title: `Pain ${i}`, creator: 'Marie', licence: 'CC BY 2.0', width: 1600, height: 1200, thumb: `https://t/${i}` })),
      sheet: sheet ? { data: 'jpeg', mimeType: 'image/jpeg' } : null,
    }),
    place: async (ref) => {
      placed.push(ref)
      return { ok: true, src: 'assets/pain-1234abcd.jpg', width: 1600, height: 1200, title: 'Pain au levain', credit: '« Pain au levain » par Marie, CC BY 2.0, via Flickr' }
    },
    credits: async () => [
      { file: 'assets/pain-1234abcd.jpg', credit: '« Pain au levain »…', page: 'https://flickr/1', licenseUrl: null },
      { file: 'assets/autre.jpg', credit: 'autre', page: null, licenseUrl: null },
    ],
    measure: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    ...opts.images,
  }
  return {
    doc: () => doc,
    current: () => doc,
    labels,
    placed,
    pageId: () => doc.pages[0]!.id,
    selection: () => [],
    apply(ops, label) {
      const r = applyOps(doc, ops)
      if (r.ok) {
        doc = r.doc
        labels.push(label)
      }
      return r
    },
    capture: async () => null,
    check: async () => null,
    images,
  }
}

function scene() {
  const hero = frame('F1', { x: 0, y: 0, name: 'Hero', width: 1200, height: 600, radius: 16, layout: { mode: 'auto', direction: 'column' } }) as FrameNode
  hero.children.push(rect('R1', { name: 'Photo', width: 400, height: 300, radius: 12 }))
  const loose = frame('F2', { x: 0, y: 700, name: 'Libre', width: { mode: 'hug' }, height: { mode: 'hug' }, layout: { mode: 'auto' } })
  return docWith([hero, loose, rect('E1', { shape: 'ellipse', x: 1300, y: 0, width: 80, height: 80 })])
}

const call = (h: ToolHost, args: object) => runTool(h, 'images', args)

describe('outil images', () => {
  it('cherche : liste compacte et planche-contact ; planche:false s’en passe', async () => {
    const h = host(scene())
    const r = await call(h, { cherche: 'bakery bread', n: 3 })
    expect(r.isError).toBeFalsy()
    expect(JSON.parse(r.text)).toEqual({ resultats: [0, 1, 2].map((i) => [i + 1, `openverse:${i}`, `Pain ${i}`, 'Marie', 'CC BY 2.0', '1600x1200', `https://t/${i}`]) })
    expect(r.image).toEqual({ data: 'jpeg', mimeType: 'image/jpeg' })
    expect((await call(h, { cherche: 'pain', planche: false })).image).toBeUndefined()
  })

  it('une action par appel, erreurs de recherche transmises', async () => {
    const h = host(scene(), { images: { search: async () => ({ ok: false, message: 'recherche impossible, pas de réseau ?' }) } })
    expect((await call(h, {})).isError).toBe(true)
    expect((await call(h, { cherche: 'pain', poser: 1 })).isError).toBe(true)
    const r = await call(h, { cherche: 'pain' })
    expect(r).toEqual({ text: 'recherche impossible, pas de réseau ?', isError: true })
  })

  it('poser sans cible : nouvelle image sur la page, au ratio, en une opération', async () => {
    const h = host(scene())
    const r = await call(h, { poser: 'openverse:3', x: 50, y: 900, w: 400 })
    expect(r.isError, r.text).toBeFalsy()
    const out = JSON.parse(r.text)
    expect(out).toMatchObject({ ok: true, src: 'assets/pain-1234abcd.jpg', credit: expect.stringContaining('CC BY') })
    const node = findNode(h.current(), out.id)!.node as ImageNode
    expect(node).toMatchObject({ type: 'image', src: 'assets/pain-1234abcd.jpg', fit: 'cover', width: 400, height: 300, x: 50, y: 900, name: 'Pain au levain' })
    expect(h.labels).toEqual(['Claude : photo Pain au levain'])
    expect(h.placed).toEqual(['openverse:3'])
  })

  it('poser par numéro dans un cadre automatique : enfant du flux, largeur 800 par défaut', async () => {
    const h = host(scene())
    const out = JSON.parse((await call(h, { poser: 2, parent: 'F1', fit: 'contain' })).text)
    const loc = findNode(h.current(), out.id)!
    expect(loc.parent?.id).toBe('F1')
    expect(loc.node).toMatchObject({ width: 800, height: 600, fit: 'contain', position: 'flow' })
    expect(h.placed).toEqual([2])
  })

  it('dans un rectangle : il est remplacé à la même place, avec sa taille et ses coins', async () => {
    const h = host(scene())
    const out = JSON.parse((await call(h, { poser: 1, dans: 'R1' })).text)
    expect(findNode(h.current(), 'R1')).toBeNull()
    const loc = findNode(h.current(), out.id)!
    expect(loc.parent?.id).toBe('F1')
    expect(loc.index).toBe(0)
    expect(loc.node).toMatchObject({ type: 'image', name: 'Photo', width: 400, height: 300, radius: 12, src: 'assets/pain-1234abcd.jpg' })
    expect(h.labels).toHaveLength(1)
  })

  it('dans une ellipse : coins arrondis au maximum', async () => {
    const h = host(scene())
    const out = JSON.parse((await call(h, { poser: 1, dans: 'E1' })).text)
    expect(findNode(h.current(), out.id)!.node).toMatchObject({ radius: 9999, width: 80, height: 80, x: 1300 })
  })

  it('dans une image : sa source change, rien d’autre', async () => {
    const h = host(scene())
    const first = JSON.parse((await call(h, { poser: 1, x: 0, y: 0, w: 100, h: 100 })).text)
    const again = JSON.parse((await call(h, { poser: 2, dans: first.id, nom: 'Four' })).text)
    expect(again.id).toBe(first.id)
    expect(findNode(h.current(), first.id)!.node).toMatchObject({ name: 'Four', width: 100, height: 100 })
  })

  it('dans un cadre : fond hors flux sous les enfants, à sa taille (mesurée si hug)', async () => {
    const h = host(scene())
    const out = JSON.parse((await call(h, { poser: 1, dans: 'F1' })).text)
    const loc = findNode(h.current(), out.id)!
    expect(loc.parent?.id).toBe('F1')
    expect(loc.index).toBe(0)
    expect(loc.node).toMatchObject({ position: 'absolute', x: 0, y: 0, width: 1200, height: 600, radius: 16 })
    const free = JSON.parse((await call(h, { poser: 1, dans: 'F2' })).text)
    expect(findNode(h.current(), free.id)!.node).toMatchObject({ width: 640, height: 360 })
  })

  it('cible vérifiée avant le téléchargement', async () => {
    const h = host(scene())
    expect((await call(h, { poser: 1, dans: 'X' })).text).toContain('introuvable')
    expect((await call(h, { poser: 1, parent: 'R1' })).isError).toBe(true)
    expect(h.placed).toEqual([])
  })

  it('échec du téléchargement : message transmis, document intact', async () => {
    const h = host(scene(), { images: { place: async () => ({ ok: false, message: 'openverse:1 : l’image ne se télécharge pas (HTTP 404)' }) } })
    const before = h.current()
    expect(await call(h, { poser: 1 })).toEqual({ text: 'openverse:1 : l’image ne se télécharge pas (HTTP 404)', isError: true })
    expect(h.current()).toBe(before)
  })

  it('credits : seulement les photos utilisées par le document', async () => {
    const h = host(scene())
    expect(JSON.parse((await call(h, { credits: true })).text)).toEqual({ credits: [] })
    await call(h, { poser: 1 })
    expect(JSON.parse((await call(h, { credits: true })).text)).toEqual({ credits: [['assets/pain-1234abcd.jpg', '« Pain au levain »…', 'https://flickr/1']] })
  })

  it('hôte sans images : indisponible', async () => {
    const h = host(scene())
    delete h.images
    expect((await call(h, { cherche: 'pain' })).isError).toBe(true)
  })
})
