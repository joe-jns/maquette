import type { ImageHost } from '../../mcp/images'
import { domMeasure } from '../canvas/measure'
import { docStore } from '../state/store'

/** Planche-contact : cases 4:3 de 220 px, numérotées comme la liste ; JPEG léger (~300 tokens pour 6). */
const CELL_W = 220
const CELL_H = 165
const GAP = 6
const QUALITY = 0.72

async function decode(bytes: Uint8Array | null): Promise<ImageBitmap | null> {
  if (!bytes) return null
  try {
    return await createImageBitmap(new Blob([bytes as BlobPart]))
  } catch {
    return null
  }
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Vignettes recadrées (cover) en grille, chacune avec son numéro ; null si aucune ne se décode. */
export async function contactSheet(thumbs: (Uint8Array | null)[]): Promise<{ data: string; mimeType: string } | null> {
  const bitmaps = await Promise.all(thumbs.map(decode))
  if (!bitmaps.some(Boolean)) return null
  const cols = bitmaps.length <= 6 ? Math.min(3, bitmaps.length) : 4
  const rows = Math.ceil(bitmaps.length / cols)
  const canvas = new OffscreenCanvas(cols * CELL_W + (cols + 1) * GAP, rows * CELL_H + (rows + 1) * GAP)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  bitmaps.forEach((bmp, i) => {
    const x = GAP + (i % cols) * (CELL_W + GAP)
    const y = GAP + Math.floor(i / cols) * (CELL_H + GAP)
    if (bmp) {
      const scale = Math.max(CELL_W / bmp.width, CELL_H / bmp.height)
      const sw = CELL_W / scale
      const sh = CELL_H / scale
      ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, x, y, CELL_W, CELL_H)
      bmp.close()
    } else {
      ctx.fillStyle = '#E5E5E5'
      ctx.fillRect(x, y, CELL_W, CELL_H)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.78)'
    ctx.beginPath()
    ctx.arc(x + 17, y + 17, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), x + 17, y + 18)
  })
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY })
  return { data: base64(await blob.arrayBuffer()), mimeType: 'image/jpeg' }
}

/** Côté fenêtre de l'outil images : le principal cherche et télécharge, la fenêtre compose la planche. */
export const imageHost: ImageHost = {
  async search(query, n, sheet) {
    const r = await window.maquette.images.search(query, n, sheet)
    if (!r.ok) return r
    return { ok: true, hits: r.hits, notes: r.notes, sheet: sheet ? await contactSheet(r.thumbs) : null }
  },
  place: (ref) => window.maquette.images.place(ref),
  credits: () => window.maquette.images.credits(),
  saved: () => docStore.getState().filePath !== null,
  measure: (id) => domMeasure(id) ?? null,
}
