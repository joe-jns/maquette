import { describe, it, expect } from 'vitest'
import { applyPatches, freeze } from 'immer'
import {
  findInInstance, instanceOverrides, instantiate, overrideProps, replaceInInstance, setLocalChildren, syncInstances,
} from '../../src/core/components'
import { parseDocument, serializeDocument } from '../../src/core/format'
import { applyOps, type Op } from '../../src/core/ops'
import { validateDocument } from '../../src/core/rules'
import { findNode, walk } from '../../src/core/tree'
import type { FrameNode, MaquetteDocument, Node, TextNode } from '../../src/core/types'
import { docWith, frame, rect, text } from './helpers'

const ok = (r: ReturnType<typeof applyOps>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r
}
const refused = (r: ReturnType<typeof applyOps>): string => {
  if (r.ok) throw new Error('accepté à tort')
  return r.errors.map((e) => e.message).join(' | ')
}
const get = <T extends Node = FrameNode>(doc: MaquetteDocument, id: string) => findNode(doc, id)!.node as T
const pageId = (doc: MaquetteDocument) => doc.pages[0]!.id
/** Copie de `sourceId` dans l'instance `root`. */
const copyOf = <T extends Node = TextNode>(doc: MaquetteDocument, root: string, sourceId: string): T => {
  let found: Node | undefined
  const visit = (n: Node) => {
    if (n.source === sourceId) found ??= n
    if (n.type === 'frame') n.children.forEach(visit)
  }
  visit(get(doc, root))
  return found as T
}

/** Bouton (principal) : cadre automatique « Bouton » avec un libellé et une pastille. */
function buttonDoc(): MaquetteDocument {
  const button = frame('btn001', {
    x: 0, y: 0, name: 'Bouton', width: { mode: 'hug' }, height: { mode: 'hug' }, fills: ['#112233'],
    layout: { mode: 'auto', direction: 'row', gap: 8, padding: [8, 16, 8, 16] },
  }) as FrameNode
  button.children = [text('lbl001', { content: 'Envoyer', color: '#FFFFFF' }), rect('dot001', { width: 8, height: 8 })]
  return docWith([button])
}

/** Principal « Bouton » et une instance « $i » posée à (300, 0). */
function withInstance(): { doc: MaquetteDocument; inst: string } {
  const doc = buttonDoc()
  const r = ok(applyOps(doc, [
    { op: 'update', id: 'btn001', set: { component: true } },
    { op: 'create', parent: pageId(doc), node: { id: '$i', type: 'frame', instanceOf: 'btn001', x: 300, y: 0 } },
  ]))
  return { doc: r.doc, inst: r.ids.$i! }
}

describe('composants : création', () => {
  it('update {component:true} fait un principal ; create {instanceOf} copie tout le sous-arbre', () => {
    const { doc, inst } = withInstance()
    expect(get(doc, 'btn001').component).toBe(true)
    const i = get(doc, inst)
    expect(i).toMatchObject({ instanceOf: 'btn001', name: 'Bouton', x: 300, y: 0, fills: ['#112233'], layout: { mode: 'auto', gap: 8 } })
    expect(i.component).toBeUndefined()
    expect(i.source).toBeUndefined()
    expect(i.children.map((c) => c.source)).toEqual(['lbl001', 'dot001'])
    expect(i.children.map((c) => c.id)).not.toContain('lbl001')
    expect((i.children[0] as TextNode).content).toBe('Envoyer')
    expect(validateDocument(doc)).toEqual([])
  })

  it('refuse une instance d’un cadre qui n’est pas un composant', () => {
    const doc = buttonDoc()
    expect(refused(applyOps(doc, [{ op: 'create', parent: pageId(doc), node: { type: 'frame', instanceOf: 'btn001' } }]))).toContain('composant principal introuvable')
  })

  it('descendants à la création : surcharges par id du principal', () => {
    const doc = withInstance().doc
    const r = ok(applyOps(doc, [{
      op: 'create', parent: pageId(doc),
      node: { id: '$j', type: 'frame', instanceOf: 'btn001', x: 0, y: 100, fills: ['#FF0000'], descendants: { lbl001: { content: 'Payer' }, dot001: { visible: false } } },
    }]))
    const j = r.ids.$j!
    expect(get(r.doc, j)).toMatchObject({ fills: ['#FF0000'], overrides: ['fills'] })
    expect(copyOf(r.doc, j, 'lbl001')).toMatchObject({ content: 'Payer', overrides: ['content'] })
    expect(copyOf(r.doc, j, 'dot001')).toMatchObject({ visible: false, overrides: ['visible'] })
  })
})

describe('composants : synchronisation', () => {
  it('modifier le principal met l’instance à jour, en une seule annulation', () => {
    const { doc, inst } = withInstance()
    const r = ok(applyOps(doc, [{ op: 'update', id: 'lbl001', set: { content: 'Valider', fontSize: 20 } }]))
    expect(copyOf(r.doc, inst, 'lbl001')).toMatchObject({ content: 'Valider', fontSize: 20 })
    const undone = applyPatches(r.doc, r.inversePatches)
    expect(copyOf(undone, inst, 'lbl001').content).toBe('Envoyer')
    expect(get<TextNode>(undone, 'lbl001').content).toBe('Envoyer')
    expect(undone).toEqual(doc)
  })

  it('une surcharge de l’instance survit aux changements du principal ; le reste suit', () => {
    const { doc, inst } = withInstance()
    const label = copyOf(doc, inst, 'lbl001').id
    const r1 = ok(applyOps(doc, [{ op: 'update', id: label, set: { content: 'Payer' } }]))
    expect(copyOf(r1.doc, inst, 'lbl001').overrides).toEqual(['content'])
    const r2 = ok(applyOps(r1.doc, [{ op: 'update', id: 'lbl001', set: { content: 'Valider', color: '#00FF00' } }]))
    expect(copyOf(r2.doc, inst, 'lbl001')).toMatchObject({ content: 'Payer', color: '#00FF00' })
  })

  it('la position, la taille et le nom de la racine restent locaux', () => {
    const { doc, inst } = withInstance()
    const r1 = ok(applyOps(doc, [{ op: 'update', id: inst, set: { x: 500, name: 'Mon bouton' } }]))
    expect(get(r1.doc, inst).overrides).toBeUndefined()
    const r2 = ok(applyOps(r1.doc, [{ op: 'update', id: 'btn001', set: { x: 40, name: 'Bouton 2', fills: ['#445566'] } }]))
    expect(get(r2.doc, inst)).toMatchObject({ x: 500, name: 'Mon bouton', fills: ['#445566'] })
  })

  it('ajout, suppression et réordonnancement dans le principal sont reportés', () => {
    const { doc, inst } = withInstance()
    const r1 = ok(applyOps(doc, [{ op: 'create', parent: 'btn001', index: 0, node: { id: '$ico', type: 'icon', icon: 'star' } }]))
    const ico = r1.ids.$ico!
    const i1 = get(r1.doc, inst)
    expect(i1.children.map((c) => c.source)).toEqual([ico, 'lbl001', 'dot001'])
    expect(i1.children[0]!.id).not.toBe(ico)
    const r2 = ok(applyOps(r1.doc, [{ op: 'move', id: 'dot001', parent: 'btn001', index: 0 }, { op: 'delete', id: ico }]))
    expect(get(r2.doc, inst).children.map((c) => c.source)).toEqual(['dot001', 'lbl001'])
    expect(validateDocument(r2.doc)).toEqual([])
  })

  it('aperçu d’un geste : l’instance suit aussi (document gelé)', () => {
    const { doc, inst } = withInstance()
    freeze(doc, true)
    const r = ok(applyOps(doc, [{ op: 'update', id: 'dot001', set: { width: 30 } }], { preview: true }))
    expect(copyOf(r.doc, inst, 'dot001').width).toBe(30)
  })

  it('une modification hors composant ne touche aucune instance', () => {
    const { doc, inst } = withInstance()
    const r = ok(applyOps(doc, [{ op: 'create', parent: pageId(doc), node: { type: 'shape' } }]))
    expect(get(r.doc, inst)).toBe(get(doc, inst))
  })
})

describe('composants : règles dans une instance', () => {
  it('ajouter, supprimer, déplacer dans une instance est refusé', () => {
    const { doc, inst } = withInstance()
    const label = copyOf(doc, inst, 'lbl001').id
    expect(refused(applyOps(doc, [{ op: 'create', parent: inst, node: { type: 'text' } }]))).toContain('est une instance')
    expect(refused(applyOps(doc, [{ op: 'delete', id: label }]))).toContain('est une instance')
    expect(refused(applyOps(doc, [{ op: 'move', id: label, parent: inst, index: 1 }]))).toContain('est une instance')
    expect(refused(applyOps(doc, [{ op: 'move', id: label, parent: pageId(doc) }]))).toContain('est une instance')
    expect(refused(applyOps(doc, [{ op: 'move', id: 'btn001', parent: inst }]))).toContain('est une instance')
  })

  it('cacher un calque d’instance est une surcharge ; supprimer ou déplacer l’instance elle-même est permis', () => {
    const { doc, inst } = withInstance()
    const dot = copyOf(doc, inst, 'dot001').id
    const r = ok(applyOps(doc, [{ op: 'update', id: dot, set: { visible: false } }]))
    expect(copyOf(r.doc, inst, 'dot001')).toMatchObject({ visible: false, overrides: ['visible'] })
    ok(applyOps(r.doc, [{ op: 'update', id: inst, set: { x: 10, y: 10 } }, { op: 'delete', id: inst }]))
  })

  it('changer le mode de mise en page d’un calque d’instance est refusé', () => {
    const { doc, inst } = withInstance()
    expect(refused(applyOps(doc, [{ op: 'update', id: inst, set: { layout: { mode: 'free' } } }]))).toContain('mise en page')
    const r = ok(applyOps(doc, [{ op: 'update', id: inst, set: { layout: { mode: 'auto', gap: 20 } } }]))
    expect(get(r.doc, inst)).toMatchObject({ layout: { gap: 20 }, overrides: ['layout'] })
  })

  it('source, overrides et instanceOf ne s’écrivent pas à la main', () => {
    const { doc, inst } = withInstance()
    const label = copyOf(doc, inst, 'lbl001').id
    expect(refused(applyOps(doc, [{ op: 'update', id: label, set: { source: 'x' } }]))).toContain('non modifiable')
    expect(refused(applyOps(doc, [{ op: 'update', id: label, set: { overrides: ['content'] } }]))).toContain('overrides')
    expect(refused(applyOps(doc, [{ op: 'update', id: inst, set: { instanceOf: 'abc' } }]))).toContain('création')
    expect(refused(applyOps(doc, [{ op: 'create', parent: pageId(doc), node: { type: 'frame', source: 'lbl001' } as never }]))).toContain('géré par Maquette')
  })
})

describe('composants : rétablir, détacher, supprimer', () => {
  it('overrides:null rétablit le principal (racine : tout sauf position, taille, nom)', () => {
    const { doc, inst } = withInstance()
    const label = copyOf(doc, inst, 'lbl001').id
    const r1 = ok(applyOps(doc, [
      { op: 'update', id: label, set: { content: 'Payer' } },
      { op: 'update', id: inst, set: { fills: ['#FF0000'], x: 900, name: 'Local' } },
    ]))
    const r2 = ok(applyOps(r1.doc, [{ op: 'update', id: inst, set: { overrides: null } }]))
    const i = get(r2.doc, inst)
    expect(i).toMatchObject({ fills: ['#112233'], x: 900, name: 'Local' })
    expect(i.overrides).toBeUndefined()
    expect(copyOf(r2.doc, inst, 'lbl001').content).toBe('Envoyer')
    expect(copyOf(r2.doc, inst, 'lbl001').overrides).toBeUndefined()
  })

  it('instanceOf:null détache tout le sous-arbre', () => {
    const { doc, inst } = withInstance()
    const r = ok(applyOps(doc, [{ op: 'update', id: inst, set: { instanceOf: null } }]))
    walk(r.doc, ({ node }) => {
      if (node.id === 'btn001' || node.id === 'lbl001' || node.id === 'dot001') return
      expect(node.source).toBeUndefined()
      expect((node as FrameNode).instanceOf).toBeUndefined()
    })
    // Détachée, l'instance ne suit plus le principal et accepte de nouveaux calques.
    const r2 = ok(applyOps(r.doc, [{ op: 'update', id: 'lbl001', set: { content: 'Autre' } }, { op: 'create', parent: inst, node: { type: 'text' } }]))
    expect((get(r2.doc, inst).children[0] as TextNode).content).toBe('Envoyer')
  })

  it('supprimer le principal détache ses instances ; component:false aussi', () => {
    const { doc, inst } = withInstance()
    const r = ok(applyOps(doc, [{ op: 'delete', id: 'btn001' }]))
    expect(get(r.doc, inst).instanceOf).toBeUndefined()
    expect(get(r.doc, inst).children.every((c) => c.source === undefined)).toBe(true)
    const r2 = ok(applyOps(doc, [{ op: 'update', id: 'btn001', set: { component: false } }]))
    expect(get(r2.doc, 'btn001').component).toBeUndefined()
    expect(get(r2.doc, inst).instanceOf).toBeUndefined()
    expect(validateDocument(r2.doc)).toEqual([])
  })

  it('supprimer la page du principal détache les instances des autres pages', () => {
    const { doc, inst } = withInstance()
    const r1 = ok(applyOps(doc, [{ op: 'page.create', id: '$p', name: 'Autre' }]))
    const page2 = r1.ids.$p!
    const r2 = ok(applyOps(r1.doc, [{ op: 'move', id: inst, parent: page2, x: 0, y: 0 }]))
    const r3 = ok(applyOps(r2.doc, [{ op: 'page.delete', id: pageId(doc) }]))
    expect(get(r3.doc, inst).instanceOf).toBeUndefined()
  })
})

/**
 * Carte (principal M) qui contient une instance du bouton (principal N) ; instance J de la carte.
 */
function nestedDoc() {
  const base = withInstance()
  const r1 = ok(applyOps(base.doc, [
    { op: 'create', parent: pageId(base.doc), node: { id: '$card', type: 'frame', name: 'Carte', x: 0, y: 300, width: 300, height: { mode: 'hug' }, layout: { mode: 'auto' }, component: true } },
    { op: 'create', parent: '$card', node: { id: '$title', type: 'text', content: 'Titre' } },
    { op: 'create', parent: '$card', node: { id: '$i1', type: 'frame', instanceOf: 'btn001' } },
  ]))
  const card = r1.ids.$card!
  const i1 = r1.ids.$i1!
  const r2 = ok(applyOps(r1.doc, [{ op: 'create', parent: pageId(base.doc), node: { id: '$j', type: 'frame', instanceOf: card, x: 400, y: 300 } }]))
  return { doc: r2.doc, card, i1, title: r1.ids.$title!, j: r2.ids.$j! }
}

describe('composants : instances imbriquées', () => {
  it('l’instance d’une carte contient la copie de l’instance du bouton', () => {
    const { doc, i1, j } = nestedDoc()
    const j1 = copyOf<FrameNode>(doc, j, i1)
    expect(j1).toMatchObject({ instanceOf: 'btn001', source: i1 })
    // Les calques de J1 désignent ceux de I1 (dans la carte), pas ceux du bouton.
    const i1Label = copyOf(doc, i1, 'lbl001').id
    expect(j1.children.map((c) => c.source)).toContain(i1Label)
    expect(validateDocument(doc)).toEqual([])
  })

  it('modifier le bouton met à jour I1 puis J (cascade) ; une surcharge de I1 passe dans J', () => {
    const { doc, i1, j } = nestedDoc()
    const r1 = ok(applyOps(doc, [{ op: 'update', id: 'lbl001', set: { content: 'Voir' } }]))
    const i1Label = copyOf(r1.doc, i1, 'lbl001')
    expect(i1Label.content).toBe('Voir')
    expect(copyOf(r1.doc, j, i1Label.id).content).toBe('Voir')
    const r2 = ok(applyOps(r1.doc, [{ op: 'update', id: i1Label.id, set: { content: 'Acheter' } }]))
    expect(copyOf(r2.doc, j, i1Label.id).content).toBe('Acheter')
    // Annuler revient en une fois, cascade comprise.
    expect(applyPatches(r2.doc, r2.inversePatches)).toEqual(r1.doc)
  })

  it('une surcharge dans J tient quand le bouton change', () => {
    const { doc, i1, j } = nestedDoc()
    const i1Label = copyOf(doc, i1, 'lbl001').id
    const jLabel = copyOf(doc, j, i1Label).id
    const r1 = ok(applyOps(doc, [{ op: 'update', id: jLabel, set: { content: 'Local' } }]))
    const r2 = ok(applyOps(r1.doc, [{ op: 'update', id: 'lbl001', set: { content: 'Voir', fontSize: 30 } }]))
    expect(copyOf(r2.doc, j, i1Label)).toMatchObject({ content: 'Local', fontSize: 30 })
  })

  it('boucles refusées : une carte dans elle-même, un bouton qui contiendrait la carte', () => {
    const { doc, card } = nestedDoc()
    expect(refused(applyOps(doc, [{ op: 'create', parent: card, node: { type: 'frame', instanceOf: card } }]))).toContain('boucle')
    expect(refused(applyOps(doc, [{ op: 'create', parent: 'btn001', node: { type: 'frame', instanceOf: card } }]))).toContain('boucle')
    // Un cadre qui contient une instance de la carte ne peut pas entrer dans le bouton.
    const r = ok(applyOps(doc, [{ op: 'create', parent: pageId(doc), node: { id: '$w', type: 'frame', x: 0, y: 900 } }, { op: 'create', parent: '$w', node: { type: 'frame', instanceOf: card } }]))
    expect(refused(applyOps(r.doc, [{ op: 'move', id: r.ids.$w!, parent: 'btn001' }]))).toContain('boucle')
  })

  it('détacher J garde J1 comme instance indépendante du bouton', () => {
    const { doc, i1, j } = nestedDoc()
    const j1 = copyOf<FrameNode>(doc, j, i1).id
    const r = ok(applyOps(doc, [{ op: 'update', id: j, set: { instanceOf: null } }]))
    const node = get(r.doc, j1)
    expect(node).toMatchObject({ instanceOf: 'btn001' })
    expect(node.source).toBeUndefined()
    expect(node.children.map((c) => c.source)).toEqual(['lbl001', 'dot001'])
    expect(validateDocument(r.doc)).toEqual([])
    const r2 = ok(applyOps(r.doc, [{ op: 'update', id: 'lbl001', set: { content: 'Suivi' } }]))
    expect(copyOf(r2.doc, j1, 'lbl001').content).toBe('Suivi')
  })

  it('supprimer le bouton détache I1 et retire le lien de J1', () => {
    const { doc, i1, j } = nestedDoc()
    const r = ok(applyOps(doc, [{ op: 'delete', id: 'btn001' }]))
    expect(get(r.doc, i1).instanceOf).toBeUndefined()
    expect(copyOf<FrameNode>(r.doc, j, i1).instanceOf).toBeUndefined()
    expect(validateDocument(r.doc)).toEqual([])
  })
})

describe('composants : validation, réparation, fichier', () => {
  it('le validateur repère instance orpheline, source inconnue, boucle', () => {
    const { doc, inst } = withInstance()
    const broken = structuredClone(doc)
    const i = broken.pages[0]!.children.find((n) => n.id === inst) as FrameNode
    i.children[0]!.source = 'zzz999'
    expect(validateDocument(broken).map((x) => x.message).join()).toContain('source inconnue')
    i.instanceOf = 'nope99'
    expect(validateDocument(broken).map((x) => x.message).join()).toContain('composant principal introuvable')
    const loop = structuredClone(doc)
    const main = loop.pages[0]!.children[0] as FrameNode
    main.children.push({ ...structuredClone(get(doc, inst)), id: 'cyc001', children: [] } as FrameNode)
    expect(validateDocument(loop).map((x) => x.message).join()).toContain('boucle')
  })

  it('la réparation détache une instance orpheline et rend locale une source inconnue', () => {
    const { doc, inst } = withInstance()
    const raw = JSON.parse(serializeDocument(doc))
    const i = raw.pages[0].children.find((n: Node) => n.id === inst)
    i.children[1].source = 'zzz999'
    let parsed = parseDocument(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // Source inconnue : calque local, gardé à son rang ; la synchronisation remet la copie du calque manquant.
    const fixed = get(parsed.doc, inst)
    expect(fixed.children.map((c) => c.source)).toEqual(['lbl001', undefined, 'dot001'])
    i.instanceOf = 'nope99'
    parsed = parseDocument(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(get(parsed.doc, inst).instanceOf).toBeUndefined()
    expect(parsed.warnings.map((w) => w.message).join()).toContain('instance detached')
  })

  it('la réparation coupe une boucle', () => {
    const { doc, inst } = withInstance()
    const raw = JSON.parse(serializeDocument(doc))
    raw.pages[0].children[0].children.push({ ...JSON.parse(JSON.stringify(get(doc, inst))), id: 'cyc001', children: [] })
    const parsed = parseDocument(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(get(parsed.doc, 'cyc001').instanceOf).toBeUndefined()
  })

  it('un fichier enregistré se rouvre identique ; la version du format reste 1', () => {
    const { doc } = nestedDoc()
    const parsed = parseDocument(serializeDocument(doc))
    expect(parsed.ok && parsed.doc).toEqual(doc)
    expect(doc.version).toBe(1)
  })
})

describe('composants : aides pour l’import', () => {
  it('instantiate + findInInstance + overrideProps + syncInstances', () => {
    const { doc, card, i1 } = nestedDoc()
    const copy = structuredClone(doc)
    const root = instantiate(copy, card)
    expect(root).toMatchObject({ instanceOf: card, x: 0, y: 0, position: 'flow' })
    copy.pages[0]!.children.push(root)
    // Chemin à la Pen : instance imbriquée puis calque de son principal.
    const label = findInInstance(copy, root, `${i1}/lbl001`)!
    expect(label.type).toBe('text')
    overrideProps(label, { content: 'Importé' })
    expect(label.overrides).toEqual(['content'])
    expect(findInInstance(copy, root, 'nope')).toBeNull()
    expect(validateDocument(copy)).toEqual([])
    // Le principal change hors d'applyOps : syncInstances remet tout d'accord, surcharges gardées.
    ;(findNode(copy, 'lbl001')!.node as TextNode).fontSize = 40
    const synced = syncInstances(copy)
    expect(synced).not.toBe(copy)
    expect(findInInstance(synced, findNode(synced, root.id)!.node as FrameNode, `${i1}/lbl001`)).toMatchObject({ content: 'Importé', fontSize: 40 })
    expect(syncInstances(synced)).toBe(synced)
  })

  it('slot et remplacement : calques locaux gardés par la synchronisation', () => {
    const { doc, inst } = withInstance()
    const copy = structuredClone(doc)
    const root = findNode(copy, inst)!.node as FrameNode
    const dot = root.children[1]!
    replaceInInstance(root, dot, text('rpl001', { content: 'Remplacé' }))
    ;(copy.pages[0]!.children[0] as FrameNode).children.push(frame('mslot1', { width: 10, height: 10 }))
    const synced0 = syncInstances(copy)
    const r0 = findNode(synced0, inst)!.node as FrameNode
    const slotCopy = r0.children.find((c) => c.source === 'mslot1') as FrameNode
    setLocalChildren(slotCopy, [text('loc001', { content: 'Dans le slot', x: 0, y: 0 })])
    expect(validateDocument(synced0)).toEqual([])
    ;(findNode(synced0, 'dot001')!.node as Node).opacity = 0.5
    const synced = syncInstances(synced0)
    const r = findNode(synced, inst)!.node as FrameNode
    expect(r.children.find((c) => c.source === 'dot001')).toMatchObject({ id: 'rpl001', type: 'text', content: 'Remplacé' })
    expect((r.children.find((c) => c.source === 'mslot1') as FrameNode).children.map((c) => c.id)).toEqual(['loc001'])
  })

  it('instanceOverrides exprime les surcharges dans l’espace du principal', () => {
    const { doc, i1, j } = nestedDoc()
    const i1Label = copyOf(doc, i1, 'lbl001').id
    const jLabel = copyOf(doc, j, i1Label).id
    const r = ok(applyOps(doc, [{ op: 'update', id: jLabel, set: { content: 'Local' } }, { op: 'update', id: j, set: { opacity: 0.5 } }]))
    expect(instanceOverrides(r.doc, get(r.doc, j))).toEqual({ root: { opacity: 0.5 }, descendants: { [i1Label]: { content: 'Local' } } })
    // Copie imbriquée seule : clés dans l'espace du bouton.
    const j1 = copyOf<FrameNode>(r.doc, j, i1)
    expect(instanceOverrides(r.doc, j1).descendants).toEqual({ lbl001: { content: 'Local' } })
  })
})

describe('composants : performance', () => {
  it('40 instances d’un principal de 60 calques : une modification du principal reste rapide', () => {
    const doc = docWith([frame('main01', { x: 0, y: 0, width: 400, height: { mode: 'hug' }, layout: { mode: 'auto' }, component: true })])
    const ops: Op[] = []
    for (let k = 0; k < 60; k++) ops.push({ op: 'create', parent: 'main01', node: { type: 'text', content: `Ligne ${k}` } })
    for (let k = 0; k < 40; k++) ops.push({ op: 'create', parent: pageId(doc), node: { type: 'frame', instanceOf: 'main01', x: 500 * k, y: 0 } })
    const built = ok(applyOps(doc, ops)).doc
    freeze(built, true)
    const first = (get(built, 'main01').children[0] as TextNode).id
    const t0 = performance.now()
    const r = ok(applyOps(built, [{ op: 'update', id: first, set: { content: 'Changé' } }], { preview: true }))
    const elapsed = performance.now() - t0
    let count = 0
    walk(r.doc, ({ node }) => {
      if (node.source === first && (node as TextNode).content === 'Changé') count++
    })
    expect(count).toBe(40)
    expect(elapsed).toBeLessThan(500)
  })
})
