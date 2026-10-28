import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChatPanel } from '../chat/ChatPanel'
import { chatStore, useChat } from '../chat/chatStore'
import { shortcutKeys } from '../canvas/shortcuts'
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
            { id: 'home', label: 'Accueil', shortcut: 'Ctrl+Maj+H', onSelect: () => void runCommand('home') },
            'separator',
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

const WIDTH_KEY = 'maquette.leftWidth'
const MIN_W = 240
const MAX_W = 640
const DEFAULT_W = 320

const clampWidth = (w: number) => Math.round(Math.min(MAX_W, Math.max(MIN_W, w)))

function readWidth(): number {
  try {
    const v = Number(globalThis.localStorage?.getItem(WIDTH_KEY))
    return v ? clampWidth(v) : DEFAULT_W
  } catch {
    return DEFAULT_W
  }
}

/** Largeur du panneau gauche : variable CSS de la page, gardée d'une session à l'autre. */
function applyWidth(w: number): void {
  document.documentElement.style.setProperty('--panel-left-w', `${w}px`)
}

/** Poignée sur le bord droit du panneau : glisser pour l'élargir, double-clic pour revenir à la largeur par défaut. */
function ResizeHandle() {
  useEffect(() => applyWidth(readWidth()), [])
  const save = (w: number) => {
    applyWidth(w)
    try {
      globalThis.localStorage?.setItem(WIDTH_KEY, String(w))
    } catch {
      /* stockage indisponible : la largeur vaut pour la session */
    }
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const left = el.parentElement!.getBoundingClientRect().left
    const move = (ev: globalThis.PointerEvent) => applyWidth(clampWidth(ev.clientX - left))
    const up = (ev: globalThis.PointerEvent) => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('lostpointercapture', up)
      save(clampWidth(ev.clientX - left))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('lostpointercapture', up)
  }
  return (
    <div
      className="panel-resize"
      data-testid="left-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      onPointerDown={onPointerDown}
      onDoubleClick={() => save(DEFAULT_W)}
    />
  )
}

/** Panneau gauche : fichier, puis deux onglets, Claude (le chat) et Layers (pages et calques). */
export function LeftPanel() {
  const chat = useChat((s) => s.open)
  return (
    <aside className="panel panel-left" data-testid="left-panel" data-ui aria-label="Claude and layers">
      <FileHeader />
      <div className="panel-tabs">
        <div className="panel-tablist" role="tablist" aria-label="Left panel">
          <button
            type="button"
            role="tab"
            aria-selected={chat}
            data-tooltip="Chat with Claude"
            data-shortcut={shortcutKeys('toggleChat')}
            onClick={() => chatStore.getState().setOpen(true)}
          >
            Claude
          </button>
          <button type="button" role="tab" aria-selected={!chat} onClick={() => chatStore.getState().setOpen(false)}>
            Layers
          </button>
        </div>
      </div>
      {chat ? (
        <ChatPanel />
      ) : (
        <>
          <PagesPanel />
          <LayersPanel />
        </>
      )}
      <ResizeHandle />
    </aside>
  )
}
