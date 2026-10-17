import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cleanStyle, styleContext, styleDescription, styleVariant, type PickerEntry } from '../../src/shared/chatStyle'
import { styleThumbFile } from '../../src/main/chat/chatImageService'
import { ChatStore } from '../../src/main/chat/chatStore'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const DESIGN = resolve(__dirname, '../../vendor/design')
const picker = JSON.parse(readFileSync(join(DESIGN, 'thumbs', 'picker.json'), 'utf8')) as PickerEntry[]
const styles = JSON.parse(readFileSync(join(DESIGN, 'styles.json'), 'utf8')) as { variants: { name: string; style: string; params: Record<string, string> }[] }

const serif = { name: 'Centered Serif List - Prismatic White', style: 'Centered Serif List', params: { headings: 'Fraunces', body: 'Inter', colorPalette: 'Prismatic White' } }

describe('sélecteur de style du chat (comme Pen)', () => {
  it('la liste de Pen : 52 styles, un par archétype, à partir de « Centered Serif List »', () => {
    expect(picker).toHaveLength(52)
    expect(picker[0]!.style).toBe('Centered Serif List')
    expect(new Set(picker.map((e) => e.style)).size).toBe(52)
  })

  it('chaque entrée existe dans styles.json (même paramètres) et a ses deux vignettes, légères', () => {
    let bytes = 0
    for (const e of picker) {
      const v = styles.variants.find((x) => x.name === e.name)
      expect(v, e.name).toBeTruthy()
      expect(v!.params, e.name).toEqual(e.params)
      for (const f of [e.web, e.mobile]) {
        expect(existsSync(join(DESIGN, 'thumbs', f)), f).toBe(true)
        bytes += statSync(join(DESIGN, 'thumbs', f)).size
      }
    }
    // Ajout au paquet : moins de 1,5 Mo pour les 104 vignettes.
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024)
  })

  it('description envoyée comme Pen : le style, puis « - clé: valeur »', () => {
    expect(styleDescription(serif)).toBe('Centered Serif List\n- headings: Fraunces\n- body: Inter\n- colorPalette: Prismatic White')
    expect(styleContext(serif)).toContain('Use the following style: Centered Serif List\n- headings: Fraunces')
    expect(styleContext(serif)).toContain('style("Centered Serif List", "Prismatic White", appliquer:true)')
  })

  it('variante pour l’outil style : après « Style - », sinon le nom entier', () => {
    expect(styleVariant(serif)).toBe('Prismatic White')
    expect(styleVariant({ name: 'Swiss Type Atlas', style: 'Swiss Type Atlas', params: {} })).toBe('Swiss Type Atlas')
  })

  it('style lu du fichier : abîmé = aucun', () => {
    expect(cleanStyle(serif)).toEqual(serif)
    expect(cleanStyle(null)).toBeNull()
    expect(cleanStyle({ name: 'x' })).toBeNull()
    expect(cleanStyle({ name: 'a', style: 'b', params: { ok: 'oui', 'pas ok': 'x', n: 3 } })).toEqual({ name: 'a', style: 'b', params: { ok: 'oui' } })
  })

  it('mémorisé avec la conversation', async () => {
    const store = new ChatStore(join(mkdtempSync(join(tmpdir(), 'maquette-style-')), 'chats.json'))
    expect(await store.setOptions('k', { style: serif })).toEqual({ taste: false, style: serif })
    expect(await store.setOptions('k', { taste: true })).toEqual({ taste: true, style: serif })
    expect(await store.setOptions('k', { style: null })).toEqual({ taste: true, style: null })
  })

  it('vignettes servies : un nom .webp simple dans le dossier, rien d’autre', () => {
    expect(styleThumbFile('D:\\t', '/swiss-type-atlas-web.webp')).toBe(join('D:\\t', 'swiss-type-atlas-web.webp'))
    for (const bad of ['/../styles.json', '/%2e%2e%2fx.webp', '/a/b.webp', '/x.json', '/']) expect(styleThumbFile('D:\\t', bad), bad).toBeNull()
  })
})
