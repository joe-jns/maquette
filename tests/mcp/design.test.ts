import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { newDocument } from '../../src/core/defaults'
import { applyOps } from '../../src/core/ops'
import { HEX_COLOR } from '../../src/core/schema'
import type { MaquetteDocument } from '../../src/core/types'
import type { DesignHost } from '../../src/mcp/design'
import { GUIDES } from '../../src/mcp/design/guide'
import { findStyle, fontsOf, styleStyles, variantsOf, type StyleLibrary } from '../../src/mcp/design/styles'
import { runTool, type ToolHost } from '../../src/mcp/tools'
import { parseOptions } from '../../src/taste/direction'

const ROOT = resolve(__dirname, '../../vendor/design')
const lib = JSON.parse(readFileSync(join(ROOT, 'styles.json'), 'utf8')) as StyleLibrary
const fixtures = join(__dirname, '../taste/fixtures')

/** Les 26 styles que liste le SKILL.md de Pen (get_style en donne d'autres en plus). */
const PEN_26 = [
  'Aerial Gravitas', 'Anchored Ribbon Grid', 'Artisan Editorial', 'Blueprint Technical', 'Centered Device Cascade',
  'Centered Serif List', 'Cinematic Alternating', 'Cinematic Device Column', 'Color Block Stack', 'Dark Centered Platform',
  'Editorial Landscape Stack', 'Editorial Scientific', 'Gradient Prompt Stack', 'Illustrated Ribbon Stack', 'Illustrated Warm',
  'Inline Friendly', 'Modular Bento Showcase', 'Monumental Editorial', 'Narrative Illustrated', 'Product Data Grid',
  'Product Demo', 'Saturated Code Bridge', 'Soft Bento', 'Spatial Plus', 'Split Inverse Showcase', 'Zigzag Bold Split',
]

function host(start: MaquetteDocument = newDocument()) {
  let doc = start
  const labels: string[] = []
  const reads: string[] = []
  const draws: unknown[] = []
  const design: DesignHost = {
    async read(path) {
      reads.push(path)
      try {
        return readFileSync(join(ROOT, path), 'utf8')
      } catch {
        return null
      }
    },
    async tasteOptions(input) {
      draws.push(input)
      return { ok: true, value: parseOptions(readFileSync(join(fixtures, 'options.md'), 'utf8')) }
    },
    async tasteDirection(input) {
      draws.push(input)
      return { ok: true, value: JSON.parse(readFileSync(join(fixtures, 'direction-one-motif.json'), 'utf8')) }
    },
    loadFonts: async (families) => families.filter((f) => f === 'Fraunces'),
  }
  const h: ToolHost = {
    doc: () => doc,
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
    design,
  }
  return { h, labels, reads, draws, doc: () => doc }
}

describe('styles archétypes extraits de Pen', () => {
  it('les 26 styles de Pen y sont, chacun avec au moins une variante', () => {
    const names = lib.styles.map((s) => s.name)
    for (const n of PEN_26) expect(names, n).toContain(n)
    for (const s of lib.styles) {
      expect(variantsOf(lib, s).length, s.name).toBeGreaterThan(0)
      expect(s.content, s.name).toContain('# Identity')
      expect(s.content, s.name).not.toContain('# Design quality')
    }
    expect(lib.quality).toContain('The art of reduction')
  })

  it('chaque variante a des polices connues et une palette hexadécimale valide', () => {
    for (const v of lib.variants) {
      const style = findStyle(lib, v.style)!
      expect(style, v.name).toBeDefined()
      for (const f of fontsOf(lib, style, v)) {
        expect(lib.fontWeights[f.family], `${v.name} : ${f.family}`).toBeDefined()
        expect(f.weight).toBeGreaterThanOrEqual(100)
        expect(f.weight).toBeLessThanOrEqual(900)
      }
      expect(v.params.headings && v.params.body, v.name).toBeTruthy()
      const styles = styleStyles(lib, style, v)
      expect(styles.colors.length, v.name).toBeGreaterThanOrEqual(4)
      for (const c of styles.colors) expect(c.value, `${v.name} ${c.name}`).toMatch(HEX_COLOR)
      expect(styles.colors.map((c) => c.name)).toEqual(expect.arrayContaining(['Fond', 'Encre']))
      expect(styles.text.map((t) => t.name).slice(0, 6)).toEqual(['Titre 1', 'Titre 2', 'Titre 3', 'Texte large', 'Texte', 'Petit'])
    }
  })

  it('graisses lues dans le texte du style, ramenées aux graisses disponibles', () => {
    const style = findStyle(lib, 'Brutalist Console 3')!
    const fonts = fontsOf(lib, style, variantsOf(lib, style)[0]!)
    expect(fonts.find((f) => f.role === 'headings')).toEqual({ role: 'headings', family: 'Big Shoulders', weight: 900 })
    expect(fonts.find((f) => f.role === 'body')?.weight).toBe(400)
    // Anton n'existe qu'en 400 : le 600 par défaut des titres y est ramené.
    const aerial = findStyle(lib, 'Aerial Gravitas')!
    const anton = variantsOf(lib, aerial).find((v) => v.params.headings === 'Anton')!
    expect(fontsOf(lib, aerial, anton).find((f) => f.role === 'headings')?.weight).toBe(400)
  })
})

describe('outil guide', () => {
  it('sans sujet : sommaire court, une ligne par sujet', async () => {
    const r = await runTool(host().h, 'guide', {})
    expect(r.isError).toBeFalsy()
    for (const id of ['methode', 'regles-maison', 'qualite', 'landing-page', 'web-app', 'mobile-app', 'design-system', 'table', 'slides', 'better-typography', 'taste-critique']) {
      expect(r.text).toContain(`- ${id} :`)
    }
    expect(r.text).not.toContain('better-typography/choosing-fonts')
    expect(r.text.length).toBeLessThan(2600)
  })

  it('un sujet : son texte ; un skill better-* cite ses annexes, lisibles aussi', async () => {
    const t = host()
    const landing = await runTool(t.h, 'guide', { sujet: 'landing-page' })
    expect(landing.text).toContain('Conversion intent')
    expect(landing.text).toContain('In Maquette')
    const typo = await runTool(t.h, 'guide', { sujet: 'Better-Typography' })
    expect(typo.text).toContain('guide("better-typography/choosing-fonts")')
    const annexe = await runTool(t.h, 'guide', { sujet: 'better-typography/choosing-fonts' })
    expect(annexe.isError).toBeFalsy()
    expect(t.reads).toEqual(['maquette/landing-page.md', 'better/better-typography/SKILL.md', 'better/better-typography/choosing-fonts.md'])
  })

  it('tous les sujets du sommaire existent sur le disque', async () => {
    const t = host()
    for (const g of GUIDES) expect((await runTool(t.h, 'guide', { sujet: g.id })).isError, g.id).toBeFalsy()
  })

  it('traversée de chemin et sujet inconnu refusés, sans lecture', async () => {
    const t = host()
    for (const sujet of ['../../package.json', '..', 'maquette/../../../package.json', 'better/../../x', '/etc/passwd', 'C:\\Windows\\win.ini', 'styles.json', 'inconnu']) {
      const r = await runTool(t.h, 'guide', { sujet })
      expect(r.isError, sujet).toBe(true)
    }
    expect(t.reads).toEqual([])
  })
})

describe('outil style', () => {
  it('liste, variantes, fiche', async () => {
    const t = host()
    const list = await runTool(t.h, 'style', {})
    expect(list.text).toContain('- Artisan Editorial : ')
    expect(list.text.split('\n').length).toBe(lib.styles.length + 1)
    const variants = await runTool(t.h, 'style', { nom: 'artisan editorial' })
    expect(variants.text).toContain('- Heritage Warmth : titres Fraunces')
    expect(variants.text).toContain('- Parchment Gold : titres Cormorant Infant')
    const sheet = await runTool(t.h, 'style', { nom: 'Artisan Editorial', variante: 'heritage warmth' })
    expect(sheet.text).toContain('# Artisan Editorial — Heritage Warmth')
    expect(sheet.text).toContain('## Composition')
    expect(sheet.text).toContain('Polices (Google Fonts) : titres Fraunces')
    expect(sheet.text).toMatch(/Fond \(surface\.primary\) #[0-9A-F]{6}/)
    expect(sheet.text).toContain('rounded.sm 4')
    expect(sheet.text).toContain('# Imagerie : Lifestyle Workspace Photography')
    expect(sheet.text.length).toBeLessThan(5000)
    expect(t.labels).toEqual([])
  })

  it('appliquer : une seule opération annulable qui crée couleurs nommées et styles de texte', async () => {
    const t = host()
    const r = await runTool(t.h, 'style', { nom: 'Artisan Editorial', variante: 'Heritage Warmth', appliquer: true })
    expect(r.isError, r.text).toBeFalsy()
    expect(t.labels).toEqual(['Claude : style Artisan Editorial — Heritage Warmth'])
    const doc = t.doc()
    expect(doc.styles.colors.map((c) => c.name)).toEqual(['Fond', 'Fond inversé', 'Encre', 'Encre secondaire', 'Encre inversée', 'Bordure douce', 'Accent'])
    expect(doc.styles.text.map((s) => `${s.name} ${s.fontFamily} ${s.fontSize}`)).toEqual([
      'Titre 1 Fraunces 72', 'Titre 2 Fraunces 48', 'Titre 3 Fraunces 32', 'Texte large Karla 20', 'Texte Karla 16', 'Petit Instrument Sans 13',
    ])
    const out = JSON.parse(r.text.split('\n\n')[0]!)
    expect(out.couleurs.Accent).toBe(doc.styles.colors.find((c) => c.name === 'Accent')!.id)
    expect(out.textes['Titre 1']).toBe(doc.styles.text[0]!.id)
    expect(out.polices_non_chargees).toEqual(['Fraunces'])
    expect(r.text).toContain('# Artisan Editorial — Heritage Warmth')

    // Un autre style met à jour les mêmes noms au lieu de les dupliquer.
    await runTool(t.h, 'style', { nom: 'Product Demo', variante: 'Deep Space Neon', appliquer: true })
    expect(t.labels).toHaveLength(2)
    expect(t.doc().styles.text.filter((s) => s.name === 'Titre 1')).toHaveLength(1)
    expect(t.doc().styles.text.find((s) => s.name === 'Titre 1')!.fontFamily).toBe('Space Grotesk')
  })

  it('style à une seule variante : la fiche directement ; erreurs claires', async () => {
    const t = host()
    expect((await runTool(t.h, 'style', { nom: 'Swiss Type Atlas' })).text).toContain('# Swiss Type Atlas — Swiss Type Atlas')
    expect((await runTool(t.h, 'style', { nom: 'Inconnu' })).isError).toBe(true)
    expect((await runTool(t.h, 'style', { nom: 'Soft Bento', variante: 'Rose' })).text).toContain('Variantes : Fern Journal, Carbon Frost')
    expect((await runTool(t.h, 'style', { nom: 'Soft Bento', appliquer: true })).isError).toBe(true)
    expect((await runTool(t.h, 'style', { nom: 'Soft Bento', couleur: 'x' })).isError).toBe(true)
    expect(t.labels).toEqual([])
  })

  it('sans accès aux fichiers de design : outil indisponible', async () => {
    const t = host()
    const { design: _design, ...bare } = t.h
    expect((await runTool(bare, 'style', {})).isError).toBe(true)
  })
})

describe('outil direction', () => {
  it('trois directions, puis la fiche ; appliquer reprend la même fiche (un seul tirage)', async () => {
    const t = host()
    const options = await runTool(t.h, 'direction', { secteur: 'restaurant', brief: 'bistrot à Charleroi', sections: ['intro', 'gallery', 'contact'] })
    expect(options.text).toContain('## name-as-monument — The name as a monument')
    const sheet = await runTool(t.h, 'direction', { secteur: 'restaurant', brief: 'bistrot à Charleroi', sections: ['intro', 'gallery', 'contact'], choix: 'one-motif' })
    expect(sheet.text).toContain('## Hero — ')
    expect(sheet.text).toContain('## Palette')
    expect(sheet.text).toContain('## Typographie')
    // Plans des sections : Claude construit chaque section d'après le sien.
    expect(sheet.text).toMatch(/## Sections \(dans l’ordre\)[^\n]*\n- [\w-]+ — .+ : .{80,}/)
    const applied = await runTool(t.h, 'direction', { secteur: 'restaurant', brief: 'bistrot à Charleroi', sections: ['intro', 'gallery', 'contact'], choix: 'one-motif', appliquer: true })
    expect(applied.isError, applied.text).toBeFalsy()
    expect(t.draws).toEqual([
      { sector: 'restaurant', brief: 'bistrot à Charleroi', sections: ['intro', 'gallery', 'contact'] },
      { sector: 'restaurant', brief: 'bistrot à Charleroi', sections: ['intro', 'gallery', 'contact'], direction: 'one-motif' },
    ])
    expect(t.labels).toEqual(['Claude : direction One motif'])
    const out = JSON.parse(applied.text.split('\n\n')[0]!)
    expect(Object.keys(out.couleurs)).toEqual(expect.arrayContaining(['Fond', 'Encre', 'Accent']))
    expect(t.doc().styles.text.map((s) => s.name)).toEqual(['Titre 1', 'Titre 2', 'Titre 3', 'Texte large', 'Texte', 'Petit'])
  })

  it('arguments vérifiés', async () => {
    const t = host()
    expect((await runTool(t.h, 'direction', { secteur: 'boulangerie', brief: 'x' })).isError).toBe(true)
    expect((await runTool(t.h, 'direction', { secteur: 'restaurant', brief: 'x', appliquer: true })).isError).toBe(true)
    expect(t.draws).toEqual([])
  })
})

describe('style sombre', () => {
  it('Dark Centered Platform : les rôles inversés deviennent Fond et Encre', () => {
    const style = findStyle(lib, 'Dark Centered Platform')!
    const v = variantsOf(lib, style)[0]!
    const colors = styleStyles(lib, style, v).colors
    const palette = lib.palettes[v.params.colorPalette!]!
    expect(colors.find((c) => c.name === 'Fond')?.value).toBe(palette['surface.inverse']!.toUpperCase())
    expect(colors.find((c) => c.name === 'Encre')?.value).toBe(palette['foreground.inverse']!.toUpperCase())
    expect(colors.map((c) => c.name)).not.toContain('Fond inversé')
  })
})
