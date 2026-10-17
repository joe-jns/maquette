import { describe, it, expect } from 'vitest'
import { deflateSync } from 'node:zlib'
import {
  commonsLicence, commonsThumb, creditLine, download, fetchRecord, imageSize, licenceLabel, parseCommons, parseOpenverse,
  retryDelay, safeFileName, searchImages, selectResults, webSized, type Fetch, type FoundImage,
} from '../../src/main/imageSources'

/** Réponses réelles réduites (Openverse /v1/images, Commons generator=search + imageinfo). */
const OPENVERSE = {
  result_count: 3,
  results: [
    {
      id: 'aaa-111', title: 'Pain au levain.jpg', creator: 'Marie <b>Boulangère</b>', license: 'by', license_version: '2.0',
      license_url: 'https://creativecommons.org/licenses/by/2.0/', foreign_landing_url: 'https://www.flickr.com/photos/x/1',
      url: 'https://live.staticflickr.com/1/pain.jpg', thumbnail: 'https://api.openverse.org/v1/images/aaa-111/thumb/',
      width: 1600, height: 1067, source: 'flickr',
    },
    { id: 'bbb-222', title: 'Four', creator: 'X', license: 'by-nc', license_version: '2.0', url: 'https://live.staticflickr.com/2/four.jpg', width: 2000, height: 1500, source: 'flickr' },
    { id: 'ccc-333', title: 'Vieille boulangerie', creator: '', license: 'pdm', url: 'https://example.org/old.jpg', width: 1200, height: 900, provider: 'nypl' },
    { id: 'ddd-444', title: 'Miette', license: 'cc0', url: 'https://example.org/small.jpg', width: 500, height: 400, source: 'rawpixel' },
  ],
}

const COMMONS = {
  query: {
    pages: [
      {
        pageid: 42, index: 2, title: 'File:Boulangerie Gand.jpg',
        imageinfo: [{
          url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Boulangerie_Gand.jpg',
          thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Boulangerie_Gand.jpg/330px-Boulangerie_Gand.jpg?x=1',
          width: 4000, height: 3000, mime: 'image/jpeg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Boulangerie_Gand.jpg',
          extmetadata: {
            ObjectName: { value: 'Boulangerie à Gand' }, Artist: { value: '<a href="//u">Jan</a>' },
            License: { value: 'cc-by-sa-4.0' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
          },
        }],
      },
      {
        pageid: 7, index: 1, title: 'File:Pétrin.png',
        imageinfo: [{
          url: 'https://upload.wikimedia.org/wikipedia/commons/b/bc/P%C3%A9trin.png', width: 1000, height: 800, mime: 'image/png',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:P%C3%A9trin.png',
          extmetadata: { License: { value: 'pd' }, LicenseShortName: { value: 'Public domain' } },
        }],
      },
      { pageid: 9, index: 3, title: 'File:Logo.svg', imageinfo: [{ url: 'https://x/logo.svg', width: 900, height: 900, mime: 'image/svg+xml', extmetadata: { License: { value: 'cc-by-nd-4.0' }, LicenseShortName: { value: 'CC BY-ND 4.0' } } }] },
    ],
  },
}

function png(width: number, height: number): Uint8Array {
  const crc = (buf: Buffer) => {
    let c = ~0
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

/** Faux réseau : chaque adresse demandée est notée ; la réponse vient de `route`. */
function fakeFetch(route: (url: string) => Response | Error): Fetch & { calls: string[] } {
  const calls: string[] = []
  const f = (async (url: string) => {
    calls.push(url)
    const r = route(url)
    if (r instanceof Error) throw r
    return r
  }) as Fetch & { calls: string[] }
  f.calls = calls
  return f
}
const jsonResponse = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })

describe('analyse des réponses', () => {
  it('Openverse : champs, HTML retiré, pdm = domaine public, fournisseur lisible', () => {
    const [a, , c] = parseOpenverse(OPENVERSE)
    expect(a).toMatchObject({
      ref: 'openverse:aaa-111', title: 'Pain au levain', creator: 'Marie Boulangère', licence: 'by', licenceVersion: '2.0',
      via: 'Flickr', image: 'https://live.staticflickr.com/1/pain.jpg', thumb: 'https://api.openverse.org/v1/images/aaa-111/thumb/', width: 1600,
    })
    expect(c).toMatchObject({ licence: 'pd', via: 'New York Public Library' })
    expect(parseOpenverse({ nope: 1 })).toEqual([])
  })

  it('Commons : ordre de la recherche, métadonnées, vignette quand l’original est plus grand', () => {
    const [first, second] = parseCommons(COMMONS)
    expect(first).toMatchObject({ ref: 'commons:7', licence: 'pd', image: 'https://upload.wikimedia.org/wikipedia/commons/b/bc/P%C3%A9trin.png', title: 'Pétrin' })
    expect(second).toMatchObject({
      ref: 'commons:42', title: 'Boulangerie à Gand', creator: 'Jan', licence: 'by-sa', licenceVersion: '4.0', via: 'Wikimedia Commons',
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Boulangerie_Gand.jpg/330px-Boulangerie_Gand.jpg',
    })
  })

  it('licences de Commons', () => {
    expect(commonsLicence('cc0', 'CC0')).toEqual({ code: 'cc0', version: '1.0' })
    expect(commonsLicence('cc-by-3.0', 'CC BY 3.0')).toEqual({ code: 'by', version: '3.0' })
    expect(commonsLicence('', 'No restrictions')).toMatchObject({ code: 'pd', name: 'aucune restriction de droits connue' })
    expect(commonsLicence('arr', 'All rights reserved').code).toBe('other')
  })

  it('crédit et libellé', () => {
    const [a] = parseOpenverse(OPENVERSE)
    expect(licenceLabel(a!)).toBe('CC BY 2.0')
    expect(creditLine(a!)).toBe('« Pain au levain » par Marie Boulangère, CC BY 2.0, via Flickr')
    expect(creditLine({ ...a!, creator: 'Unknown author', licence: 'pd', licenceVersion: null })).toBe('« Pain au levain », domaine public, via Flickr')
  })
})

describe('filtre des licences et sélection', () => {
  it('garde CC0, domaine public, BY, BY-SA ; écarte NC, ND, les trop petites et les doublons', () => {
    const lists = [parseOpenverse(OPENVERSE), parseCommons(COMMONS)]
    const refs = selectResults(lists, 10).map((x) => x.ref)
    expect(refs).toEqual(['openverse:aaa-111', 'commons:7', 'commons:42', 'openverse:ccc-333'])
    expect(selectResults(lists, 2)).toHaveLength(2)
    const twin = { ...lists[0]![0]!, ref: 'openverse:zzz' }
    expect(selectResults([[lists[0]![0]!, twin]], 5)).toHaveLength(1)
  })

  it('le même fichier vu par Openverse (original) et par Commons (vignette) : une seule fois', () => {
    const commons = parseCommons(COMMONS)[1]!
    const viaOpenverse = parseOpenverse({ results: [{ ...OPENVERSE.results[0], id: 'w1', title: 'Autre titre', url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Boulangerie_Gand.jpg', source: 'wikimedia' }] })
    expect(viaOpenverse[0]!.thumb).toBe(commonsThumb(viaOpenverse[0]!.image))
    expect(selectResults([viaOpenverse, [commons]], 5).map((x) => x.ref)).toEqual(['openverse:w1'])
  })

  it('vignette Commons d’un original (le proxy d’Openverse échoue dessus)', () => {
    expect(commonsThumb('https://upload.wikimedia.org/wikipedia/commons/7/75/Pain_%C3%A9t%C3%A9.JPG'))
      .toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Pain_%C3%A9t%C3%A9.JPG/330px-Pain_%C3%A9t%C3%A9.JPG')
    expect(commonsThumb('https://upload.wikimedia.org/wikipedia/commons/7/75/Plan.tif')).toBeNull()
    expect(commonsThumb('https://live.staticflickr.com/1/pain.jpg')).toBeNull()
  })

  it('au plus deux photos d’un même titre', () => {
    const base = parseOpenverse(OPENVERSE)[0]!
    const many: FoundImage[] = [1, 2, 3].map((i) => ({ ...base, ref: `openverse:${i}`, image: `https://x/${i}.jpg` }))
    expect(selectResults([many], 5)).toHaveLength(2)
  })
})

describe('recherche (réseau simulé)', () => {
  it('interroge les deux sources avec le filtre de licences et mêle les résultats', async () => {
    const f = fakeFetch((url) => (url.includes('/v1/images/') ? jsonResponse(OPENVERSE) : jsonResponse(COMMONS)))
    const r = await searchImages('pain', 3, { fetch: f })
    expect(r.items.map((x) => x.ref)).toEqual(['openverse:aaa-111', 'commons:7', 'commons:42'])
    expect(r.failed).toEqual([])
    const ov = new URL(f.calls.find((u) => u.includes('openverse'))!)
    expect(ov.searchParams.get('license')).toBe('cc0,pdm,by,by-sa')
    expect(ov.searchParams.get('q')).toBe('pain')
    expect(ov.searchParams.has('size')).toBe(false)
    const co = new URL(f.calls.find((u) => u.includes('commons'))!)
    expect(co.searchParams.get('gsrsearch')).toContain('filetype:bitmap')
  })

  it('une source en panne : les autres suffisent, la panne est signalée', async () => {
    const f = fakeFetch((url) => (url.includes('openverse') ? new Response('', { status: 503 }) : jsonResponse(COMMONS)))
    const r = await searchImages('pain', 6, { fetch: f })
    expect(r.items).toHaveLength(2)
    expect(r.failed).toEqual([{ source: 'openverse', reason: 'HTTP 503' }])
  })

  it('pas de réseau : erreur claire', async () => {
    const f = fakeFetch(() => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }))
    await expect(searchImages('pain', 6, { fetch: f })).rejects.toThrow(/recherche impossible, pas de réseau \? \(openverse : connexion impossible \(ENOTFOUND\)/)
  })

  it('trop de recherches : message lisible', async () => {
    const f = fakeFetch(() => new Response('', { status: 429 }))
    await expect(searchImages('pain', 6, { fetch: f })).rejects.toThrow(/HTTP 429/)
  })

  it('fiche d’une réf et version web d’un original Commons', async () => {
    const record = { ...OPENVERSE.results[0], url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Boulangerie_Gand.jpg' }
    const gand = { query: { pages: [COMMONS.query.pages[0]] } }
    const f = fakeFetch((url) => (url.includes('/v1/images/aaa-111/') ? jsonResponse(record) : jsonResponse(gand)))
    const it = await fetchRecord('openverse:aaa-111', { fetch: f })
    expect(it.ref).toBe('openverse:aaa-111')
    const web = await webSized(it, { fetch: f })
    expect(web.image).toMatch(/\/thumb\//)
    await expect(fetchRecord('flickr:1', { fetch: f })).rejects.toThrow('réf inconnue')
  })
})

describe('téléchargement et fichiers', () => {
  it('refuse ce qui n’est pas une image web, et les fichiers trop lourds', async () => {
    const html = fakeFetch(() => new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    await expect(download(html, 'https://x', 1000)).rejects.toThrow('pas une image web (text/html)')
    const big = fakeFetch(() => new Response(new Uint8Array(2000), { headers: { 'content-type': 'image/jpeg' } }))
    await expect(download(big, 'https://x', 1000)).rejects.toThrow('trop lourde')
    const ok = fakeFetch(() => new Response(png(3, 2) as BlobPart, { headers: { 'content-type': 'image/png; charset=binary' } }))
    expect((await download(ok, 'https://x', 10_000)).ext).toBe('png')
  })

  it('HTTP 429 : réessaie après Retry-After (borné), puis abandonne avec un conseil', async () => {
    let calls = 0
    const waits: number[] = []
    const wait = async (ms: number) => void waits.push(ms)
    const flaky = fakeFetch(() => (++calls < 2
      ? new Response('', { status: 429, headers: { 'retry-after': '3' } })
      : new Response(png(3, 2) as BlobPart, { headers: { 'content-type': 'image/png' } })))
    expect((await download(flaky, 'https://x', 10_000, 1000, wait)).ext).toBe('png')
    expect(waits).toEqual([3000])
    const busy = fakeFetch(() => new Response('', { status: 429 }))
    await expect(download(busy, 'https://x', 10_000, 1000, wait)).rejects.toThrow(/HTTP 429.*une à une/)
    expect(retryDelay('600', 0)).toBe(8000)
    expect(retryDelay(null, 1)).toBe(3000)
  })

  it('taille lue dans l’en-tête', () => {
    expect(imageSize(png(1200, 800))).toEqual({ width: 1200, height: 800 })
    expect(imageSize(new Uint8Array(10))).toBeNull()
  })

  it('nom de fichier sûr', () => {
    expect(safeFileName('Boulangerie à Gand / « four » : 1920 !', 'commons:42', 'ABCDEF0123456789', 'JPG')).toBe('boulangerie-a-gand-four-1920-abcdef01.jpg')
    expect(safeFileName('', 'openverse:aaa-111', 'abcdef01', 'png')).toBe('openverse-aaa-111-abcdef01.png')
    expect(safeFileName('???', 'x', '12345678', 'jpg')).toBe('x-12345678.jpg')
    expect(safeFileName('CON', 'x', '12345678', 'jpg')).toBe('con-image-12345678.jpg')
    expect(safeFileName('../../etc/passwd', 'x', '12345678', '../exe')).toBe('etc-passwd-12345678.exe')
    expect(safeFileName('un titre vraiment très long avec beaucoup trop de mots dedans', 'x', '12345678', 'jpg')).toBe('un-titre-vraiment-tres-long-avec-beaucoup-12345678.jpg')
  })
})
