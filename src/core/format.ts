import { syncInstances } from './components'
import { repairDocument } from './repair'
import { validateDocument, type Issue } from './rules'
import type { MaquetteDocument } from './types'

export const CURRENT_VERSION = 1

/** migrations[n] transforme un document du format n en format n + 1. */
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {}

export type ParseResult = { ok: true; doc: MaquetteDocument; warnings: Issue[] } | { ok: false; errors: Issue[] }

const refuse = (path: string, message: string): ParseResult => ({ ok: false, errors: [{ path, message }] })

export function parseDocument(text: string): ParseResult {
  let raw: unknown
  try {
    // Certains éditeurs Windows (PowerShell 5.1, anciens Bloc-notes) commencent le fichier par un BOM.
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch (e) {
    return refuse('', `invalid JSON: ${(e as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== 'maquette') {
    return refuse('format', 'this file is not a Maquette document')
  }
  let data = raw as Record<string, unknown>
  const version = data.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return refuse('version', 'format version missing or invalid')
  }
  if (version > CURRENT_VERSION) {
    return refuse(
      'version',
      `file created by a newer version of Maquette (format ${version}; this app reads up to format ${CURRENT_VERSION})`,
    )
  }
  for (let n = version; n < CURRENT_VERSION; n++) {
    const migrate = migrations[n]
    if (!migrate) return refuse('version', `no known upgrade from format ${n}`)
    data = migrate(data)
  }
  // Ouverture tolérante (spec §6.2) : réparer ce qui peut l'être, refuser seulement le reste.
  const repaired = repairDocument(data)
  const { warnings } = repaired
  let doc = repaired.doc
  // Instances remises d'accord avec leur principal (fichier modifié hors de Maquette). Un document
  // trop abîmé pour cela est laissé tel quel : la validation dira ce qui ne va pas.
  try {
    doc = syncInstances(doc as MaquetteDocument)
  } catch {
    // rien : la validation tranche
  }
  const issues = validateDocument(doc as MaquetteDocument)
  if (issues.length) return { ok: false, errors: issues }
  return { ok: true, doc: doc as MaquetteDocument, warnings }
}

export function serializeDocument(doc: MaquetteDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
