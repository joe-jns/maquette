/**
 * Recherche de photos libres pour l'outil MCP `images`, sans clé ni API payante : Openverse (un index
 * de Flickr, Wikimedia Commons, musées et bibliothèques) et Wikimedia Commons. Mêmes sources, mêmes
 * licences et même fichier de crédits que `vendor/taste-skill/scripts/assets.mjs`, réécrits ici pour
 * tenir dans le délai d'un outil (30 s) et pouvoir viser un faux serveur dans les tests.
 * Code sans Electron : le réseau passe par la fonction `fetch` reçue.
 */

export type LicenceCode = 'cc0' | 'pd' | 'by' | 'by-sa' | 'by-nc' | 'by-nd' | 'by-nc-sa' | 'by-nc-nd' | 'other'
const LICENCES: LicenceCode[] = ['cc0', 'pd', 'by', 'by-sa', 'by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd', 'other']
/** Utilisables pour un client ou un commerce : CC0, domaine public, CC BY, CC BY-SA (comme « safe » d'assets.mjs). */
export const SAFE_LICENCES: readonly LicenceCode[] = ['cc0', 'pd', 'by', 'by-sa']

export type SourceKey = 'openverse' | 'commons'

export interface FoundImage {
  /** `openverse:<id>` ou `commons:<pageid>`, comme assets.mjs. */
  ref: string
  source: SourceKey
  title: string
  creator: string
  licence: LicenceCode
  licenceVersion: string | null
  /** Libellé à montrer quand le code seul tromperait (« no known copyright restrictions »…). */
  licenceName: string | null
  licenceUrl: string | null
  /** Page d'origine (à citer). */
  page: string | null
  /** Fournisseur affiché dans le crédit (Flickr, Wikimedia Commons…). */
  via: string
  /** Fichier à télécharger (taille web quand la source sait la donner). */
  image: string
  /** Petite version pour la planche-contact. */
  thumb: string | null
  /** Taille de l'original, si connue. */
  width: number | null
  height: number | null
}

export interface ImageApis { openverse: string; commons: string }
export const DEFAULT_APIS: ImageApis = { openverse: 'https://api.openverse.org', commons: 'https://commons.wikimedia.org' }

export type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>

/** Wikimedia demande un moyen de contact dans l'agent (sinon il limite plus vite : HTTP 429). */
const UA = 'Maquette/0.1 (editeur de maquettes ; recherche de photos libres ; https://github.com/joe-jns)'
/** HTTP 429 au téléchargement : on réessaie après Retry-After (borné), deux fois au plus. */
const RETRIES_429 = 2
const MAX_RETRY_WAIT_MS = 8000
export const retryDelay = (header: string | null, attempt: number): number => {
  const seconds = Number(header)
  const wanted = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1500 * 2 ** attempt
  return Math.min(wanted, MAX_RETRY_WAIT_MS)
}
/** Largeur demandée aux sources qui savent redimensionner (Commons sert des paliers : 1920 en est un). */
export const PLACE_WIDTH = 1920
const THUMB_WIDTH = 330
/** Plus étroit, une photo ne tient pas une section : écartée de la recherche. */
const MIN_WIDTH = 800
export const WEB_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
}
const PROVIDERS: Record<string, string> = {
  flickr: 'Flickr', wikimedia: 'Wikimedia Commons', met: 'The Metropolitan Museum of Art', nypl: 'New York Public Library',
  rawpixel: 'rawpixel', stocksnap: 'StockSnap', clevelandmuseum: 'Cleveland Museum of Art', brooklynmuseum: 'Brooklyn Museum',
  sciencemuseum: 'Science Museum Group', europeana: 'Europeana', geographorguk: 'Geograph Britain and Ireland',
  inaturalist: 'iNaturalist', wordpress: 'WordPress Photo Directory',
}

// ——— petits outils ———

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const noQuery = (u: string) => u.split('?')[0]!

/** Texte brut d'un champ qui peut contenir du HTML (métadonnées de Commons). */
export function plainText(v: unknown): string {
  return str(v)
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
}

export const short = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).replace(/[\s,;:.-]+$/, '')}…` : s)

// ——— licences et crédits ———

export const isSafe = (it: Pick<FoundImage, 'licence'>): boolean => SAFE_LICENCES.includes(it.licence)

export function licenceLabel(it: Pick<FoundImage, 'licence' | 'licenceVersion' | 'licenceName'>): string {
  if (it.licenceName) return it.licenceName
  if (it.licence === 'cc0') return 'CC0'
  if (it.licence === 'pd') return 'domaine public'
  if (it.licence === 'other') return 'licence sur la page source'
  return `CC ${it.licence.toUpperCase()}${it.licenceVersion ? ` ${it.licenceVersion}` : ''}`
}

export function licenceUrl(it: Pick<FoundImage, 'licence' | 'licenceVersion' | 'licenceUrl'>): string | null {
  if (it.licenceUrl) return it.licenceUrl.replace(/^http:/, 'https:')
  if (it.licence === 'cc0') return 'https://creativecommons.org/publicdomain/zero/1.0/'
  if (it.licence === 'pd') return 'https://creativecommons.org/publicdomain/mark/1.0/'
  if (it.licence.startsWith('by')) return `https://creativecommons.org/licenses/${it.licence}/${it.licenceVersion || '4.0'}/`
  return null
}

/** Ligne de crédit : « Titre » par Auteur, licence, via fournisseur. */
export function creditLine(it: Pick<FoundImage, 'title' | 'creator' | 'licence' | 'licenceVersion' | 'licenceName' | 'via'>): string {
  const by = it.creator && !/^(unknown|anonymous|inconnu)\b/i.test(it.creator) ? ` par ${short(it.creator, 60)}` : ''
  return `« ${short(it.title, 90)} »${by}, ${licenceLabel(it)}, via ${it.via}`
}

/** Licence d'une fiche Commons (champs License et LicenseShortName de extmetadata). */
export function commonsLicence(license: string, shortName: string): { code: LicenceCode; version: string | null; name?: string } {
  const l = license.toLowerCase()
  const s = shortName.toLowerCase()
  const version = (/\b(\d\.\d)\b/.exec(shortName) ?? /(\d\.\d)/.exec(l))?.[1] ?? null
  if (/^cc0|^cc-zero/.test(l) || /^cc0/.test(s)) return { code: 'cc0', version: '1.0' }
  if (/^pd|public domain/.test(l) || /public domain/.test(s)) return { code: 'pd', version: null }
  // Flickr Commons et archives semblables : pas de licence formelle, l'institution ne connaît aucun droit.
  if (/^no (known copyright )?restrictions/.test(s)) return { code: 'pd', version: null, name: 'aucune restriction de droits connue' }
  const cc = /^cc-(by(?:-nc)?(?:-sa|-nd)?)(?:-|$)/.exec(l) ?? /^cc (by(?:-nc)?(?:-sa|-nd)?)\b/.exec(s)
  if (cc) return { code: cc[1] as LicenceCode, version }
  return { code: 'other', version: null, name: shortName || license || undefined }
}

// ——— Openverse ———

/** Vignette Commons (palier standard de 330 px) d'un original de upload.wikimedia.org au format web. */
export function commonsThumb(url: string): string | null {
  const m = /^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+\.(?:jpe?g|png|gif|webp))$/i.exec(url)
  return m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${THUMB_WIDTH}px-${m[4]}` : null
}

export function fromOpenverse(r: unknown): FoundImage | null {
  if (!isObj(r) || !str(r.id) || !str(r.url)) return null
  const provider = str(r.source) || str(r.provider)
  const licence = str(r.license) === 'pdm' ? 'pd' : (str(r.license) as LicenceCode)
  return {
    ref: `openverse:${str(r.id)}`,
    source: 'openverse',
    title: plainText(r.title).replace(/^File:/, '').replace(/\.(jpe?g|png|tiff?|gif|webp)$/i, '') || 'Sans titre',
    creator: plainText(r.creator),
    licence: LICENCES.includes(licence) ? licence : 'other',
    licenceVersion: str(r.license_version) || null,
    licenceName: null,
    licenceUrl: str(r.license_url) || null,
    page: str(r.foreign_landing_url) || str(r.detail_url) || null,
    via: PROVIDERS[provider] ?? (provider.startsWith('smithsonian') ? 'Smithsonian' : provider ? provider.replace(/_/g, ' ') : 'Openverse'),
    image: str(r.url),
    // Le proxy de vignettes d'Openverse échoue sur les originaux de Commons : Commons sert les siennes.
    thumb: commonsThumb(str(r.url)) ?? (str(r.thumbnail) || null),
    width: num(r.width),
    height: num(r.height),
  }
}

export function parseOpenverse(json: unknown): FoundImage[] {
  const rows = isObj(json) && Array.isArray(json.results) ? json.results : []
  return rows.map(fromOpenverse).filter((x): x is FoundImage => x !== null)
}

function openverseSearchUrl(apis: ImageApis, query: string): string {
  // Sans size=large : sinon il ne rend presque que des originaux de Commons, déjà cherchés à part.
  const p = new URLSearchParams({ q: query, license: 'cc0,pdm,by,by-sa', page_size: '20' })
  return `${apis.openverse}/v1/images/?${p}`
}

// ——— Wikimedia Commons ———

function commonsApi(apis: ImageApis, params: Record<string, string>): string {
  const p = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })
  return `${apis.commons}/w/api.php?${p}`
}

const commonsInfo = (width: number) => ({
  prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(width), iiextmetadatalanguage: 'fr',
  iiextmetadatafilter: 'ObjectName|Artist|LicenseShortName|License|LicenseUrl',
})

/** Une page de fichier Commons ; `image` = la vignette demandée (iiurlwidth) quand elle est plus petite que l'original. */
export function fromCommons(pg: unknown): FoundImage | null {
  if (!isObj(pg) || !Array.isArray(pg.imageinfo) || !isObj(pg.imageinfo[0])) return null
  const ii = pg.imageinfo[0]
  const meta = isObj(ii.extmetadata) ? ii.extmetadata : {}
  const m = (k: string) => plainText(isObj(meta[k]) ? meta[k].value : '')
  const lic = commonsLicence(m('License'), m('LicenseShortName'))
  const url = str(ii.url)
  if (!url) return null
  const mime = str(ii.mime)
  const thumb = str(ii.thumburl) ? noQuery(str(ii.thumburl)) : null
  const width = num(ii.width)
  // L'original s'il est déjà au format web et pas plus large que la vignette demandée ; sinon la vignette.
  const thumbWidth = Number(/(\d+)px-[^/]*$/.exec(thumb ?? '')?.[1]) || 0
  const image = thumb && (!WEB_TYPES[mime] || (width !== null && thumbWidth > 0 && thumbWidth < width)) ? thumb : noQuery(url)
  return {
    ref: `commons:${str(pg.pageid)}`,
    source: 'commons',
    title: m('ObjectName').replace(/\s*\b(?:title|label) QS:.*$/s, '') || str(pg.title).replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
    creator: m('Artist'),
    licence: lic.code,
    licenceVersion: lic.version,
    licenceName: lic.name ?? null,
    licenceUrl: m('LicenseUrl') || null,
    page: str(ii.descriptionurl) || null,
    via: 'Wikimedia Commons',
    image,
    thumb,
    width,
    height: num(ii.height),
  }
}

export function parseCommons(json: unknown): FoundImage[] {
  const query = isObj(json) && isObj(json.query) ? json.query : {}
  const pages = Array.isArray(query.pages) ? [...query.pages] : []
  pages.sort((a, b) => (isObj(a) ? Number(a.index) || 0 : 0) - (isObj(b) ? Number(b.index) || 0 : 0))
  return pages.map(fromCommons).filter((x): x is FoundImage => x !== null)
}

function commonsSearchUrl(apis: ImageApis, query: string, width: number): string {
  return commonsApi(apis, {
    generator: 'search', gsrnamespace: '6', gsrsearch: `${query} filetype:bitmap filew:>${MIN_WIDTH - 1}`, gsrlimit: '20', ...commonsInfo(width),
  })
}

// ——— réseau ———

export class ImageSearchError extends Error {}

async function getJson(f: Fetch, url: string, ms: number): Promise<unknown> {
  let r: Response
  try {
    r = await f(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } }
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new ImageSearchError(`pas de réponse en ${Math.round(ms / 1000)} s`)
    throw new ImageSearchError(`connexion impossible (${err.cause?.code ?? err.message})`)
  }
  if (r.status === 429) throw new ImageSearchError('trop de recherches (HTTP 429) : attendez une minute')
  if (!r.ok) throw new ImageSearchError(`HTTP ${r.status}`)
  try {
    return await r.json()
  } catch {
    throw new ImageSearchError('réponse illisible')
  }
}

// ——— sélection ———

const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 32)
/** Nom du fichier sans préfixe de vignette (« 330px-… ») : le même fichier vu par Openverse et par Commons. */
const fileKey = (u: string) => {
  let s = noQuery(u)
  try {
    s = decodeURIComponent(s)
  } catch { /* adresse déjà lisible */ }
  return (s.split('/').pop() ?? s).toLowerCase().replace(/^\d+px-/, '').replace(/ /g, '_')
}

/**
 * Résultats des sources mêlés un à un (Openverse, Commons, Openverse…), licences sûres seulement,
 * assez larges, sans doublon de fichier ni plus de deux photos d'un même titre (un livre numérisé
 * remplirait la page).
 */
export function selectResults(lists: FoundImage[][], limit: number): FoundImage[] {
  const out: FoundImage[] = []
  const seen = new Set<string>()
  const titles = new Map<string, number>()
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < longest && out.length < limit; i++) {
    for (const list of lists) {
      const it = list[i]
      if (!it || out.length >= limit) continue
      if (!isSafe(it)) continue
      if (it.width !== null && it.width < MIN_WIDTH) continue
      const k = fileKey(it.image)
      if (seen.has(k)) continue
      const t = titleKey(it.title)
      const n = (titles.get(t) ?? 0) + 1
      if (t && n > 2) continue
      seen.add(k)
      titles.set(t, n)
      out.push(it)
    }
  }
  return out
}

export interface SearchOutcome {
  items: FoundImage[]
  /** Sources injoignables (avec la raison) : signalées, la recherche continue avec les autres. */
  failed: { source: SourceKey; reason: string }[]
}

/** Cherche dans les deux sources en parallèle (12 s chacune au plus) ; `limit` candidats au plus. */
export async function searchImages(query: string, limit: number, opts: { fetch: Fetch; apis?: ImageApis; timeoutMs?: number }): Promise<SearchOutcome> {
  const apis = opts.apis ?? DEFAULT_APIS
  const ms = opts.timeoutMs ?? 12_000
  const runs: [SourceKey, () => Promise<FoundImage[]>][] = [
    ['openverse', async () => parseOpenverse(await getJson(opts.fetch, openverseSearchUrl(apis, query), ms))],
    ['commons', async () => parseCommons(await getJson(opts.fetch, commonsSearchUrl(apis, query, THUMB_WIDTH), ms))],
  ]
  const settled = await Promise.allSettled(runs.map(([, run]) => run()))
  const failed: SearchOutcome['failed'] = []
  const lists: FoundImage[][] = []
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') lists.push(s.value)
    else failed.push({ source: runs[i]![0], reason: (s.reason as Error).message })
  })
  if (!lists.length) {
    throw new ImageSearchError(`recherche impossible, pas de réseau ? (${failed.map((f) => `${f.source} : ${f.reason}`).join(' ; ')})`)
  }
  return { items: selectResults(lists, limit), failed }
}

/** Fiche complète d'une réf, en taille de pose (`PLACE_WIDTH`). */
export async function fetchRecord(ref: string, opts: { fetch: Fetch; apis?: ImageApis; timeoutMs?: number }): Promise<FoundImage> {
  const apis = opts.apis ?? DEFAULT_APIS
  const ms = opts.timeoutMs ?? 15_000
  const m = /^(openverse|commons):(.+)$/.exec(ref)
  if (!m) throw new ImageSearchError(`réf inconnue : ${ref} (forme openverse:<id> ou commons:<id>, telle que la recherche la donne)`)
  const [, source, id] = m as unknown as [string, SourceKey, string]
  let it: FoundImage | null
  if (source === 'openverse') {
    it = fromOpenverse(await getJson(opts.fetch, `${apis.openverse}/v1/images/${encodeURIComponent(id)}/`, ms))
  } else {
    it = parseCommons(await getJson(opts.fetch, commonsApi(apis, { pageids: id, ...commonsInfo(PLACE_WIDTH) }), ms))[0] ?? null
  }
  if (!it) throw new ImageSearchError(`image introuvable : ${ref}`)
  return it
}

const WIKIMEDIA_ORIGINAL = /^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\//

/**
 * Openverse pointe souvent sur l'original de Commons (10 Mo, parfois un TIFF) : on lui substitue la
 * version web de Commons. Sans réponse, l'image reste telle quelle.
 */
export async function webSized(it: FoundImage, opts: { fetch: Fetch; apis?: ImageApis; timeoutMs?: number }): Promise<FoundImage> {
  if (it.source === 'commons' || !WIKIMEDIA_ORIGINAL.test(it.image)) return it
  const apis = opts.apis ?? DEFAULT_APIS
  let name = noQuery(it.image).split('/').pop() ?? ''
  try {
    name = decodeURIComponent(name)
  } catch { /* nom déjà lisible */ }
  const json = await getJson(opts.fetch, commonsApi(apis, { titles: `File:${name.replace(/_/g, ' ')}`, ...commonsInfo(PLACE_WIDTH) }), opts.timeoutMs ?? 5000).catch(() => null)
  const commons = parseCommons(json)[0]
  return commons ? { ...it, image: commons.image } : it
}

/** Télécharge une image web (au plus `maxBytes`). */
export async function download(f: Fetch, url: string, maxBytes: number, ms = 20_000, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<{ bytes: Uint8Array; ext: string }> {
  let r: Response
  for (let attempt = 0; ; attempt++) {
    try {
      r = await f(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(ms) })
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } }
      throw new ImageSearchError(err.name === 'TimeoutError' || err.name === 'AbortError' ? 'téléchargement trop long' : `téléchargement impossible (${err.cause?.code ?? err.message})`)
    }
    // Plusieurs photos posées d'affilée : Wikimedia répond 429 ; attendre un peu suffit le plus souvent.
    if (r.status !== 429 || attempt >= RETRIES_429) break
    await r.body?.cancel().catch(() => undefined)
    await wait(retryDelay(r.headers.get('retry-after'), attempt))
  }
  if (r.status === 429) throw new ImageSearchError('l’image ne se télécharge pas (HTTP 429 : trop de téléchargements, posez les photos une à une)')
  if (!r.ok) throw new ImageSearchError(`l’image ne se télécharge pas (HTTP ${r.status})`)
  const type = (r.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const ext = WEB_TYPES[type]
  if (!ext) {
    await r.body?.cancel().catch(() => undefined)
    throw new ImageSearchError(`le fichier n’est pas une image web (${type || 'type inconnu'})`)
  }
  const declared = Number(r.headers.get('content-length')) || 0
  if (declared > maxBytes) {
    await r.body?.cancel().catch(() => undefined)
    throw new ImageSearchError('image trop lourde')
  }
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (!bytes.byteLength) throw new ImageSearchError('image vide')
  if (bytes.byteLength > maxBytes) throw new ImageSearchError('image trop lourde')
  return { bytes, ext }
}

// ——— fichiers ———

/** Largeur et hauteur lues dans l'en-tête d'un JPEG, PNG, GIF ou WebP. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 26) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return { width: v.getUint32(16), height: v.getUint32(20) }
  if (ascii(0, 3) === 'GIF') return { width: v.getUint16(6, true), height: v.getUint16(8, true) }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' && b.length >= 30) {
    const f = ascii(12, 16)
    const u24 = (o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)
    if (f === 'VP8X') return { width: 1 + u24(24), height: 1 + u24(27) }
    if (f === 'VP8L') {
      const bits = v.getUint32(21, true)
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }
    }
    if (f === 'VP8 ') return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const m = b[i + 1]!
      if (m === 0xff) {
        i++
        continue
      }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
        i += 2
        continue
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: v.getUint16(i + 7), height: v.getUint16(i + 5) }
      i += 2 + v.getUint16(i + 2)
    }
  }
  return null
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/**
 * Nom de fichier sûr sur tous les systèmes : titre réduit à [a-z0-9-] (accents retirés, 7 mots,
 * 60 caractères au plus), suivi d'une empreinte du contenu ; repli sur la réf si le titre est vide.
 */
export function safeFileName(title: string, ref: string, hash: string, ext: string): string {
  const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 7).join('-').slice(0, 60).replace(/-+$/, '')
  let stem = slug(title) || slug(ref.replace(':', '-')).slice(0, 24) || 'image'
  if (RESERVED.test(stem)) stem = `${stem}-image`
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  return `${stem}-${hash.replace(/[^0-9a-f]/gi, '').slice(0, 8).toLowerCase()}.${cleanExt}`
}
