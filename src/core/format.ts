import { validateDocument, type Issue } from './rules'
import type { MaquetteDocument } from './types'

export const CURRENT_VERSION = 1

/** migrations[n] transforme un document du format n en format n + 1. */
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {}

export type ParseResult = { ok: true; doc: MaquetteDocument } | { ok: false; errors: Issue[] }

const refuse = (path: string, message: string): ParseResult => ({ ok: false, errors: [{ path, message }] })

export function parseDocument(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return refuse('', `JSON invalide : ${(e as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== 'maquette') {
    return refuse('format', 'ce fichier n’est pas un document Maquette')
  }
  let data = raw as Record<string, unknown>
  const version = data.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return refuse('version', 'version du format absente ou invalide')
  }
  if (version > CURRENT_VERSION) {
    return refuse(
      'version',
      `fichier créé par une version plus récente de Maquette (format ${version} ; cette app lit jusqu’au format ${CURRENT_VERSION})`,
    )
  }
  for (let n = version; n < CURRENT_VERSION; n++) {
    const migrate = migrations[n]
    if (!migrate) return refuse('version', `aucune mise à niveau connue depuis le format ${n}`)
    data = migrate(data)
  }
  const issues = validateDocument(data as unknown as MaquetteDocument)
  if (issues.length) return { ok: false, errors: issues }
  return { ok: true, doc: data as unknown as MaquetteDocument }
}

export function serializeDocument(doc: MaquetteDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
