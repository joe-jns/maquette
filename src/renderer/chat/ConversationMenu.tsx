import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ConversationList, ConversationSummary, OtherConversation } from '../../shared/chat'
import { fileName } from '../state/openDocument'
import { BUSY_NOTICE, openConversation, openOtherConversation, removeConversation, renameConversation } from './connect'
import { relativeDate } from './dates'
import '../ui/menu.css'

function Icon({ d, size = 12 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
const CHECK = 'M5 12.5l4.5 4.5L19 7.5'
const PENCIL = 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4'
const TRASH = 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'

/**
 * Menu des conversations, sous le titre du chat (style des menus de l'app, Figma UI3) : conversations du
 * fichier de la plus récente à la plus ancienne, puis « Autres fichiers ». Chaque conversation du fichier
 * se renomme (F2 ou crayon) et se supprime (Suppr ou corbeille, avec confirmation).
 *
 * Clavier : ↑ ↓ Début Fin entre les rangées, Entrée ouvre, Échap ou Tab ferme.
 */
export function ConversationMenu({ anchor, list, busy, onClose }: {
  /** Bouton du titre : le menu s'ouvre dessous, aligné à gauche. */
  anchor: HTMLElement
  list: ConversationList
  busy: boolean
  onClose: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const rows = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('[data-conv-row]') ?? [])]

  useLayoutEffect(() => {
    const el = box.current!
    const at = anchor.getBoundingClientRect()
    const margin = 8
    const left = Math.max(margin, Math.min(at.left, window.innerWidth - margin - el.offsetWidth))
    const top = Math.max(margin, Math.min(at.bottom + 4, window.innerHeight - margin - el.offsetHeight))
    setPos({ left: Math.round(left), top: Math.round(top) })
  }, [anchor])

  // Focus sur la conversation ouverte une fois le menu placé ; rendu au titre à la fermeture.
  const placed = pos !== null
  useLayoutEffect(() => {
    if (!placed) return
    const all = rows()
    ;(all.find((r) => r.dataset.current === 'true') ?? all[0] ?? root.current)?.focus({ preventScroll: true })
  }, [placed])

  useLayoutEffect(() => {
    return () => {
      const now = document.activeElement
      if ((!now || now === document.body || !now.isConnected) && anchor.isConnected) anchor.focus({ preventScroll: true })
    }
  }, [anchor])

  useEffect(() => {
    const outside = (e: Event) => {
      if (!(e.target instanceof Node) || (!root.current?.contains(e.target) && !anchor.contains(e.target))) close.current()
    }
    const shut = () => close.current()
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('blur', shut)
    window.addEventListener('resize', shut)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('blur', shut)
      window.removeEventListener('resize', shut)
    }
  }, [anchor])

  const open = async (c: ConversationSummary) => {
    if (c.id === list.current) {
      onClose()
      return
    }
    if (busy || !(await openConversation(c.id))) {
      setNotice(BUSY_NOTICE)
      return
    }
    onClose()
  }

  const openOther = (o: OtherConversation) => {
    if (o.missing) return
    if (busy) {
      setNotice(BUSY_NOTICE)
      return
    }
    onClose()
    void openOtherConversation(o)
  }

  const remove = (c: ConversationSummary) => {
    if (busy && c.id === list.current) {
      setNotice(BUSY_NOTICE)
      return
    }
    // La question s'affiche par-dessus l'app : le menu se ferme d'abord.
    onClose()
    void removeConversation(c.id, c.title)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Rien ne remonte au canevas ni au panneau (Suppr, flèches, Échap y ont un autre sens).
    e.stopPropagation()
    if (editing) return
    const all = rows()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => all[(i + all.length) % all.length]?.focus({ preventScroll: true })
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        go(at + 1)
        return
      case 'ArrowUp':
        e.preventDefault()
        go(at < 0 ? -1 : at - 1)
        return
      case 'Home':
        e.preventDefault()
        go(0)
        return
      case 'End':
        e.preventDefault()
        go(-1)
        return
      case 'Escape':
      case 'Tab':
        e.preventDefault()
        onClose()
        return
      case 'F2':
      case 'Delete': {
        const id = all[at]?.dataset.convId
        const c = list.conversations.find((x) => x.id === id)
        if (!c) return
        e.preventDefault()
        if (e.key === 'F2') setEditing(c.id)
        else remove(c)
      }
    }
  }

  return createPortal(
    <div ref={root} className="menu-layer" data-ui onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={box}
        className="menu conv-menu"
        role="menu"
        aria-label="Conversations"
        data-testid="chat-conversations"
        tabIndex={-1}
        style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}
        onKeyDown={onKeyDown}
      >
        {(busy || notice) && <p className="conv-notice" role="status">{notice ?? BUSY_NOTICE}</p>}
        {list.conversations.map((c) =>
          editing === c.id ? (
            <RenameRow key={c.id} conversation={c} onDone={() => {
              setEditing(null)
              requestAnimationFrame(() => rows().find((r) => r.dataset.convId === c.id)?.focus({ preventScroll: true }))
            }} />
          ) : (
            <div key={c.id} className="conv-row" data-current={c.id === list.current}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={c.id === list.current}
                tabIndex={-1}
                className="menu-item conv-item"
                data-conv-row
                data-conv-id={c.id}
                data-current={c.id === list.current}
                aria-disabled={busy && c.id !== list.current ? true : undefined}
                onPointerEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
                onClick={() => void open(c)}
              >
                <span className="conv-check">{c.id === list.current && <Icon d={CHECK} />}</span>
                <span className="menu-label">{c.title}</span>
                <span className="menu-shortcut conv-date">{relativeDate(c.updatedAt)}</span>
              </button>
              <span className="conv-actions">
                <button type="button" tabIndex={-1} className="conv-action" aria-label={`Rename “${c.title}”`} data-tooltip="Rename" data-shortcut="F2" onClick={() => setEditing(c.id)}>
                  <Icon d={PENCIL} />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  className="conv-action is-danger"
                  aria-label={`Delete “${c.title}”`}
                  data-tooltip={busy && c.id === list.current ? 'Stop the current reply first' : 'Delete'}
                  data-shortcut={busy && c.id === list.current ? undefined : 'Delete'}
                  aria-disabled={busy && c.id === list.current ? true : undefined}
                  onClick={() => remove(c)}
                >
                  <Icon d={TRASH} />
                </button>
              </span>
            </div>
          ),
        )}
        {list.others.length > 0 && (
          <>
            <div role="separator" className="menu-separator" />
            <p className="conv-section" role="presentation">Other files</p>
            {list.others.map((o) => (
              <button
                key={`${o.path}|${o.id}`}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`menu-item conv-item conv-other${o.missing ? ' is-missing' : ''}`}
                data-conv-row
                data-tooltip={o.missing ? `File not found: ${o.path}` : o.path}
                aria-disabled={o.missing || busy ? true : undefined}
                onPointerEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
                onClick={() => openOther(o)}
              >
                <span className="conv-check" />
                <span className="conv-other-text">
                  <span className="menu-label">{o.title}</span>
                  <span className="conv-file">{fileName(o.path).replace(/\.maquette$/i, '')}{o.missing ? ' · not found' : ''}</span>
                </span>
                <span className="menu-shortcut conv-date">{relativeDate(o.updatedAt)}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Renommage en place : Entrée ou clic ailleurs enregistre, Échap annule ; vide = titre automatique. */
function RenameRow({ conversation, onDone }: { conversation: ConversationSummary; onDone: () => void }) {
  const field = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(conversation.title)
  const finished = useRef(false)
  useLayoutEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  const finish = (save: boolean) => {
    if (finished.current) return
    finished.current = true
    if (save && value.trim() !== conversation.title) void renameConversation(conversation.id, value)
    onDone()
  }
  return (
    <div className="conv-row is-editing">
      <span className="conv-check" />
      <input
        ref={field}
        className="conv-rename"
        aria-label="New conversation title"
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            finish(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            finish(false)
          }
        }}
      />
    </div>
  )
}
