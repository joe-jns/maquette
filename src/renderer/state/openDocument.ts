import { parseDocument } from '../../core/format'
import type { OpenedFile, PenImportInfo } from '../../shared/ipc'
import { ask } from '../dialog/dialogStore'
import { homeStore } from '../home/homeStore'
import { docStore } from './store'
import { uiStore } from './ui'

export const fileName = (path: string | null) => (path ? (path.split(/[\\/]/).pop() ?? path) : 'Untitled')
/** Nom affiché du document : son fichier, sinon le nom du .pen converti, sinon « Untitled ». */
export const docName = (s: { filePath: string | null; untitledName: string | null }) =>
  s.filePath ? fileName(s.filePath) : (s.untitledName ?? 'Untitled')

/** Charge un fichier lu sur disque : refus expliqué, ou ouverture avec les réparations signalées. */
export async function openDocument(file: OpenedFile): Promise<boolean> {
  const store = docStore.getState()
  const label = file.imported ? `${file.imported.name}.pen` : fileName(file.path)
  const parsed = parseDocument(file.text)
  if (!parsed.ok) {
    store.showError(`Could not open ${label}: ${parsed.errors[0]!.message}`)
    return false
  }
  // D'abord le principal (dossier des images), ensuite l'affichage : sinon les images partent trop tôt.
  await window.maquette.documentLoaded(file.path, file.imported?.from ?? null)
  store.load(parsed.doc, file.path, file.imported?.name ?? null)
  uiStore.getState().select([])
  uiStore.getState().setEditing(null)
  uiStore.getState().requestFit()
  homeStore.getState().documentShown()
  const n = parsed.warnings.length
  if (n > 0) {
    // Le document réparé diffère du fichier : il reste à enregistrer.
    docStore.setState({ dirty: true })
    store.showError(`${label} opened with ${n} repair${n > 1 ? 's' : ''}: ${parsed.warnings[0]!.message}`)
  }
  if (file.imported) void showImportReport(file.imported)
  return true
}

/** Ce que l'ouverture d'un .pen n'a pas repris tel quel ; rien à signaler : pas de boîte. */
export function importReportText(info: PenImportInfo): { message: string; detail: string } | null {
  if (!info.report.length) return null
  const total = info.report.reduce((s, i) => s + i.count, 0)
  return {
    message: `${info.name}.pen was opened as a new design. ${total} detail${total > 1 ? 's were' : ' was'} not reproduced exactly.`,
    detail: info.report.map((i) => `${i.count} × ${i.label}`).join('\n'),
  }
}

async function showImportReport(info: PenImportInfo): Promise<void> {
  const text = importReportText(info)
  if (!text) return
  await ask({ title: 'Pen import', ...text, buttons: [{ label: 'OK', kind: 'primary' }], cancelIndex: 0, defaultIndex: 0 })
}
