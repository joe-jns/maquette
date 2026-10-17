import { describe, it, expect } from 'vitest'
import { applyOps } from '../../src/core/ops'
import type { FrameNode, MaquetteDocument } from '../../src/core/types'
import { TOOLS, runTool, type ToolHost } from '../../src/mcp/tools'
import { docWith, frame, rect, text } from '../core/helpers'

function host(start: MaquetteDocument, selection: string[] = []): ToolHost & { current(): MaquetteDocument; labels: string[] } {
  let doc = start
  const labels: string[] = []
  return {
    doc: () => doc,
    current: () => doc,
    labels,
    pageId: () => doc.pages[0]!.id,
    selection: () => selection,
    apply(ops, label) {
      const r = applyOps(doc, ops)
      if (r.ok) {
        doc = r.doc
        labels.push(label)
      }
      return r
    },
    capture: async (id, width) => (id === 'F1' ? { data: `img-${width}`, mimeType: 'image/jpeg' } : null),
  }
}

function scene() {
  const f = frame('F1', { x: 40, y: 40, name: 'Hero', width: 600, height: { mode: 'hug' }, layout: { mode: 'auto', gap: 16, padding: [24, 24, 24, 24] } }) as FrameNode
  f.children.push(text('T1', { content: 'Bonjour Maquette', fontSize: 40 }), text('T2', { content: 'Deuxième ligne' }))
  const d = docWith([f, rect('R1', { x: 700, y: 40, name: 'Bleu' })])
  d.styles.colors.push({ id: 'C1', name: 'accent', value: '#C2410C' })
  return d
}

describe('outils MCP', () => {
  it('la liste des outils a des descriptions courtes', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['lire_document', 'lire_elements', 'chercher', 'appliquer', 'capture', 'selection'])
    for (const t of TOOLS) expect(t.description.length).toBeLessThan(400)
  })

  it('lire_document : résumé compact du premier niveau', async () => {
    const r = await runTool(host(scene()), 'lire_document', {})
    const data = JSON.parse(r.text)
    expect(data.total).toBe(4)
    expect(data.pages[0].elements).toEqual([
      { id: 'F1', type: 'frame', nom: 'Hero', l: 600, h: 'hug', x: 40, y: 40, enfants: 2 },
      { id: 'R1', type: 'shape', nom: 'Bleu', l: 100, h: 100, x: 700, y: 40 },
    ])
    expect(data.couleurs).toEqual({ accent: '#C2410C' })
    expect(r.text.length).toBeLessThan(1200)
  })

  it('lire_elements : seulement ce qui diffère des valeurs par défaut, profondeur', async () => {
    const r = await runTool(host(scene()), 'lire_elements', { ids: ['F1', 'zz'], profondeur: 0 })
    const [f, missing] = JSON.parse(r.text).elements
    expect(f).toMatchObject({ id: 'F1', type: 'frame', name: 'Hero', width: 600, enfants: 2 })
    expect(f).not.toHaveProperty('visible')
    expect(f).not.toHaveProperty('children')
    expect(missing).toEqual({ id: 'zz', erreur: 'introuvable' })
    const deep = JSON.parse((await runTool(host(scene()), 'lire_elements', { ids: ['F1'] })).text).elements[0]
    expect(deep.children[0]).toMatchObject({ id: 'T1', type: 'text', content: 'Bonjour Maquette', fontSize: 40 })
    expect(deep.children[0]).not.toHaveProperty('fontFamily')
  })

  it('chercher par nom, type, texte', async () => {
    const h = host(scene())
    expect(JSON.parse((await runTool(h, 'chercher', { nom: 'her' })).text).resultats).toEqual([['F1', 'frame', 'Hero', null]])
    expect(JSON.parse((await runTool(h, 'chercher', { texte: 'deuxième' })).text).resultats).toEqual([['T2', 'text', 'Texte', 'F1']])
    expect(JSON.parse((await runTool(h, 'chercher', { type: 'text', limite: 1 })).text)).toMatchObject({ resultats: [['T1', 'text', 'Texte', 'F1']], plus: 1 })
  })

  it('appliquer : lot valide, réponse courte, libellé d’historique', async () => {
    const h = host(scene())
    const r = await runTool(h, 'appliquer', {
      libelle: 'ajouter un bouton',
      operations: [
        { op: 'create', parent: 'F1', node: { id: '$btn', type: 'frame', name: 'Bouton', fills: ['#0D99FF'], layout: { mode: 'auto' } } },
        { op: 'create', parent: '$btn', node: { type: 'text', content: 'Réserver', color: 'white' } },
      ],
    })
    const data = JSON.parse(r.text)
    expect(r.isError).toBeFalsy()
    expect(data).toEqual({ ok: true, ids: { $btn: expect.any(String) } })
    expect(r.text.length).toBeLessThan(300)
    expect(h.labels).toEqual(['Claude : ajouter un bouton'])
  })

  it('appliquer : une clé devinée (CSS, Figma) est corrigée dans le message', async () => {
    const r = await runTool(host(scene()), 'appliquer', { operations: [{ op: 'update', id: 'R1', set: { cornerRadius: 8 } }] })
    expect(r.isError).toBe(true)
    expect(JSON.parse(r.text).erreurs[0].message).toContain('cornerRadius → radius')
  })

  it('appliquer : lot invalide, rien n’est appliqué, au plus 5 erreurs', async () => {
    const h = host(scene())
    const before = h.current()
    const r = await runTool(h, 'appliquer', { operations: [{ op: 'update', id: 'R1', set: { colour: 'red' } }] })
    expect(r.isError).toBe(true)
    const data = JSON.parse(r.text)
    expect(data.ok).toBe(false)
    expect(data.erreurs.length).toBeGreaterThan(0)
    expect(data.erreurs.length).toBeLessThanOrEqual(5)
    expect(h.current()).toBe(before)
  })

  it('arguments invalides ou outil inconnu : erreur explicite', async () => {
    const h = host(scene())
    expect((await runTool(h, 'appliquer', { operations: [] })).isError).toBe(true)
    expect((await runTool(h, 'lire_elements', { ids: 'F1' })).isError).toBe(true)
    expect((await runTool(h, 'inconnu', {})).isError).toBe(true)
  })

  it('capture et sélection', async () => {
    const h = host(scene(), ['R1'])
    const c = await runTool(h, 'capture', { id: 'F1' })
    expect(c.image).toEqual({ data: 'img-800', mimeType: 'image/jpeg' })
    expect(c.text).toContain('Hero')
    expect((await runTool(h, 'capture', { id: 'R1' })).isError).toBe(true)
    expect(JSON.parse((await runTool(h, 'selection', {})).text)).toEqual([{ id: 'R1', type: 'shape', nom: 'Bleu' }])
  })
})
