import { useRef, useState } from 'react'
import { runCommand } from '../state/commands'
import { useDoc } from '../state/store'
import { Icon } from '../ui/icons'
import { QuickMenu } from '../ui/QuickMenu'
import { LayersPanel } from './LayersPanel'
import { PagesPanel } from './PagesPanel'

/** Nom affiché du fichier : sans dossier ni extension, « Sans titre » s'il n'est pas encore enregistré. */
export function fileTitle(path: string | null): string {
  if (!path) return 'Sans titre'
  return path.split(/[\\/]/).pop()!.replace(/\.maquette$/i, '')
}

/** En-tête du panneau gauche (Figma UI3) : nom du fichier, point « modifié », menu Fichier. */
function FileHeader() {
  const filePath = useDoc((s) => s.filePath)
  const dirty = useDoc((s) => s.dirty)
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const title = fileTitle(filePath)
  return (
    <header className="file-header" data-testid="file-header">
      <button
        ref={button}
        type="button"
        className="file-title"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip={filePath ?? 'Document non enregistré'}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="file-name">{title}</span>
        {dirty && (
          <span className="file-dirty" data-testid="file-dirty">
            <span className="visually-hidden">(modifié)</span>
          </span>
        )}
        <Icon name="chevronDownSmall" size={16} className="file-chevron" />
      </button>
      {open && (
        <QuickMenu
          anchor={button}
          label="Fichier"
          placement="below"
          onClose={() => setOpen(false)}
          entries={[
            { id: 'new', label: 'Nouveau', shortcut: 'Ctrl+N', onSelect: () => void runCommand('new') },
            { id: 'open', label: 'Ouvrir…', shortcut: 'Ctrl+O', onSelect: () => void runCommand('open') },
            'separator',
            { id: 'save', label: 'Enregistrer', shortcut: 'Ctrl+S', onSelect: () => void runCommand('save') },
            { id: 'save-as', label: 'Enregistrer sous…', shortcut: 'Ctrl+Maj+S', onSelect: () => void runCommand('save-as') },
          ]}
        />
      )}
    </header>
  )
}

/** Panneau gauche : fichier, pages, puis calques de la page affichée. */
export function LeftPanel() {
  return (
    <aside className="panel panel-left" data-testid="left-panel" data-ui aria-label="Pages et calques">
      <FileHeader />
      <PagesPanel />
      <LayersPanel />
    </aside>
  )
}
