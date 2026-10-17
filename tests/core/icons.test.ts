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
    raw.pages[0]!.children.push({ ...raw.pages[0]!.children[0]!, id: 'i00003', icon: 'nexistepas', set: 'phosphor' })
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
