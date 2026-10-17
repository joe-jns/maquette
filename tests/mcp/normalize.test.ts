import { describe, it, expect } from 'vitest'
import { applyOps } from '../../src/core/ops'
import type { MaquetteDocument } from '../../src/core/types'
import { normalizeOperations, originPath, paint } from '../../src/mcp/normalize'
import { runTool, type ToolHost } from '../../src/mcp/tools'
import { docWith, frame, rect, text } from '../core/helpers'

function host(start: MaquetteDocument): ToolHost & { current(): MaquetteDocument; labels: string[] } {
  let doc = start
  const labels: string[] = []
  return {
    doc: () => doc,
    current: () => doc,
    labels,
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
  }
}

const scene = () => docWith([frame('P1', { x: 0, y: 0, name: 'Page', width: 1440, height: { mode: 'hug' }, layout: { mode: 'auto', direction: 'column' } }), rect('R1', { x: 0, y: 0 }), text('T1', { x: 0, y: 0 })])

/** Document sans identifiants (attribués au hasard), pour comparer deux constructions. */
function shape(doc: MaquetteDocument): unknown {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'id').map(([k, x]) => [k, strip(x)]))
    return v
  }
  return strip(doc.pages)
}

/** Dernier élément ajouté dans P1. */
const added = (doc: MaquetteDocument) => {
  const p1 = doc.pages[0]!.children[0]!
  return p1.type === 'frame' ? p1.children.at(-1)! : p1
}

async function build(operations: object[]) {
  const h = host(scene())
  const r = await runTool(h, 'appliquer', { operations })
  return { r, data: JSON.parse(r.text) as Record<string, unknown>, doc: h.current(), labels: h.labels }
}

/** La forme naturelle et la forme canonique produisent le même document. */
async function sameAs(natural: object[], canonical: object[]) {
  const a = await build(natural)
  const b = await build(canonical)
  expect(a.r.isError, a.r.text).toBeFalsy()
  expect(b.r.isError, b.r.text).toBeFalsy()
  expect(shape(a.doc)).toEqual(shape(b.doc))
  return a
}

describe('appliquer : les trois refus de l’essai réel passent', () => {
  it('1. fill (clé alias) → fills', async () => {
    const a = await sameAs(
      [{ op: 'create', parent: 'P1', node: { type: 'frame', name: 'Hero', fill: '#FBF6EE' } }],
      [{ op: 'create', parent: 'P1', node: { type: 'frame', name: 'Hero', fills: ['#FBF6EE'] } }],
    )
    expect(a.data.adapte).toEqual(['fill→fills'])
  })

  it('2. peinture objet {type:"solid",color} → couleur', async () => {
    await sameAs(
      [{ op: 'create', parent: 'P1', node: { type: 'frame', fills: [{ type: 'solid', color: '#FBF6EE' }] } }],
      [{ op: 'create', parent: 'P1', node: { type: 'frame', fills: ['#FBF6EE'] } }],
    )
  })

  it('3. enfants imbriqués → create séparés, récursivement, une seule annulation', async () => {
    const a = await sameAs(
      [{
        op: 'create', parent: 'P1', node: {
          type: 'frame', name: 'Hero', layout: { mode: 'auto', gap: 24 },
          children: [
            { type: 'text', id: '$titre', content: 'Titre', fontSize: 48 },
            { type: 'frame', name: 'Boutons', layout: { mode: 'auto' }, children: [{ type: 'text', content: 'Réserver' }, { type: 'text', content: 'Voir' }] },
          ],
        },
      }],
      [
        { op: 'create', parent: 'P1', node: { id: '$h', type: 'frame', name: 'Hero', layout: { mode: 'auto', gap: 24 } } },
        { op: 'create', parent: '$h', node: { type: 'text', id: '$titre', content: 'Titre', fontSize: 48 } },
        { op: 'create', parent: '$h', node: { id: '$b', type: 'frame', name: 'Boutons', layout: { mode: 'auto' } } },
        { op: 'create', parent: '$b', node: { type: 'text', content: 'Réserver' } },
        { op: 'create', parent: '$b', node: { type: 'text', content: 'Voir' } },
      ],
    )
    expect(a.labels).toHaveLength(1)
    // Seuls les identifiants temporaires donnés par Claude reviennent, pas ceux inventés pour relier.
    expect(Object.keys(a.data.ids as object)).toEqual(['$titre'])
    expect(a.data.adapte).toEqual(['children→create'])
  })

  it('les trois à la fois, comme dans l’essai', async () => {
    const a = await build([{
      op: 'create', parent: 'P1', node: {
        id: '$hero', type: 'frame', fill: { type: 'solid', color: '#FBF6EE' }, cornerRadius: 12,
        children: [{ type: 'text', characters: 'Bonjour', fill: { color: '#1F3D2B', opacity: 0.5 } }],
      },
    }])
    expect(a.r.isError, a.r.text).toBeFalsy()
    const hero = added(a.doc)
    expect(hero).toMatchObject({ fills: ['#FBF6EE'], radius: 12 })
    expect(hero.type === 'frame' && hero.children[0]).toMatchObject({ content: 'Bonjour', color: '#1F3D2B80' })
  })
})

describe('appliquer : formes naturelles acceptées', () => {
  const create = (node: object) => [{ op: 'create', parent: 'P1', node }]

  it('couleurs : rgb(), rgba(), #rgb, #rrggbbaa, noms CSS, {color,opacity}', async () => {
    const a = await build(create({ type: 'frame', fills: ['rgb(255, 0, 0)', 'rgba(0,0,0,0.5)', '#abc', '#11223344', 'tomato', { color: '#000000', opacity: 0.25 }] }))
    expect(a.r.isError, a.r.text).toBeFalsy()
    expect(added(a.doc)).toMatchObject({ fills: ['#FF0000', '#00000080', '#AABBCC', '#11223344', '#FF6347', '#00000040'] })
  })

  it('alias d’update, typés par l’élément existant', async () => {
    const a = await build([
      { op: 'update', id: 'R1', set: { cornerRadius: 8, backgroundColor: 'navy', hidden: false } },
      { op: 'update', id: 'T1', set: { text: 'Salut', textColor: '#333', align: 'center' } },
    ])
    expect(a.r.isError, a.r.text).toBeFalsy()
    const [, r1, t1] = a.doc.pages[0]!.children
    expect(r1).toMatchObject({ radius: 8, fills: ['#000080'], visible: true })
    expect(t1).toMatchObject({ content: 'Salut', color: '#333333', textAlign: 'center' })
  })

  it('mise en page : layoutMode, itemSpacing, padding en nombre, layout sans mode', async () => {
    const a = await sameAs(
      [
        { op: 'create', parent: 'P1', node: { type: 'frame', layoutMode: 'HORIZONTAL', itemSpacing: 16, padding: 24, clipsContent: true } },
        { op: 'create', parent: 'P1', node: { type: 'frame', layout: { direction: 'row', padding: [8, 16] } } },
      ],
      [
        { op: 'create', parent: 'P1', node: { type: 'frame', layout: { mode: 'auto', direction: 'row', gap: 16, padding: [24, 24, 24, 24] }, clip: true } },
        { op: 'create', parent: 'P1', node: { type: 'frame', layout: { mode: 'auto', direction: 'row', padding: [8, 16, 8, 16] } } },
      ],
    )
    expect(a.data.adapte).toContain('layoutMode→layout')
  })

  it('trait et ombre incomplets ou en CSS : valeurs par défaut', async () => {
    await sameAs(
      create({ type: 'shape', border: '1px solid #ddd', shadow: { y: 4, blur: 12, color: 'rgba(0,0,0,.1)' } }),
      create({ type: 'shape', stroke: { color: '#DDDDDD', width: 1, align: 'inside' }, shadows: [{ x: 0, y: 4, blur: 12, spread: 0, color: '#0000001A', inset: false }] }),
    )
    await sameAs(
      create({ type: 'shape', strokes: [{ type: 'SOLID', color: '#000' }] }),
      create({ type: 'shape', stroke: { color: '#000000', width: 1, align: 'inside' } }),
    )
  })

  it('texte : fill/fills unique = couleur du texte (Figma)', async () => {
    await sameAs(create({ type: 'text', fills: [{ type: 'solid', color: '#C2410C' }] }), create({ type: 'text', color: '#C2410C' }))
  })

  it('style.color.set accepte une peinture objet', async () => {
    const a = await build([{ op: 'style.color.set', name: 'fond', value: { type: 'solid', color: '#FBF6EE' } }])
    expect(a.r.isError, a.r.text).toBeFalsy()
    expect(a.doc.styles.colors[0]).toMatchObject({ name: 'fond', value: '#FBF6EE' })
  })

  it('la forme canonique ne produit aucune note', async () => {
    const a = await build(create({ type: 'frame', fills: ['#FFFFFF'] }))
    expect(a.data).toEqual({ ok: true })
  })
})

describe('appliquer : les cas ambigus restent refusés', () => {
  it('alias et cible présents et différents : erreur avec indice', async () => {
    const a = await build([{ op: 'update', id: 'R1', set: { cornerRadius: 8, radius: 4 } }])
    expect(a.r.isError).toBe(true)
    expect((a.data.erreurs as { message: string }[])[0]!.message).toContain('cornerRadius → radius')
  })

  it('alias et cible identiques : l’alias est simplement retiré', async () => {
    const a = await build([{ op: 'update', id: 'R1', set: { fill: '#FFFFFF', fills: ['#FFFFFF'] } }])
    expect(a.r.isError, a.r.text).toBeFalsy()
  })

  it('dégradé, couleur illisible, clé inconnue : refus comme avant', async () => {
    for (const fills of [[{ type: 'gradient', stops: [] }], ['pas-une-couleur'], [{ type: 'solid', color: '#FFF', blend: 'multiply' }]]) {
      const a = await build([{ op: 'create', parent: 'P1', node: { type: 'frame', fills } }])
      expect(a.r.isError).toBe(true)
    }
    expect((await build([{ op: 'update', id: 'R1', set: { colour: 'red' } }])).r.isError).toBe(true)
    // align sur un cadre : ambigu (layout.align ? textAlign ?) → refusé
    expect((await build([{ op: 'create', parent: 'P1', node: { type: 'frame', align: 'center' } }])).r.isError).toBe(true)
  })

  it('erreur dans un enfant imbriqué : chemin du lot envoyé, rien n’est appliqué', async () => {
    const a = await build([
      { op: 'update', id: 'R1', set: { radius: 2 } },
      { op: 'create', parent: 'P1', node: { type: 'frame', children: [{ type: 'text' }, { type: 'text', fontSize: -4 }] } },
    ])
    expect(a.r.isError).toBe(true)
    expect((a.data.erreurs as { chemin: string }[])[0]!.chemin).toMatch(/^operations\[1\]\.node\.children\[1\]/)
    expect(a.labels).toHaveLength(0)
  })
})

describe('normalizeOperations (pur)', () => {
  it('ne modifie pas l’entrée', () => {
    const ops = [{ op: 'create', parent: 'P1', node: { type: 'frame', fill: '#fff', children: [{ type: 'text' }] } }]
    const copy = structuredClone(ops)
    normalizeOperations(ops)
    expect(ops).toEqual(copy)
  })

  it('identifiants inventés sans collision avec ceux du lot', () => {
    const n = normalizeOperations([
      { op: 'create', parent: 'P1', node: { type: 'frame', children: [{ type: 'text' }] } },
      { op: 'create', parent: '$_1', node: { type: 'text' } },
    ])
    expect(n.operations[0]).toMatchObject({ node: { id: '$_2' } })
    expect(n.operations[1]).toMatchObject({ parent: '$_2' })
    expect([...n.generated]).toEqual(['$_2'])
    expect(n.origins).toEqual(['operations[0]', 'operations[0].node.children[0]', 'operations[1]'])
  })

  it('originPath', () => {
    const origins = ['operations[0]', 'operations[0].node.children[0]']
    expect(originPath('operations[1].node.fills[0]', origins)).toBe('operations[0].node.children[0].fills[0]')
    expect(originPath('operations[1] → pages[0].children[1]', origins)).toBe('operations[0].node.children[0] → pages[0].children[1]')
    expect(originPath('operations[0].node.type', origins)).toBe('operations[0].node.type')
  })

  it('paint', () => {
    expect(paint({ type: 'SOLID', color: 'white' })).toBe('#FFFFFF')
    expect(paint({ color: '#11223380', opacity: 0.5 })).toBe('#11223340')
    expect(paint({ style: 'C1' })).toEqual({ style: 'C1' })
    expect(paint({ type: 'linear', color: '#fff' })).toEqual({ type: 'linear', color: '#fff' })
  })
})
