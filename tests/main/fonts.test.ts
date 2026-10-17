import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FALLBACK_FONTS,
  FontCache,
  css2Url,
  fetchBytes,
  fetchText,
  fontshareFromTaste,
  fontshareUrl,
  parseCatalog,
  rewriteCss,
} from '../../src/main/fonts'
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

  it('le catalogue de secours n’est pas retenu : le réseau revenu, le vrai catalogue arrive', async () => {
    let online = false
    const cache = new FontCache(dir, async (u) => { if (!online) throw new Error('hors ligne'); return u.includes('metadata') ? META : CSS }, async () => new Uint8Array([1]))
    expect(await cache.catalog()).toEqual(FALLBACK_FONTS)
    online = true
    expect((await cache.catalog()).map((f) => f.family)).toEqual(['Inter', 'Playfair Display'])
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

// Forme réelle renvoyée par api.fontshare.com : URL protocol-relative, woff2 puis woff et ttf en repli.
const FS_CSS = `@font-face {
  font-family: 'Switzer';
  src: url('//cdn.fontshare.com/wf/AAA/BBB/C400.woff2') format('woff2'),
       url('//cdn.fontshare.com/wf/AAA/BBB/C400.woff') format('woff'),
       url('//cdn.fontshare.com/wf/AAA/BBB/C400.ttf') format('truetype');
  font-weight: 400;
}
@font-face {
  font-family: 'Switzer';
  src: url("https://cdn.fontshare.com/wf/DDD/EEE/F600.woff2") format("woff2"),
       url("https://cdn.fontshare.com/wf/DDD/EEE/F600.ttf") format("truetype");
  font-weight: 600;
}`
const SWITZER = { family: 'Switzer', slug: 'switzer', weights: [400, 600] }

describe('polices Fontshare', () => {
  it('réécrit les adresses Fontshare (// et https) et retire les replis non woff2', () => {
    let n = 0
    const { css, urls } = rewriteCss(FS_CSS, () => `${(n++).toString(16).padStart(16, '0')}.woff2`)
    expect(urls).toEqual([
      'https://cdn.fontshare.com/wf/AAA/BBB/C400.woff2',
      'https://cdn.fontshare.com/wf/DDD/EEE/F600.woff2',
    ])
    expect(css).not.toContain('fontshare')
    expect(css).not.toMatch(/truetype|format\('woff'\)/)
    expect(css.match(/url\(mfont:\/\/[0-9a-f]{16}\.woff2\) format\(['"]woff2['"]\);/g)).toHaveLength(2)
  })

  it('adresse de la feuille Fontshare', () => {
    expect(fontshareUrl(SWITZER)).toBe('https://api.fontshare.com/v2/css?f[]=switzer@400,600&display=swap')
  })

  it('extrait les familles Fontshare de type.json, dédoublonnées, graisses fusionnées', () => {
    const json = JSON.stringify([
      { display: { family: 'Switzer', source: 'fontshare', slug: 'switzer', weights: [600] }, text: { family: 'Switzer', source: 'fontshare', slug: 'switzer', weights: [400, 500] } },
      { display: { family: 'Inter', source: 'google', weights: [700] }, text: { family: 'Switzer', source: 'fontshare', slug: 'switzer', weights: [400] } },
      { display: { family: 'Zodiak', source: 'fontshare', slug: 'zodiak', weights: [300, 100] }, text: { family: 'Inter', source: 'google', weights: [400] } },
    ])
    expect(fontshareFromTaste(json)).toEqual([
      { family: 'Switzer', slug: 'switzer', weights: [400, 500, 600] },
      { family: 'Zodiak', slug: 'zodiak', weights: [100, 300] },
    ])
  })

  it('catalogue complété et feuille Fontshare téléchargée puis servie hors connexion', async () => {
    const fetched: string[] = []
    const online = new FontCache(
      dir,
      async (u) => { fetched.push(u); return u.includes('metadata') ? META : u.includes('fontshare') ? FS_CSS : CSS },
      async (u) => { fetched.push(u); return new Uint8Array([1]) },
      Date.now,
      [SWITZER, { family: 'Inter', slug: 'inter', weights: [400] }],
    )
    const catalog = await online.catalog()
    expect(catalog.map((f) => f.family)).toEqual(['Inter', 'Playfair Display', 'Switzer'])
    expect(catalog[2]).toEqual({ family: 'Switzer', category: 'Fontshare', weights: [400, 600], italic: false, variable: null })
    const css = await online.css('Switzer')
    expect(css).toMatch(/font-family: 'Switzer'/)
    expect(css).not.toContain('fontshare')
    expect(fetched).toContain('https://api.fontshare.com/v2/css?f[]=switzer@400,600&display=swap')
    expect(fetched).toContain('https://cdn.fontshare.com/wf/AAA/BBB/C400.woff2')
    expect(await readdir(join(dir, 'files'))).toHaveLength(2)
    // Inter vient de Google, même si elle figure aussi dans la liste Fontshare.
    await online.css('Inter')
    expect(fetched.some((u) => u.includes('fontshare') && u.includes('inter'))).toBe(false)
    // Le catalogue enregistré reste celui de Google ; la feuille Fontshare est servie depuis le cache.
    const offline = new FontCache(dir, async () => { throw new Error('hors ligne') }, async () => { throw new Error('hors ligne') })
    expect((await offline.catalog()).map((f) => f.family)).toEqual(['Inter', 'Playfair Display'])
    expect(await offline.css('Switzer')).toBe(css)
  })

  it('sans liste Fontshare : famille Fontshare inconnue', async () => {
    const cache = new FontCache(dir, async (u) => (u.includes('metadata') ? META : FS_CSS), async () => new Uint8Array([1]))
    expect(await cache.css('Switzer')).toBeNull()
  })

  it.skipIf(process.env.FONTS_LIVE !== '1')('réseau : télécharge Switzer depuis Fontshare', async () => {
    const cache = new FontCache(dir, fetchText, fetchBytes, Date.now, [SWITZER])
    const css = await cache.css('Switzer')
    expect(css).toMatch(/url\(mfont:\/\/[0-9a-f]{16}\.woff2\)/)
    expect(css).not.toContain('fontshare')
    expect((await readdir(join(dir, 'files'))).length).toBeGreaterThanOrEqual(2)
  }, 30_000)
})
