import { describe, it, expect } from 'vitest'
import { nodeCss } from '../../src/core/css'
import { createNode } from '../../src/core/defaults'
import { parseDocument, serializeDocument } from '../../src/core/format'
import { FALLBACK_ICON, ICON_NAMES, iconKey, resolveIcon, searchIcons } from '../../src/core/icons/lucide'
import { applyOps } from '../../src/core/ops'
import { repairDocument } from '../../src/core/repair'
import { validateDocument } from '../../src/core/rules'
import type { IconNode, MaquetteDocument } from '../../src/core/types'
import { docWith, frame } from './helpers'

describe('jeu Lucide', () => {
  it('près de 1 900 icônes, triées', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(1500)
    expect(ICON_NAMES).toContain('arrow-right')
    expect([...ICON_NAMES].sort()).toEqual(ICON_NAMES)
  })

  it('noms écrits autrement', () => {
    expect(iconKey('lucide:ArrowRight')).toBe('arrow-right')
    expect(iconKey('arrowRight')).toBe('arrow-right')
    expect(iconKey('ArrowRightIcon')).toBe('arrow-right')
    expect(iconKey('arrow_right')).toBe('arrow-right')
    expect(iconKey('Heading1')).toBe('heading-1')
  })

  it('anciens noms et suffixes numériques', () => {
    expect(resolveIcon('home')).toBe('house')
    expect(resolveIcon('alert-triangle')).toBe('triangle-alert')
    expect(resolveIcon('CheckCircle')).toBe('circle-check-big')
    expect(resolveIcon('Check')).toBe('check')
    expect(resolveIcon('trash-2')).toBe('trash')
    expect(resolveIcon('pas-une-icone')).toBeNull()
  })

  it('recherche en anglais et en français, nom exact en tête', () => {
    expect(searchIcons('check')[0]).toBe('check')
    expect(searchIcons('arrow right').slice(0, 3)).toContain('arrow-right')
    expect(searchIcons('flèche droite')).toContain('arrow-right')
    expect(searchIcons('panier')).toContain('shopping-cart')
    expect(searchIcons('maison')).toContain('house')
    expect(searchIcons('zzzzqqq')).toEqual([])
    expect(searchIcons('', 5)).toHaveLength(5)
  })
})

describe('élément icône', () => {
  const page = () => docWith([frame('f00001', { x: 0, y: 0 })])

  it('valeurs par défaut : 24 × 24, trait de 2, calque nommé d’après l’icône', () => {
    const n = createNode({ type: 'icon', icon: 'check' }, 'i00001') as IconNode
    expect(n).toMatchObject({ type: 'icon', icon: 'check', set: 'lucide', name: 'check', width: 24, height: 24, strokeWidth: 2, color: '#111111' })
  })

  it('CSS : la couleur passe par currentColor', () => {
    const n = createNode({ type: 'icon', icon: 'check', color: '#C2410C', x: 0, y: 0 }, 'i00001')
    expect(nodeCss(n, null, { colors: [], text: [] })).toMatchObject({ color: '#C2410C', width: '24px', height: '24px' })
  })

  it('appliquer : nom normalisé, inconnu remplacé (jamais refusé), le calque suit l’icône', () => {
    const r = applyOps(page(), [
      { op: 'create', parent: 'f00001', node: { id: '$a', type: 'icon', icon: 'lucide:ArrowRight', color: 'tomato', x: 10, y: 10 } },
      { op: 'create', parent: 'f00001', node: { id: '$b', type: 'icon', icon: 'licorne-volante', x: 40, y: 10 } },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const f = r.doc.pages[0]!.children[0]! as { children: IconNode[] }
    expect(f.children[0]).toMatchObject({ icon: 'arrow-right', name: 'arrow-right', color: '#FF6347' })
    expect(f.children[1]!.icon).toBe(FALLBACK_ICON)
    expect(r.fixes.join(' ')).toMatch(/licorne-volante/)

    const u = applyOps(r.doc, [{ op: 'update', id: r.ids.$a!, set: { icon: 'home', strokeWidth: 1.5 } }])
    expect(u.ok).toBe(true)
    if (!u.ok) return
    expect((u.doc.pages[0]!.children[0] as { children: IconNode[] }).children[0]).toMatchObject({ icon: 'house', name: 'house', strokeWidth: 1.5 })
  })

  it('pas de contour ni d’ombre sur une icône', () => {
    const r = applyOps(page(), [{ op: 'create', parent: 'f00001', node: { type: 'icon', icon: 'check', stroke: { color: '#000000', width: 1, align: 'inside' } } as never }])
    expect(r.ok).toBe(false)
  })

  it('fichier : aller-retour, réparation d’un nom inconnu ou ancien, propriétés en trop retirées', () => {
    const doc: MaquetteDocument = docWith([createNode({ type: 'icon', icon: 'star', x: 0, y: 0 }, 'i00001')])
    const back = parseDocument(serializeDocument(doc))
    expect(back.ok && back.doc).toEqual(doc)

    const raw = JSON.parse(serializeDocument(doc)) as { pages: { children: Record<string, unknown>[] }[] }
    raw.pages[0]!.children.push({ ...raw.pages[0]!.children[0]!, id: 'i00002', icon: 'home', shadows: [] })
    raw.pages[0]!.children.push({ ...raw.pages[0]!.children[0]!, id: 'i00003', icon: 'nexistepas', set: 'fontawesome' })
    const { doc: fixed, warnings } = repairDocument(raw as unknown as Record<string, unknown>)
    const icons = (fixed as MaquetteDocument).pages[0]!.children as IconNode[]
    expect(icons.map((i) => i.icon)).toEqual(['star', 'house', FALLBACK_ICON])
    expect(icons[2]!.set).toBe('lucide')
    expect(warnings.map((w) => w.path)).toEqual(expect.arrayContaining(['pages[0].children[1].icon', 'pages[0].children[1].shadows', 'pages[0].children[2].icon', 'pages[0].children[2].set']))
    expect(validateDocument(fixed as MaquetteDocument)).toEqual([])
  })

  it('couleur nommée : validée et détachée', () => {
    const r = applyOps(page(), [
      { op: 'style.color.set', id: '$c', name: 'encre', value: '#222222' },
      { op: 'create', parent: 'f00001', node: { id: '$i', type: 'icon', icon: 'check', color: { style: '$c' } } },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const d = applyOps(r.doc, [{ op: 'style.delete', id: r.ids.$c! }])
    expect(d.ok && (d.doc.pages[0]!.children[0] as { children: IconNode[] }).children[0]!.color).toBe('#222222')
  })
})

describe('icône d’un autre jeu', () => {
  const page = () => docWith([frame('f00001', { x: 0, y: 0 })])
  const icons = (doc: MaquetteDocument) => (doc.pages[0]!.children[0] as { children: IconNode[] }).children

  it('créer : jeu nommé librement, nom ramené au jeu, variante convertie', () => {
    const r = applyOps(page(), [
      { op: 'create', parent: 'f00001', node: { type: 'icon', set: 'phosphor', icon: 'CaretRight', weight: 700 as never, x: 0, y: 0 } },
      { op: 'create', parent: 'f00001', node: { type: 'icon', set: 'Material Symbols Rounded' as never, icon: 'ContentCut', weight: 600, filled: true, x: 0, y: 0 } },
      { op: 'create', parent: 'f00001', node: { type: 'icon', set: 'feather', icon: 'clock', weight: 'bold', filled: true, x: 0, y: 0 } },
      { op: 'create', parent: 'f00001', node: { type: 'icon', set: 'phosphor', icon: 'licorne', x: 0, y: 0 } },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [ph, ma, fe, unknown] = icons(r.doc)
    expect(ph).toMatchObject({ set: 'phosphor', icon: 'caret-right', name: 'caret-right', weight: 'bold' })
    expect(ma).toMatchObject({ set: 'material-rounded', icon: 'content_cut', weight: 600, filled: true })
    expect(fe).toMatchObject({ set: 'feather', icon: 'clock' })
    expect(fe).not.toHaveProperty('weight')
    expect(fe).not.toHaveProperty('filled')
    expect(unknown).toMatchObject({ set: 'phosphor', icon: 'question' })
    expect(r.fixes.join(' ')).toMatch(/licorne/)
  })

  it('modifier : changer de jeu garde le nom s’il existe et convertit la variante', () => {
    const r = applyOps(page(), [{ op: 'create', parent: 'f00001', node: { id: '$i', type: 'icon', set: 'phosphor', icon: 'star', weight: 'light', x: 0, y: 0 } }])
    if (!r.ok) throw new Error('création refusée')
    const id = r.ids.$i!
    const m = applyOps(r.doc, [{ op: 'update', id, set: { set: 'material-rounded' } }])
    if (!m.ok) throw new Error(JSON.stringify(m.errors))
    expect(icons(m.doc)[0]).toMatchObject({ set: 'material-rounded', icon: 'star', weight: 300 })
    const l = applyOps(m.doc, [{ op: 'update', id, set: { set: 'lucide', icon: 'house' } }])
    if (!l.ok) throw new Error(JSON.stringify(l.errors))
    expect(icons(l.doc)[0]).toMatchObject({ set: 'lucide', icon: 'house' })
    expect(icons(l.doc)[0]).not.toHaveProperty('weight')
    const f = applyOps(m.doc, [{ op: 'update', id, set: { filled: true, weight: null } }])
    if (!f.ok) throw new Error(JSON.stringify(f.errors))
    expect(icons(f.doc)[0]).toMatchObject({ filled: true })
    expect(icons(f.doc)[0]).not.toHaveProperty('weight')
  })

  it('valeurs par défaut : pas de variante enregistrée', () => {
    const n = createNode({ type: 'icon', set: 'phosphor', icon: 'quotes' }, 'i00001') as IconNode
    expect(n).toMatchObject({ set: 'phosphor', icon: 'quotes', name: 'quotes' })
    expect(n.weight).toBeUndefined()
  })

  it('validation : variante qui ne va pas avec le jeu refusée', () => {
    const bad = (extra: Partial<IconNode>) => validateDocument(docWith([{ ...createNode({ type: 'icon', icon: 'star', x: 0, y: 0 }, 'i00001'), ...extra } as IconNode]))
    expect(bad({ set: 'phosphor', weight: 'bold' })).toEqual([])
    expect(bad({ set: 'material-rounded', weight: 300, filled: true })).toEqual([])
    expect(bad({ set: 'phosphor', weight: 300 }).map((i) => i.path)).toEqual(['pages[0].children[0].weight'])
    expect(bad({ set: 'lucide', weight: 'bold' }).length).toBeGreaterThan(0)
    expect(bad({ set: 'feather', filled: true }).length).toBeGreaterThan(0)
    expect(bad({ set: 'material-rounded', weight: 350 }).length).toBeGreaterThan(0)
  })

  it('fichier : aller-retour et réparation (variante convertie ou retirée, nom du bon jeu)', () => {
    const doc: MaquetteDocument = docWith([createNode({ type: 'icon', set: 'material-rounded', icon: 'grass', weight: 300, filled: true, x: 0, y: 0 }, 'i00001')])
    const back = parseDocument(serializeDocument(doc))
    expect(back.ok && back.doc).toEqual(doc)

    const raw = JSON.parse(serializeDocument(doc)) as { pages: { children: Record<string, unknown>[] }[] }
    const first = raw.pages[0]!.children[0]!
    raw.pages[0]!.children.push({ ...first, id: 'i00002', set: 'phosphor', icon: 'CaretRight', weight: 600, filled: true })
    raw.pages[0]!.children.push({ ...first, id: 'i00003', set: 'feather', icon: 'clock', weight: 400 })
    raw.pages[0]!.children.push({ ...first, id: 'i00004', set: 'Material Symbols Rounded', icon: 'yard', weight: 'bold' })
    const { doc: fixed, warnings } = repairDocument(raw as unknown as Record<string, unknown>)
    const list = (fixed as MaquetteDocument).pages[0]!.children as IconNode[]
    expect(list[1]).toMatchObject({ set: 'phosphor', icon: 'caret-right', weight: 'bold' })
    expect(list[1]!.filled).toBeUndefined()
    expect(list[2]!.weight).toBeUndefined()
    expect(list[3]).toMatchObject({ set: 'material-rounded', icon: 'yard', weight: 700 })
    expect(warnings.map((w) => w.path)).toEqual(expect.arrayContaining(['pages[0].children[1].weight', 'pages[0].children[1].filled', 'pages[0].children[2].weight', 'pages[0].children[3].set']))
    expect(validateDocument(fixed as MaquetteDocument)).toEqual([])
  })
})
