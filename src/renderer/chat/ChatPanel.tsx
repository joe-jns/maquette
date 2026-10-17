import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { ChatItem, PermissionDecision } from '../../shared/chat'
import { docStore, useDoc } from '../state/store'
import { useUi } from '../state/ui'
import { chatStore, MAX_IMAGES, useChat } from './chatStore'
import { chatApi, selectionContext, selectionLabel } from './connect'
import { imageFiles, readImage } from './images'
import { MessageText } from './MessageText'
import './chat.css'

const EXAMPLES = ['Ajoute une section tarifs à 3 colonnes', 'Vérifie le goût de ce cadre', 'Propose un titre plus fort']

/** Hauteur de ligne de la saisie (px) : la zone grandit de 1 à 8 lignes. */
const LINE = 20
const MAX_LINES = 8

function Icon({ d, size = 16, width = 1.8 }: { d: string; size?: number; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const CLOSE = 'M6 6l12 12M18 6L6 18'
const ARROW = 'M12 19V5M6 11l6-6 6 6'
const NEW = 'M12 5v14M5 12h14'

// ——— Éléments de la conversation ———

/** Noms lisibles des outils (Maquette et Claude Code) ; les autres restent tels quels. */
const TOOL_LABELS: Record<string, string> = {
  lire_document: 'Lit le document',
  lire_elements: 'Lit des éléments',
  chercher: 'Cherche dans le document',
  appliquer: 'Modifie la maquette',
  capture: 'Regarde le rendu',
  selection: 'Lit la sélection',
  verifier_gout: 'Vérifie le goût',
  ToolSearch: 'Prépare ses outils',
  Read: 'Lit un fichier',
  Write: 'Écrit un fichier',
  Edit: 'Modifie un fichier',
  Bash: 'Lance une commande',
  PowerShell: 'Lance une commande',
  Glob: 'Cherche des fichiers',
  Grep: 'Cherche dans les fichiers',
  WebFetch: 'Lit une page web',
  WebSearch: 'Cherche sur le web',
  TodoWrite: 'Note ses étapes',
  Task: 'Lance un sous-agent',
  Agent: 'Lance un sous-agent',
}
const toolLabel = (name: string) => TOOL_LABELS[name] ?? name

function ToolLine({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const label = `${toolLabel(item.name)}${item.summary ? ` · ${item.summary}` : ''}`
  return (
    <div className={`chat-tool is-${item.status}`} title={label} data-status={item.status}>
      <span className="chat-tool-state" aria-hidden>
        {item.status === 'done' ? '✓' : item.status === 'error' ? '!' : <span className="chat-dot" />}
      </span>
      <span className="chat-tool-name">{toolLabel(item.name)}</span>
      {item.summary && <span className="chat-tool-summary">{item.summary}</span>}
      <span className="visually-hidden">{item.status === 'running' ? ' (en cours)' : item.status === 'error' ? ' (erreur)' : ' (fait)'}</span>
    </div>
  )
}

function PermissionCard({ item }: { item: Extract<ChatItem, { kind: 'permission' }> }) {
  // Réponse envoyée : boutons inactifs jusqu'à ce que le principal renvoie l'élément tranché.
  const [sent, setSent] = useState(false)
  if (item.status !== 'asking') {
    const allowed = item.status === 'allowed'
    const label = `${allowed ? 'Autorisé' : 'Refusé'} : ${toolLabel(item.tool)}`
    return (
      <div className={`chat-tool ${allowed ? 'is-done' : 'is-denied'}`} title={`${label}${item.summary ? ` · ${item.summary}` : ''}`}>
        <span className="chat-tool-state" aria-hidden>{allowed ? '✓' : '×'}</span>
        <span className="chat-tool-name">{label}</span>
        {item.summary && <span className="chat-tool-summary">{item.summary}</span>}
      </div>
    )
  }
  const answer = (decision: PermissionDecision) => {
    setSent(true)
    chatApi()?.permission(item.requestId, decision)
  }
  return (
    <section className="chat-permission" aria-label={`Autorisation pour ${item.tool}`}>
      <p className="chat-permission-title">
        Claude veut utiliser <strong>{item.tool}</strong>
      </p>
      {item.summary && <pre className="chat-permission-summary">{item.summary}</pre>}
      <div className="chat-permission-actions">
        <button type="button" className="chat-button is-primary" disabled={sent} onClick={() => answer('allow')}>Autoriser</button>
        <button type="button" className="chat-button" disabled={sent} onClick={() => answer('deny')}>Refuser</button>
        <button type="button" className="chat-button is-wide" disabled={sent} onClick={() => answer('always')}>Toujours pour cette conversation</button>
      </div>
    </section>
  )
}

const caret = <span className="chat-caret" aria-hidden />

function Item({ item, last, busy }: { item: ChatItem; last: boolean; busy: boolean }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="chat-user">
          <div className="chat-bubble">
            {item.text}
            {item.images > 0 && <span className="chat-bubble-note">+ {item.images} image{item.images > 1 ? 's' : ''}</span>}
          </div>
        </div>
      )
    case 'assistant':
      return <div className="chat-assistant"><MessageText text={item.text} caret={busy && last ? caret : undefined} /></div>
    case 'tool':
      return <ToolLine item={item} />
    case 'permission':
      return <PermissionCard item={item} />
    case 'error':
      return <p className="chat-error" role="alert">{item.text}</p>
  }
}

/** Les outils qui se suivent forment un seul groupe compact. */
function groupItems(items: ChatItem[]): ChatItem[][] {
  const groups: ChatItem[][] = []
  for (const item of items) {
    const prev = groups[groups.length - 1]
    const compact = (i: ChatItem) => i.kind === 'tool' || (i.kind === 'permission' && i.status !== 'asking')
    if (prev && compact(item) && compact(prev[prev.length - 1]!)) prev.push(item)
    else groups.push([item])
  }
  return groups
}

function Welcome() {
  return (
    <div className="chat-welcome">
      <p>Demande à Claude de dessiner, corriger ou vérifier ta maquette.</p>
      <ul>
        {EXAMPLES.map((text) => (
          <li key={text}>
            <button
              type="button"
              onClick={() => {
                chatStore.getState().setDraft(text)
                chatStore.setState((s) => ({ focusRequest: s.focusRequest + 1 }))
              }}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ——— Saisie ———

function Composer() {
  const draft = useChat((s) => s.draft)
  const images = useChat((s) => s.images)
  const busy = useChat((s) => s.busy)
  const attached = useChat((s) => s.contextAttached)
  const focusRequest = useChat((s) => s.focusRequest)
  const selection = useUi((s) => s.selection)
  const doc = useDoc((s) => s.doc)
  const field = useRef<HTMLTextAreaElement>(null)

  const showSelection = attached && selection.length > 0
  const canSend = !busy && (draft.trim().length > 0 || images.length > 0)

  // Hauteur suivant le texte, de 1 à 8 lignes.
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    // Mesure sans barre de défilement : elle rétrécirait la ligne et ajouterait un retour à la ligne.
    const max = LINE * MAX_LINES + 8
    el.style.overflowY = 'hidden'
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [draft])

  useEffect(() => {
    field.current?.focus()
  }, [focusRequest])

  const send = () => {
    const api = chatApi()
    const s = chatStore.getState()
    if (!api || !canSend) return
    const context = showSelection ? selectionContext(docStore.getState().doc, selection) : ''
    api.send({ text: s.draft.trim(), context, images: s.images.map(({ mediaType, data }) => ({ mediaType, data })) })
    s.clearComposer()
    field.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <form
      className="chat-compose"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      {(showSelection || images.length > 0) && (
        <div className="chat-attachments">
          {showSelection && (
            <span className="chat-chip" data-testid="chat-selection">
              <span className="chat-chip-label">{selectionLabel(doc, selection)}</span>
              <button type="button" aria-label="Ne pas joindre la sélection" onClick={() => chatStore.getState().setContextAttached(false)}>
                <Icon d={CLOSE} size={12} width={2} />
              </button>
            </span>
          )}
          {images.map((img, i) => (
            <span key={img.id} className="chat-thumb">
              <img src={img.url} alt={`Image ${i + 1}`} />
              <button type="button" aria-label={`Retirer l’image ${i + 1}`} onClick={() => chatStore.getState().removeImage(img.id)}>
                <Icon d={CLOSE} size={10} width={2.4} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="chat-field">
        <textarea
          ref={field}
          rows={1}
          value={draft}
          placeholder="Écris à Claude…"
          aria-label="Message à Claude"
          onChange={(e) => chatStore.getState().setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button type="button" className="chat-send is-stop" aria-label="Arrêter" title="Arrêter" onClick={() => chatApi()?.stop()}>
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg>
          </button>
        ) : (
          <button type="submit" className="chat-send" aria-label="Envoyer" title="Envoyer (Entrée)" disabled={!canSend}>
            <Icon d={ARROW} size={16} width={2.2} />
          </button>
        )}
      </div>
    </form>
  )
}

// ——— Panneau ———

export function ChatPanel() {
  const items = useChat((s) => s.items)
  const busy = useChat((s) => s.busy)
  const log = useRef<HTMLDivElement>(null)
  // Collé en bas tant que l'utilisateur n'est pas remonté lire.
  const stuck = useRef(true)
  const [dropping, setDropping] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useLayoutEffect(() => {
    const el = log.current
    if (el && stuck.current) el.scrollTop = el.scrollHeight
  }, [items, busy])

  const addImages = async (files: File[]) => {
    let refused = 0
    for (const file of files) {
      if (chatStore.getState().images.length >= MAX_IMAGES) {
        setNotice(`${MAX_IMAGES} images au plus par message.`)
        return
      }
      const image = await readImage(file)
      if (image) chatStore.getState().addImage(image)
      else refused++
    }
    setNotice(refused ? 'Image illisible ou trop lourde.' : null)
  }

  // Coller une image : elle va au message, jamais au canevas.
  const onPaste = (e: ClipboardEvent) => {
    const files = imageFiles(e.clipboardData)
    if (!files.length) return
    e.preventDefault()
    e.stopPropagation()
    void addImages(files)
  }
  const onDragOver = (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropping(true)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropping(false)
    void addImages(imageFiles(e.dataTransfer))
  }

  const reset = async () => {
    await chatApi()?.reset().catch(() => undefined)
    chatStore.getState().setItems([])
    stuck.current = true
  }

  const lastBusyLine: ReactNode =
    busy && items[items.length - 1]?.kind !== 'assistant' && items[items.length - 1]?.kind !== 'permission' && items[items.length - 1]?.kind !== 'tool'
      ? <div className="chat-assistant chat-thinking" aria-label="Claude réfléchit">{caret}</div>
      : null

  return (
    <aside
      className={`panel chat${dropping ? ' is-dropping' : ''}`}
      data-testid="chat-panel"
      data-ui
      aria-label="Chat avec Claude"
      onPaste={onPaste}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={onDrop}
    >
      <header className="chat-head">
        <h2>Claude</h2>
        <button type="button" className="chat-head-button" onClick={() => void reset()} disabled={items.length === 0 && !busy} title="Nouvelle conversation">
          <Icon d={NEW} size={14} width={2} />
          <span>Nouvelle conversation</span>
        </button>
        <button type="button" className="icon-button" aria-label="Fermer le chat" title="Fermer (Ctrl+L)" onClick={() => chatStore.getState().setOpen(false)}>
          <Icon d={CLOSE} size={14} width={1.8} />
        </button>
      </header>
      <div
        ref={log}
        className="chat-log"
        role="log"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {items.length === 0 && !busy ? (
          <Welcome />
        ) : (
          <>
            {groupItems(items).map((group) =>
              group.length > 1 ? (
                <div key={group[0]!.id} className="chat-tools">
                  {group.map((item) => <Item key={item.id} item={item} last={false} busy={busy} />)}
                </div>
              ) : (
                <Item key={group[0]!.id} item={group[0]!} last={group[0] === items[items.length - 1]} busy={busy} />
              ),
            )}
            {lastBusyLine}
          </>
        )}
      </div>
      {notice && <p className="chat-notice" role="status">{notice}</p>}
      <Composer />
      {dropping && <div className="chat-drop" aria-hidden><span>Dépose l’image pour la joindre</span></div>}
    </aside>
  )
}
