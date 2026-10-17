import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { applyOps } from '../../src/core/ops'
import type { MaquetteDocument } from '../../src/core/types'
import { TOOLS, runTool, type ToolHost } from '../../src/mcp/tools'
import { docWith, frame } from '../core/helpers'

/**
 * Banc d'essai de l'économie de tokens (spec §9) : un scénario réaliste de Claude, mesuré en
 * caractères échangés (arguments envoyés + réponses reçues), hors capture.
 */
function host(start: MaquetteDocument): ToolHost {
  let doc = start
  return {
    doc: () => doc,
    pageId: () => doc.pages[0]!.id,
    selection: () => [],
    apply(ops) {
      const r = applyOps(doc, ops)
      if (r.ok) doc = r.doc
      return r
    },
    capture: async () => null,
    check: async () => null,
    design: {
      read: async (path) => readFileSync(join(resolve(__dirname, '../../vendor/design'), path), 'utf8'),
      tasteOptions: async () => ({ ok: false, message: 'hors banc' }),
      tasteDirection: async () => ({ ok: false, message: 'hors banc' }),
      loadFonts: async () => [],
    },
  }
}

const text = (id: string, parent: string, content: string, extra: object = {}) =>
  ({ op: 'create', parent, node: { id, type: 'text', content, ...extra } })

describe('banc d’essai tokens', () => {
  it('section hero de 15 éléments puis deux corrections : moins de 6 000 caractères', async () => {
    const h = host(docWith([frame('P1', { x: 0, y: 0, name: 'Accueil', width: 1440, height: { mode: 'hug' }, layout: { mode: 'auto', direction: 'column' } })]))
    let exchanged = 0
    const call = async (name: string, args: object) => {
      const r = await runTool(h, name, args)
      expect(r.isError, r.text).toBeFalsy()
      exchanged += JSON.stringify(args).length + r.text.length
      return JSON.parse(r.text) as { ids?: Record<string, string> }
    }

    await call('lire_document', {})
    const created = await call('appliquer', {
      libelle: 'section hero',
      operations: [
        { op: 'create', parent: 'P1', node: { id: '$hero', type: 'frame', name: 'Hero', width: { mode: 'fill' }, height: { mode: 'hug' }, fills: ['#F7F7F5'], layout: { mode: 'auto', direction: 'column', gap: 24, padding: [96, 120, 96, 120] } } },
        { op: 'create', parent: '$hero', node: { id: '$nav', type: 'frame', name: 'Navigation', width: { mode: 'fill' }, layout: { mode: 'auto', justify: 'space-between', align: 'center' } } },
        text('$logo', '$nav', 'Atelier Lumen', { fontSize: 20, fontWeight: 700 }),
        { op: 'create', parent: '$nav', node: { id: '$liens', type: 'frame', name: 'Liens', layout: { mode: 'auto', gap: 32 } } },
        text('$l1', '$liens', 'Projets'),
        text('$l2', '$liens', 'Studio'),
        text('$l3', '$liens', 'Contact'),
        text('$sur', '$hero', 'Architecture d’intérieur', { fontSize: 14, color: '#6B6B66' }),
        text('$titre', '$hero', 'Des lieux qui respirent', { fontSize: 72, fontWeight: 700, lineHeight: 72 }),
        text('$intro', '$hero', 'Nous dessinons des intérieurs calmes et durables, à Bruxelles et alentour.', { fontSize: 20, width: 560 }),
        { op: 'create', parent: '$hero', node: { id: '$ctas', type: 'frame', name: 'Boutons', layout: { mode: 'auto', gap: 12 } } },
        { op: 'create', parent: '$ctas', node: { id: '$b1', type: 'frame', name: 'Bouton principal', fills: ['#1F3D2B'], radius: 999, layout: { mode: 'auto', padding: [14, 24, 14, 24] } } },
        text('$b1t', '$b1', 'Prendre rendez-vous', { color: '#FFFFFF', fontWeight: 600 }),
        { op: 'create', parent: '$ctas', node: { id: '$b2', type: 'frame', name: 'Bouton secondaire', stroke: { color: '#1F3D2B', width: 1, align: 'inside' }, radius: 999, layout: { mode: 'auto', padding: [14, 24, 14, 24] } } },
        text('$b2t', '$b2', 'Voir les projets', { fontWeight: 600 }),
      ],
    })
    const ids = created.ids!
    expect(Object.keys(ids)).toHaveLength(15)

    // Correction 1 : Claude relit le titre et les boutons, resserre l'espacement.
    await call('lire_elements', { ids: [ids.$titre, ids.$ctas], profondeur: 1 })
    await call('appliquer', { operations: [{ op: 'update', id: ids.$titre, set: { letterSpacing: -2, lineHeight: 68 } }, { op: 'update', id: ids.$ctas, set: { layout: { mode: 'auto', gap: 16 } } }] })

    // Correction 2 : nouvelle couleur de fond et texte d'introduction raccourci.
    await call('lire_elements', { ids: [ids.$hero], profondeur: 0 })
    await call('appliquer', { operations: [{ op: 'update', id: ids.$hero, set: { fills: ['#EFEDE6'] } }, { op: 'update', id: ids.$intro, set: { content: 'Des intérieurs calmes et durables, à Bruxelles.' } }] })

    expect(exchanged).toBeLessThan(6000)
  })

  it('photos : chercher 6 résultats puis en poser une, moins de 1 800 caractères', async () => {
    const h = host(docWith([frame('P1', { x: 0, y: 0, width: 1440, height: 900 })]))
    h.images = {
      search: async (_q, n) => ({
        ok: true, notes: [], sheet: null,
        hits: Array.from({ length: n }, (_, i) => ({
          n: i + 1, ref: `openverse:3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a${i}0`, title: 'Fresh sourdough bread on a wooden board', creator: 'Jane Baker',
          licence: 'CC BY 2.0', width: 1600, height: 1067, thumb: `https://api.openverse.org/v1/images/3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a${i}0/thumb/`,
        })),
      }),
      place: async () => ({ ok: true, src: 'assets/fresh-sourdough-bread-on-a-wooden-board-1a2b3c4d.jpg', width: 1600, height: 1067, title: 'Fresh sourdough bread', credit: '« Fresh sourdough bread on a wooden board » par Jane Baker, CC BY 2.0, via Flickr' }),
      credits: async () => [],
      measure: () => null,
    }
    let exchanged = 0
    for (const args of [{ cherche: 'sourdough bread' }, { poser: 2, dans: 'P1' }]) {
      const r = await runTool(h, 'images', args)
      expect(r.isError, r.text).toBeFalsy()
      exchanged += JSON.stringify(args).length + r.text.length
    }
    expect(exchanged).toBeLessThan(1800)
  })

  /**
   * Définitions des outils (noms, descriptions, schémas JSON) : envoyées à chaque tour de Claude.
   * 12 outils (7 d’édition + images, icones, guide, style, direction) : ~7 300 caractères mesurés, plafond 8 000 (~2 300 tokens).
   */
  it('définitions des outils : moins de 8 000 caractères', () => {
    const size = TOOLS.reduce((n, t) => n + JSON.stringify({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(z.object(t.input)) }).length, 0)
    expect(size).toBeLessThan(8000)
  })

  /**
   * Méthode de design complète pour une nouvelle landing, avant la première section : sommaire des
   * guides, variantes d'un style, application du style (fiche comprise), guide du type de page. Le
   * détail est lu à la demande, une fois : moins de 13 000 caractères (~3 500 tokens ; ~10 200 mesurés), hors capture.
   */
  it('méthode avant la première section (guide, style, guide du type) : moins de 13 000 caractères', async () => {
    const h = host(docWith([]))
    let exchanged = 0
    const call = async (name: string, args: object) => {
      const r = await runTool(h, name, args)
      expect(r.isError, r.text).toBeFalsy()
      exchanged += JSON.stringify(args).length + r.text.length
      return r.text
    }
    await call('lire_document', {})
    await call('guide', {})
    await call('style', { nom: 'Artisan Editorial' })
    const applied = await call('style', { nom: 'Artisan Editorial', variante: 'Heritage Warmth', appliquer: true })
    expect(applied).toContain('"couleurs"')
    await call('guide', { sujet: 'landing-page' })
    expect(exchanged).toBeLessThan(13000)
  })
})
