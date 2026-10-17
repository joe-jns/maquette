import * as nodeFs from 'node:fs/promises'

export interface FsLike {
  writeFile(path: string, data: string | Uint8Array, encoding?: 'utf8'): Promise<void>
  rename(from: string, to: string): Promise<void>
  rm(path: string, opts: { force: boolean }): Promise<void>
}

const RETRYABLE = new Set(['EBUSY', 'EPERM', 'EACCES'])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface AtomicOptions { retries?: number; delayMs?: number; fs?: FsLike }

/** Écrit un texte (UTF-8) dans un temporaire puis renomme : le fichier cible n'est jamais à moitié écrit. */
export function writeFileAtomic(target: string, data: string, opts: AtomicOptions = {}): Promise<void> {
  return writeAtomic(target, data, opts)
}

/** Comme writeFileAtomic, pour des octets (image exportée…). */
export function writeBytesAtomic(target: string, data: Uint8Array, opts: AtomicOptions = {}): Promise<void> {
  return writeAtomic(target, data, opts)
}

async function writeAtomic(target: string, data: string | Uint8Array, opts: AtomicOptions): Promise<void> {
  const fs = opts.fs ?? (nodeFs as unknown as FsLike)
  const retries = opts.retries ?? 5
  const delayMs = opts.delayMs ?? 50
  const tmp = `${target}.tmp-${process.pid}-${Date.now().toString(36)}`
  const cleanup = () => fs.rm(tmp, { force: true }).catch(() => undefined)
  try {
    if (typeof data === 'string') await fs.writeFile(tmp, data, 'utf8')
    else await fs.writeFile(tmp, data)
  } catch (e) {
    await cleanup()
    throw e
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, target)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? ''
      if (attempt < retries && RETRYABLE.has(code)) {
        await sleep(delayMs * (attempt + 1))
        continue
      }
      await cleanup()
      throw e
    }
  }
}
