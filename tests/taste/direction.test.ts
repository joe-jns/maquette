import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyOps } from '../../src/core/ops'
import { newDocument } from '../../src/core/defaults'
import type { MaquetteDocument } from '../../src/core/types'
import {
  SECTORS,
  TONES,
  applyDirectionOps,
  directionStyles,
  parseOptions,
  parseSettings,
  type DirectionSheet,
} from '../../src/taste/direction'

const fixtures = join(__dirname, 'fixtures')
const optionsMd = readFileSync(join(fixtures, 'options.md'), 'utf8')
const sheet = JSON.parse(readFileSync(join(fixtures, 'direction-one-motif.json'), 'utf8')) as DirectionSheet

const ok = (r: ReturnType<typeof applyOps>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r
}

describe('SECTORS et TONES', () => {
  it('reprend les 22 secteurs de draw.mjs avec des libellés français', () => {
    expect(SECTORS).toHaveLength(22)
    expect(new Set(SECTORS.map((s) => s.id)).size).toBe(22)
    expect(SECTORS.find((s) => s.id === 'dev-tool')?.label).toBe('Outil pour développeurs')
    expect(SECTORS.find((s) => s.id === 'restaurant')?.label).toBe('Restaurant')
    for (const s of SECTORS) expect(s.label).not.toBe(s.id)
  })

  it('reprend les 7 tons', () => {
    expect(TONES.map((t) => t.id)).toEqual(['quiet', 'bold', 'warm', 'technical', 'playful', 'luxury', 'editorial'])
  })
})

describe('parseOptions', () => {
  it('lit les 3 directions de la fixture', () => {
    const opts = parseOptions(optionsMd)
    expect(opts.map((o) => o.id)).toEqual(['name-as-monument', 'place-carries-it', 'dark-room'])
    expect(opts[0]!.name).toBe('The name as a monument')
    expect(opts[0]!.idea).toMatch(/^The name is the headline\./)
    expect(opts[0]!.composition).toMatch(/^First screen: the wordmark/)
    expect(opts[0]!.needs).toBeUndefined()
    expect(opts[1]!.needs).toMatch(/^many pictures\./)
  })

  it('tolère un tiret mal encodé et des fins de ligne Windows', () => {
    const md = '## `dark-room` â€” The dark room\r\nIdea engine: Dark.\r\nComposition: Ground.\r\n'
    expect(parseOptions(md)).toEqual([{ id: 'dark-room', name: 'The dark room', idea: 'Dark.', composition: 'Ground.' }])
  })

  it('renvoie une liste vide sans section', () => {
    expect(parseOptions('rien ici')).toEqual([])
  })
})

describe('parseSettings', () => {
  it('lit graisse, espacement, interligne et capitales', () => {
    expect(parseSettings('weight 700 · tracking -0.03em · leading 0.9 · uppercase')).toEqual({
      weight: 700,
      trackingEm: -0.03,
      leading: 0.9,
      uppercase: true,
    })
  })

  it('accepte le séparateur mal encodé', () => {
    expect(parseSettings('weight 500 � tracking -0.02em � leading 1.05 � sentence case')).toEqual({
      weight: 500,
      trackingEm: -0.02,
      leading: 1.05,
    })
  })

  it('lit les réglages du texte courant (tracking 0, sans graisse)', () => {
    expect(parseSettings('400 for body, 500 for emphasis · leading 1.5 · tracking 0')).toEqual({ trackingEm: 0, leading: 1.5 })
  })

  it("ne voit pas de capitales quand elles ne sont qu'une option", () => {
    expect(parseSettings('weight 400 · tracking -0.03em · leading 0.95 · sentence case, or uppercase for one statement').uppercase).toBeUndefined()
  })
})

describe('directionStyles', () => {
  const styles = directionStyles(sheet)
  const color = (name: string) => styles.colors.find((c) => c.name === name)?.value

  it('nomme les couleurs de la palette en #RRGGBB majuscules', () => {
    expect(color('Fond')).toBe('#F7F7F5')
    expect(color('Surface')).toBe('#EBEBE8')
    expect(color('Encre')).toBe('#000000')
    expect(color('Discret')).toBe('#666662')
    expect(color('Accent')).toBe('#D0106F')
    expect(color('Sur accent')).toBe('#FFFFFF')
    expect(styles.colors.filter((c) => c.name.startsWith('Aplat ')).map((c) => [c.name, c.value])).toEqual([
      ['Aplat 1', '#97AAF6'],
      ['Aplat 2', '#BBF697'],
      ['Aplat 3', '#FED878'],
      ['Aplat 4', '#6EF8FB'],
    ])
  })

  it('crée les styles de texte avec les tailles et réglages de la direction', () => {
    expect(styles.text.map((t) => [t.name, t.fontSize])).toEqual([
      ['Titre 1', 72],
      ['Titre 2', 48],
      ['Titre 3', 32],
      ['Texte large', 20],
      ['Texte', 16],
      ['Petit', 13],
    ])
    expect(styles.text[0]).toEqual({
      name: 'Titre 1',
      fontFamily: 'Jost',
      fontWeight: 700,
      fontStyle: 'normal',
      fontSize: 72,
      lineHeight: 65,
      letterSpacing: -2.16,
    })
    expect(styles.text[4]).toEqual({
      name: 'Texte',
      fontFamily: 'Jost',
      fontWeight: 400,
      fontStyle: 'normal',
      fontSize: 16,
      lineHeight: 24,
      letterSpacing: 0,
    })
  })

  it('liste les polices à charger, une par famille', () => {
    expect(styles.fonts).toEqual([{ family: 'Jost', source: 'google', weights: [400, 500, 700] }])
  })

  it('garde le slug des polices Fontshare et prend 1,5 par défaut pour le texte', () => {
    const s = directionStyles({
      ...sheet,
      type: {
        display: { family: 'Switzer', source: 'fontshare', slug: 'switzer', weights: [600], settings: 'weight 600 · tracking -0.04em · leading 0.92' },
        text: { family: 'Inter', source: 'google', weights: [400], settings: '400 for body' },
      },
    })
    expect(s.fonts).toEqual([
      { family: 'Switzer', source: 'fontshare', slug: 'switzer', weights: [600] },
      { family: 'Inter', source: 'google', weights: [400] },
    ])
    expect(s.text.find((t) => t.name === 'Texte')!.lineHeight).toBe(24)
    expect(s.text.find((t) => t.name === 'Titre 2')).toMatchObject({ fontFamily: 'Switzer', fontWeight: 600, lineHeight: 44, letterSpacing: -1.92 })
  })
})

describe('applyDirectionOps', () => {
  const styles = directionStyles(sheet)

  it('produit un lot accepté par applyOps', () => {
    const doc = newDocument()
    const r = ok(applyOps(doc, applyDirectionOps(doc, styles)))
    expect(r.doc.styles.colors.map((c) => c.name)).toEqual(['Fond', 'Surface', 'Encre', 'Discret', 'Accent', 'Sur accent', 'Aplat 1', 'Aplat 2', 'Aplat 3', 'Aplat 4'])
    expect(r.doc.styles.text).toHaveLength(6)
  })

  it('appliquer deux fois met à jour sans doublon', () => {
    const first = ok(applyOps(newDocument(), applyDirectionOps(newDocument(), styles))).doc
    const other = directionStyles({ ...sheet, palette: { ...sheet.palette, accent: '#123456' } })
    const second = ok(applyOps(first, applyDirectionOps(first, other))).doc
    const names = (d: MaquetteDocument) => [...d.styles.colors.map((c) => c.name), ...d.styles.text.map((t) => t.name)]
    expect(names(second)).toEqual(names(first))
    expect(new Set(names(second)).size).toBe(names(second).length)
    expect(second.styles.colors.find((c) => c.name === 'Accent')).toEqual({ ...first.styles.colors.find((c) => c.name === 'Accent'), value: '#123456' })
    expect(second.styles.text.map((t) => t.id)).toEqual(first.styles.text.map((t) => t.id))
  })
})
