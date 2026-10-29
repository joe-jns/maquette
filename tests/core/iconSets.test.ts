import { describe, it, expect } from 'vitest'
import {
  FALLBACK_ICONS, ICON_SETS, iconNames, normalizeIconWeight, penIconSet, resolveIconIn, searchIconsIn, toIconSet,
} from '../../src/core/icons/sets'

describe('jeux d’icônes', () => {
  it('quatre jeux, noms triés, icônes de repli présentes', () => {
    expect(ICON_SETS).toEqual(['lucide', 'phosphor', 'feather', 'material-rounded'])
    expect(iconNames('phosphor').length).toBeGreaterThan(1400)
    expect(iconNames('feather').length).toBeGreaterThan(250)
    expect(iconNames('material-rounded').length).toBeGreaterThan(3500)
    for (const set of ICON_SETS) {
      expect([...iconNames(set)].sort()).toEqual(iconNames(set))
      expect(iconNames(set)).toContain(FALLBACK_ICONS[set])
    }
  })

  it('les icônes des fichiers .pen de l’utilisateur existent', () => {
    for (const n of ['cell-signal-full', 'caret-right', 'currency-eur', 'youtube-logo', 'tiktok-logo', 'quotes']) expect(resolveIconIn('phosphor', n)).toBe(n)
    expect(resolveIconIn('feather', 'clock')).toBe('clock')
    for (const n of ['grass', 'content_cut', 'yard', 'forest', 'compost', 'inventory_2']) expect(resolveIconIn('material-rounded', n)).toBe(n)
  })

  it('noms écrits autrement, ramenés au jeu', () => {
    expect(resolveIconIn('phosphor', 'CaretRight')).toBe('caret-right')
    expect(resolveIconIn('phosphor', 'ph:caret-right-bold')).toBe('caret-right')
    expect(resolveIconIn('phosphor', 'caduceus')).toBe('asclepius')
    expect(resolveIconIn('feather', 'Edit2')).toBe('edit-2')
    expect(resolveIconIn('material-rounded', 'ContentCut')).toBe('content_cut')
    expect(resolveIconIn('material-rounded', 'inventory-2')).toBe('inventory_2')
    expect(resolveIconIn('material-rounded', '10k')).toBe('10k')
    expect(resolveIconIn('lucide', 'home')).toBe('house')
    expect(resolveIconIn('phosphor', 'licorne-volante')).toBeNull()
    expect(resolveIconIn('material-rounded', 'arrow-right-bold')).toBeNull()
  })

  it('recherche par jeu, en anglais et en français', () => {
    expect(searchIconsIn('phosphor', 'caret right')[0]).toBe('caret-right')
    expect(searchIconsIn('phosphor', 'panier')).toContain('shopping-cart')
    expect(searchIconsIn('feather', 'horloge')).toContain('clock')
    expect(searchIconsIn('material-rounded', 'content cut')[0]).toBe('content_cut')
    expect(searchIconsIn('material-rounded', 'panier')).toContain('shopping_cart')
    expect(searchIconsIn('lucide', 'panier')).toContain('shopping-cart')
    expect(searchIconsIn('material-rounded', '', 3)).toHaveLength(3)
  })

  it('variantes : Phosphor par nom, Material par centaines, rien pour Lucide et Feather', () => {
    expect(normalizeIconWeight('phosphor', 'Bold')).toBe('bold')
    expect(normalizeIconWeight('phosphor', 'duotone')).toBe('duotone')
    expect(normalizeIconWeight('phosphor', 100)).toBe('thin')
    expect(normalizeIconWeight('phosphor', 300)).toBe('light')
    expect(normalizeIconWeight('phosphor', 500)).toBe('regular')
    expect(normalizeIconWeight('phosphor', '600')).toBe('bold')
    expect(normalizeIconWeight('phosphor', 'heavy')).toBeUndefined()
    expect(normalizeIconWeight('material-rounded', 450)).toBe(500)
    expect(normalizeIconWeight('material-rounded', 900)).toBe(700)
    expect(normalizeIconWeight('material-rounded', 'bold')).toBe(700)
    expect(normalizeIconWeight('material-rounded', 'fill')).toBeUndefined()
    expect(normalizeIconWeight('lucide', 400)).toBeUndefined()
    expect(normalizeIconWeight('feather', 'bold')).toBeUndefined()
  })

  it('noms de jeux libres', () => {
    expect(toIconSet('Material Symbols Rounded')).toBe('material-rounded')
    expect(toIconSet('material-rounded')).toBe('material-rounded')
    expect(toIconSet('Phosphor')).toBe('phosphor')
    expect(toIconSet('Material Symbols Outlined')).toBeNull()
    expect(toIconSet('fontawesome')).toBeNull()
    expect(toIconSet(3)).toBeNull()
  })
})

describe('correspondance Pen (penIconSet)', () => {
  it('Phosphor : graisses 400 à 700 et sans graisse', () => {
    expect(penIconSet('phosphor')).toEqual({ set: 'phosphor' })
    expect(penIconSet('phosphor', 400)).toEqual({ set: 'phosphor', weight: 'regular' })
    expect(penIconSet('phosphor', 500)).toEqual({ set: 'phosphor', weight: 'regular' })
    expect(penIconSet('phosphor', 600)).toEqual({ set: 'phosphor', weight: 'bold' })
    expect(penIconSet('phosphor', 700)).toEqual({ set: 'phosphor', weight: 'bold' })
    expect(penIconSet('phosphor', 100)).toEqual({ set: 'phosphor', weight: 'thin' })
    expect(penIconSet('phosphor', 200)).toEqual({ set: 'phosphor', weight: 'light' })
  })

  it('Material Symbols Rounded : graisse gardée à la centaine', () => {
    expect(penIconSet('Material Symbols Rounded')).toEqual({ set: 'material-rounded' })
    expect(penIconSet('Material Symbols Rounded', 300)).toEqual({ set: 'material-rounded', weight: 300 })
    expect(penIconSet('Material Symbols Rounded', 650)).toEqual({ set: 'material-rounded', weight: 700 })
  })

  it('Lucide et Feather : pas de variante ; bibliothèque inconnue : null', () => {
    expect(penIconSet('lucide', 700)).toEqual({ set: 'lucide' })
    expect(penIconSet('feather', 400)).toEqual({ set: 'feather' })
    expect(penIconSet('Material Symbols Sharp', 400)).toBeNull()
    expect(penIconSet('unknown')).toBeNull()
  })
})
