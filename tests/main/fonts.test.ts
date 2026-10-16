import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FALLBACK_FONTS, FontCache, css2Url, parseCatalog, rewriteCss } from '../../src/main/fonts'
import { resolveFontFile } from '../../src/main/fontPath'

const META = `)]}'\n{"familyMetadataList":[
  {"family":"Inter","category":"Sans Serif","fonts":{"400":{},"700":{},"400i":{}},"axes":[{"tag":"wght","min":100,"max":900}]},
  {"family":"Playfair Display","category":"Serif","fonts":{"700":{},"400":{}},"axes":[]}
]}`
const CSS = `@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/a.woff2) format('woff2'); }
@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/b.woff2) format('woff2'); }`

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'polices '))
})

describe('polices', () => {
  it('lit le catalogue', () => {
    const list = parseCatalog(META)
    expect(list[0]).toEqual({ family: 'Inter', category: 'Sans Serif', weights: [400, 700], italic: true, variable: { min: 100, max: 900 } })
    expect(list[1]).toMatchObject({ family: 'Playfair Display', weights: [400, 700], italic: false, variable: null })
  })

  it('adresse css2', () => {
    const [inter, playfair] = parseCatalog(META)
    expect(css2Url(inter!)).toBe('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap')
    expect(css2Url(playfair!)).toBe('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap')
  })

  it('réécrit les adresses de fichiers', () => {
    const { css, urls } = rewriteCss(CSS, (u) => (u.endsWith('a.woff2') ? 'aaaa.woff2' : 'bbbb.woff2'))
    expect(urls).toEqual(['https://fonts.gstatic.com/s/inter/a.woff2', 'https://fonts.gstatic.com/s/inter/b.woff2'])
    expect(css).toContain('url(mfont://aaaa.woff2)')
    expect(css).not.toContain('gstatic')
  })

  it('télécharge une fois, puis sert depuis le cache même hors connexion', async () => {
    let calls = 0
    const online = new FontCache(dir, async (u) => { calls++; return u.includes('metadata') ? META : CSS }, async () => new Uint8Array([1, 2, 3]))
    expect((await online.catalog()).map((f) => f.family)).toEqual(['Inter', 'Playfair Display'])
    const css = await online.css('Inter')
    expect(css).toMatch(/url\(mfont:\/\/[0-9a-f]{16}\.woff2\)/)
    expect(await readdir(join(dir, 'files'))).toHaveLength(2)
    const offline = new FontCache(dir, async () => { throw new Error('hors ligne') }, async () => { throw new Error('hors ligne') })
    expect((await offline.catalog()).length).toBe(2)
    expect(await offline.css('Inter')).toBe(css)
    expect(calls).toBe(2)
  })

  it('hors connexion sans cache : catalogue de secours ; famille inconnue : null', async () => {
    const offline = new FontCache(dir, async () => { throw new Error('hors ligne') }, async () => { throw new Error('hors ligne') })
    expect(await offline.catalog()).toEqual(FALLBACK_FONTS)
    expect(await offline.css('Inconnue')).toBeNull()
  })

  it('nom de fichier de police : seulement 16 hexadécimaux + .woff2', () => {
    expect(resolveFontFile(dir, '0123456789abcdef.woff2')).toBe(join(dir, 'files', '0123456789abcdef.woff2'))
    expect(resolveFontFile(dir, '../catalog.json')).toBeNull()
    expect(resolveFontFile(dir, 'abc.woff2')).toBeNull()
  })
})
