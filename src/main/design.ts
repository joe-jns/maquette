import { app, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Textes de design lus à la demande par les outils `guide` et `style` (vendor/design) : à la racine
 * du projet en dev, dans les ressources une fois installé (extraResources, comme taste-skill).
 */
export function designRoot(): string {
  return join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'vendor', 'design')
}

/** Chemins acceptés : segments de lettres, chiffres, tirets, soulignés et points intérieurs ; .md ou .json. */
const SAFE = /^[A-Za-z0-9][\w.-]*(\/[A-Za-z0-9][\w.-]*)*\.(md|json)$/

/** Fichier de `root` désigné par `rel`, ou null : jamais en dehors de `root` (pas de « .. », pas d'absolu). */
export function resolveDesignFile(root: string, rel: string): string | null {
  if (typeof rel !== 'string' || rel.length > 200 || !SAFE.test(rel) || rel.split('/').some((s) => s.startsWith('.') || s.includes('..'))) return null
  const base = resolve(root)
  const full = resolve(base, rel)
  const inside = relative(base, full)
  if (!inside || inside.startsWith('..') || isAbsolute(inside) || inside.split(sep).includes('..')) return null
  return full
}

/** Contenu d'un fichier de design, ou null s'il est refusé ou absent. */
export async function readDesignFile(root: string, rel: string): Promise<string | null> {
  const path = resolveDesignFile(root, rel)
  if (!path) return null
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export function registerDesignIpc(): void {
  ipcMain.handle('design:read', (_e, rel: unknown) => (typeof rel === 'string' ? readDesignFile(designRoot(), rel) : null))
}
