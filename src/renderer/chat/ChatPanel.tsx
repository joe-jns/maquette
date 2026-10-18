import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { chatImageUrl, NEW_CONVERSATION_TITLE, type ChatImageRef, type ChatItem, type PermissionDecision } from '../../shared/chat'
import { nodeElement } from '../canvas/rects'
import { shortcutKeys } from '../canvas/shortcuts'
import { docStore, useDoc } from '../state/store'
import { useUi } from '../state/ui'
import { chatStore, MAX_IMAGES, useChat } from './chatStore'
import { Checkbox } from '../ui/Checkbox'
import { BUSY_NOTICE, changeOptions, chatApi, newConversation, refreshConversations, selectionContext, selectionLabel } from './connect'
import { ConversationMenu } from './ConversationMenu'
import { imageFiles, readImage } from './images'
import { MessageText } from './MessageText'
import './chat.css'

/** Taille d'origine d'une image du canevas, lue sur l'élément affiché (null si pas encore chargée). */
function naturalSize(id: string): { width: number; height: number } | null {
  const el = nodeElement(id)
  return el instanceof HTMLImageElement && el.naturalWidth ? { width: el.naturalWidth, height: el.naturalHeight } : null
}

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
const CHEVRON = 'M9 6l6 6-6 6'
const CHEVRON_DOWN = 'M6 9l6 6 6-6'

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
  images: 'Cherche des photos',
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

// ——— Images ———

/** Vignettes cliquables (aperçu en grand), trois par ligne au plus. */
function Thumbs({ refs, label, className = '' }: { refs: ChatImageRef[]; label: string; className?: string }) {
  return (
    <div className={`chat-images${refs.length === 1 ? ' is-single' : ''} ${className}`} data-count={refs.length}>
      {refs.map((ref, i) => (
        <button
          key={`${ref.hash}-${i}`}
          type="button"
          className="chat-image"
          aria-label={refs.length > 1 ? `Agrandir ${label} ${i + 1}` : `Agrandir ${label}`}
          onClick={() => chatStore.getState().setPreview(ref)}
        >
          <img src={chatImageUrl(ref.hash)} alt="" width={ref.width} height={ref.height} draggable={false} />
        </button>
      ))}
    </div>
  )
}

/** Image en grand par-dessus l'app : Échap, un clic ou le bouton ferment ; le focus revient où il était. */
function Lightbox() {
  const preview = useChat((s) => s.preview)
  if (!preview) return null
  return createPortal(<LightboxView image={preview} />, document.body)
}

function LightboxView({ image }: { image: ChatImageRef }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const close = () => chatStore.getState().setPreview(null)

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()
    // Capture sur la fenêtre : aucun raccourci de l'éditeur ne passe sous l'aperçu.
    const onKey = (e: globalThis.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'Tab') {
        // Un seul élément à atteindre : le focus reste sur Fermer.
        e.preventDefault()
        closeButton.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (before?.isConnected) before.focus()
    }
  }, [])

  return (
    <div
      className="chat-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de l’image"
      data-ui
      onClick={close}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Les petites images sont doublées (480 px de large au moins quand c'est possible) ; l'écran borne le reste. */}
      <img
        src={chatImageUrl(image.hash)}
        alt=""
        width={image.width}
        height={image.height}
        style={{ width: Math.round(image.width * Math.min(2, Math.max(1, 480 / image.width))) }}
        draggable={false}
      />
      <button ref={closeButton} type="button" className="chat-lightbox-close" aria-label="Fermer l’aperçu" data-tooltip="Fermer" data-shortcut="Échap" onClick={close}>
        <Icon d={CLOSE} size={16} width={2} />
      </button>
    </div>
  )
}

// ——— Outils ———

/** Bloc de texte du détail d'un outil, sélectionnable, avec un bouton Copier. */
function DetailBlock({ title, text, error, children }: { title: string; text: string | null; error?: boolean; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const copy = () => {
    if (!text) return
    void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined)
  }
  return (
    <section className="chat-detail" aria-label={title}>
      <header className="chat-detail-head">
        <h3>{title}</h3>
        {text ? (
          <button type="button" className="chat-detail-copy" aria-label={`Copier : ${title.toLowerCase()}`} data-tooltip={copied ? 'Copié' : 'Copier'} onClick={copy}>
            {copied ? 'Copié' : 'Copier'}
          </button>
        ) : null}
      </header>
      {text !== null && <pre className={`chat-detail-text${error ? ' is-error' : ''}`}>{text || '(vide)'}</pre>}
      {children}
    </section>
  )
}

function ToolDetail({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const images = item.images ?? []
  return (
    <div className="chat-tool-detail">
      {item.input ? <DetailBlock title="Entrée" text={item.input} /> : null}
      {item.status === 'running' && item.output === undefined ? (
        <p className="chat-detail-wait">En cours…</p>
      ) : (
        <DetailBlock title="Résultat" text={item.output || !images.length ? (item.output ?? '') : null} error={item.status === 'error'}>
          {images.length > 0 && <Thumbs refs={images} label="l’image vue par Claude" />}
        </DetailBlock>
      )}
    </div>
  )
}

/** Ligne d'un outil : un clic (ou Entrée, Espace) déplie ce que Claude a envoyé et ce qu'il a reçu. */
function ToolLine({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  const label = `${toolLabel(item.name)}${item.summary ? ` · ${item.summary}` : ''}`
  // L'ancien historique n'a pas le détail : la ligne ne se déplie pas.
  const expandable = item.input !== undefined || item.output !== undefined || !!item.images?.length
  const first = item.images?.[0]
  const toggle = () => setOpen((o) => !o)
  const row = (
    <div
      className={`chat-tool is-${item.status}${expandable ? ' is-expandable' : ''}`}
      data-tooltip={label}
      data-status={item.status}
      {...(expandable
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-expanded': open,
            onClick: toggle,
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggle()
              }
            },
          }
        : {})}
    >
      <span className="chat-tool-state" aria-hidden>
        {item.status === 'done' ? '✓' : item.status === 'error' ? '!' : <span className="chat-dot" />}
      </span>
      <span className="chat-tool-name">{toolLabel(item.name)}</span>
      {item.summary && <span className="chat-tool-summary">{item.summary}</span>}
      <span className="visually-hidden">{item.status === 'running' ? ' (en cours)' : item.status === 'error' ? ' (erreur)' : ' (fait)'}</span>
      {first && !open && <img className="chat-tool-peek" src={chatImageUrl(first.hash)} alt="" draggable={false} />}
      {expandable && (
        <span className="chat-tool-chevron" aria-hidden>
          <Icon d={CHEVRON} size={12} width={2} />
        </span>
      )}
    </div>
  )
  if (!expandable) return row
  return (
    <div className={`chat-tool-entry${open ? ' is-open' : ''}`}>
      {row}
      {open && <ToolDetail item={item} />}
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
      <div className={`chat-tool ${allowed ? 'is-done' : 'is-denied'}`} data-tooltip={`${label}${item.summary ? ` · ${item.summary}` : ''}`}>
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
    case 'user': {
      const thumbs = Array.isArray(item.thumbs) ? item.thumbs : []
      // Vignettes absentes (ancien historique, format illisible) : on dit combien d'images sont parties.
      const missing = item.images - thumbs.length
      return (
        <div className="chat-user">
          {(item.text || missing > 0 || !thumbs.length) && (
            <div className="chat-bubble">
              {item.text}
              {missing > 0 && <span className="chat-bubble-note">+ {missing} image{missing > 1 ? 's' : ''}</span>}
            </div>
          )}
          {thumbs.length > 0 && <Thumbs refs={thumbs} label="l’image jointe" className="chat-user-images" />}
        </div>
      )
    }
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
    const context = showSelection ? selectionContext(docStore.getState().doc, selection, naturalSize) : ''
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
          <button type="button" className="chat-send is-stop" aria-label="Arrêter" data-tooltip="Arrêter" onClick={() => chatApi()?.stop()}>
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg>
          </button>
        ) : (
          <button type="submit" className="chat-send" aria-label="Envoyer" data-tooltip="Envoyer" data-shortcut="Entrée" disabled={!canSend}>
            <Icon d={ARROW} size={16} width={2.2} />
          </button>
        )}
      </div>
    </form>
  )
}

// ——— Titre et menu des conversations ———

/** Titre de la conversation ouverte ; un clic ouvre la liste des conversations. */
function ConversationTitle() {
  const list = useChat((s) => s.conversations)
  const busy = useChat((s) => s.busy)
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const title = list?.conversations.find((c) => c.id === list.current)?.title ?? NEW_CONVERSATION_TITLE
  return (
    <>
      <button
        ref={button}
        type="button"
        className="chat-title"
        data-testid="chat-title"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conversation : ${title}`}
        data-tooltip="Conversations"
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          refreshConversations()
          setOpen(true)
        }}
      >
        <span className="chat-title-text">{title}</span>
        <Icon d={CHEVRON_DOWN} size={12} width={2} />
      </button>
      {open && list && button.current && (
        <ConversationMenu anchor={button.current} list={list} busy={busy} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

// ——— Panneau ———

export function ChatPanel() {
  const items = useChat((s) => s.items)
  const busy = useChat((s) => s.busy)
  const taste = useChat((s) => s.options.taste)
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
    if (!(await newConversation())) {
      setNotice(BUSY_NOTICE)
      return
    }
    setNotice(null)
    stuck.current = true
    chatStore.setState((s) => ({ focusRequest: s.focusRequest + 1 }))
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
        <ConversationTitle />
        <span
          className="chat-taste"
          data-testid="chat-taste"
          data-tooltip={taste ? 'Méthode taste-skill (règles maison strictes)' : 'Méthode de Pen (styles appliqués en entier) ; cocher pour taste-skill'}
        >
          <Checkbox checked={taste} onChange={(on) => changeOptions({ taste: on })}>taste-skill</Checkbox>
        </span>
        <button
          type="button"
          className="chat-head-button"
          aria-label="Nouvelle conversation"
          onClick={() => void reset()}
          disabled={items.length === 0 || busy}
          data-tooltip={busy ? 'Nouvelle conversation (après la réponse en cours)' : 'Nouvelle conversation'}
        >
          <Icon d={NEW} size={14} width={2} />
        </button>
        <button type="button" className="icon-button" aria-label="Fermer le chat" data-tooltip="Fermer le chat" data-shortcut={shortcutKeys('toggleChat')} onClick={() => chatStore.getState().setOpen(false)}>
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
      <Lightbox />
    </aside>
  )
}
