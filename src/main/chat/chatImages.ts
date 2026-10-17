import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CHAT_IMAGE_HASH, type ChatImage, type ChatImageRef, type ChatItem } from '../../shared/chat'

/** Vignette fabriquée à partir des octets d'une image ; null si l'image est illisible. */
export type MakeThumb = (bytes: Buffer) => { jpeg: Buffer; width: number; height: number } | null

/** Taille maximale des vignettes (px) : assez pour l'aperçu en grand, légères sur le disque. */
export const THUMB_WIDTH = 640
export const THUMB_MAX_HEIGHT = 1600

/** Âge minimal (ms) d'une vignette orpheline avant suppression. */
export const PRUNE_GRACE_MS = 60_000

/** Échelle de réduction d'une image pour tenir dans 640 × 1600 (jamais agrandie). */
export const thumbScale = (width: number, height: number): number => Math.min(1, THUMB_WIDTH / width, THUMB_MAX_HEIGHT / height)

/**
 * Fichier d'une vignette demandée par la fenêtre (`/<hash>.jpg`) ; null si le nom n'est pas une empreinte :
 * rien d'autre que les vignettes du dossier n'est servi.
 */
export function imageFile(dir: string, pathname: string): string | null {
  const m = /^\/([0-9a-f]{64})\.jpg$/.exec(pathname)
  return m ? join(dir, `${m[1]}.jpg`) : null
}

/** Empreintes des vignettes d'une liste d'éléments. */
export function imageHashes(items: ChatItem[]): string[] {
  const out: string[] = []
  for (const item of items) {
    const refs = item.kind === 'user' ? item.thumbs : item.kind === 'tool' ? item.images : undefined
    if (!Array.isArray(refs)) continue
    for (const ref of refs) if (ref && typeof ref.hash === 'string' && CHAT_IMAGE_HASH.test(ref.hash)) out.push(ref.hash)
  }
  return out
}

/** Vignettes du chat : userData/chat-images/<sha256>.jpg (la même image n'y est qu'une fois). */
export class ChatImages {
  constructor(
    readonly dir: string,
    private readonly makeThumb: MakeThumb,
  ) {}

  /** Enregistre la vignette d'une image (base64) ; null si l'image est illisible. */
  async save(image: ChatImage): Promise<ChatImageRef | null> {
    const bytes = Buffer.from(image.data, 'base64')
    if (!bytes.length) return null
    const thumb = this.makeThumb(bytes)
    if (!thumb) return null
    const hash = createHash('sha256').update(bytes).digest('hex')
    await mkdir(this.dir, { recursive: true })
    const file = join(this.dir, `${hash}.jpg`)
    // Fichier temporaire puis renommage : la fenêtre ne lit jamais une vignette à moitié écrite.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, thumb.jpeg)
    await rename(tmp, file).catch(async () => {
      // Déjà là (même image) et ouverte en lecture : la vignette existante convient.
      await unlink(tmp).catch(() => undefined)
    })
    return { hash, width: thumb.width, height: thumb.height }
  }

  /** Enregistre plusieurs images ; les illisibles sont omises. */
  async saveAll(images: ChatImage[]): Promise<ChatImageRef[]> {
    const refs = await Promise.all(images.map((img) => this.save(img).catch(() => null)))
    return refs.filter((r): r is ChatImageRef => !!r)
  }

  /** Supprime ces vignettes (absentes : ignorées). */
  async remove(hashes: Iterable<string>): Promise<void> {
    for (const hash of new Set(hashes)) {
      if (CHAT_IMAGE_HASH.test(hash)) await unlink(join(this.dir, `${hash}.jpg`)).catch(() => undefined)
    }
  }

  /**
   * Supprime les vignettes qu'aucune conversation n'utilise (et les fichiers temporaires restés).
   * Celles de moins d'une minute restent : un message en cours d'envoi ne les a peut-être pas encore notées.
   */
  async prune(keep: Set<string>, now = Date.now()): Promise<void> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch {
      return
    }
    for (const name of names) {
      const m = /^([0-9a-f]{64})\.jpg$/.exec(name)
      if (m && keep.has(m[1]!)) continue
      if (!m && !name.endsWith('.tmp')) continue
      const file = join(this.dir, name)
      const age = await stat(file).then((st) => now - st.mtimeMs, () => -1)
      if (age >= PRUNE_GRACE_MS) await unlink(file).catch(() => undefined)
    }
  }
}
