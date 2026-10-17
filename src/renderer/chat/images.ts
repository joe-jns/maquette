import type { ChatImage } from '../../shared/chat'

/** Formats que Claude lit tels quels ; les autres passent par un canevas. */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_SIDE = 1600
/** ~5 Mo une fois en base64. */
const MAX_BYTES = 3_750_000

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Image collée ou glissée, prête à partir : telle quelle si elle est petite et lisible par Claude,
 * sinon réduite à 1600 px de côté au plus (JPEG pour une photo, PNG sinon, JPEG si le PNG reste lourd).
 * null si ce n'est pas une image lisible.
 */
export async function readImage(file: Blob): Promise<ChatImage | null> {
  if (!file.type.startsWith('image/')) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  const side = Math.max(bitmap.width, bitmap.height)
  if (side <= MAX_SIDE && file.size <= MAX_BYTES && ACCEPTED.includes(file.type)) {
    bitmap.close()
    return { mediaType: file.type, data: await base64(file) }
  }
  const scale = Math.min(1, MAX_SIDE / side)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  let type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  let blob = await encode(canvas, type, 0.88)
  if (blob && blob.size > MAX_BYTES && type === 'image/png') {
    type = 'image/jpeg'
    blob = await encode(canvas, type, 0.85)
  }
  if (!blob || blob.size > MAX_BYTES) return null
  return { mediaType: type, data: await base64(blob) }
}

/** Images d'un presse-papiers ou d'un glisser-déposer. */
export function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const files = [...data.files].filter((f) => f.type.startsWith('image/'))
  if (files.length) return files
  // Une capture d'écran collée n'est parfois que dans `items`.
  return [...data.items].filter((it) => it.kind === 'file' && it.type.startsWith('image/')).map((it) => it.getAsFile()).filter((f): f is File => !!f)
}
