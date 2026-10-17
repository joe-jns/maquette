import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PICKER_FILE, styleThumbUrl, type ChatStyle, type PickerEntry } from '../../shared/chatStyle'
import { chatStore, useChat } from './chatStore'
import { changeOptions } from './connect'
import '../dialog/dialog.css'

/** Liste du sélecteur, lue une fois (vendor/design/thumbs/picker.json). */
let entries: Promise<PickerEntry[]> | null = null
function loadEntries(): Promise<PickerEntry[]> {
  entries ??= (window.maquette?.design?.read(PICKER_FILE) ?? Promise.resolve(null)).then((text) => {
    const list: unknown = text ? JSON.parse(text) : []
    if (!Array.isArray(list)) return []
    return list.filter((e): e is PickerEntry => !!e && typeof e.name === 'string' && typeof e.style === 'string' && typeof e.web === 'string' && typeof e.mobile === 'string')
  })
  entries.catch(() => (entries = null))
  return entries
}

const choose = (style: ChatStyle | null) => {
  changeOptions({ style })
  chatStore.getState().setStylePicker(false)
}

/** « Choisir un style », comme le « Choose a style » de Pen : vignettes web + mobile, ou aucun style. */
export function StylePicker() {
  const open = useChat((s) => s.stylePicker)
  if (!open) return null
  return createPortal(<StylePickerView />, document.body)
}

function StylePickerView() {
  const current = useChat((s) => s.options.style)
  const [list, setList] = useState<PickerEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const close = () => chatStore.getState().setStylePicker(false)

  useEffect(() => {
    let alive = true
    loadEntries().then(
      (l) => alive && setList(l),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [])

  // Le style choisi (ou « Aucun style ») a le focus, une fois la liste là.
  useEffect(() => {
    const selected = card.current?.querySelector<HTMLButtonElement>('.chat-style-picker-grid [aria-pressed="true"]')
    selected?.focus()
    selected?.scrollIntoView({ block: 'nearest' })
  }, [list])

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Capture sur la fenêtre : aucun raccourci de l'éditeur ne passe sous le sélecteur.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'Tab') {
        // Le focus tourne dans la fenêtre.
        const buttons = [...(card.current?.querySelectorAll('button') ?? [])]
        if (!buttons.length) return
        e.preventDefault()
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]!.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (before?.isConnected) before.focus()
    }
  }, [])

  return (
    <div className="dialog-backdrop" data-ui onPointerDown={close} onMouseDown={(e) => e.preventDefault()}>
      <div
        ref={card}
        className="dialog chat-style-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-style-picker-title"
        data-testid="chat-style-picker"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="chat-style-picker-head">
          <div>
            <h2 id="chat-style-picker-title">Choisir un style</h2>
            <p className="dialog-detail">Un style ajoute la typographie, les couleurs, les formes et l’imagerie à ta demande.</p>
          </div>
          <button type="button" className="chat-style-picker-close" aria-label="Fermer" data-tooltip="Fermer" data-shortcut="Échap" onClick={close}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="chat-style-picker-grid">
          <button type="button" className="chat-style-picker-none" aria-pressed={current === null} onClick={() => choose(null)}>
            <span className="chat-style-picker-none-title">Aucun style</span>
            <span className="chat-style-picker-none-detail">Le prompt décide</span>
          </button>
          {list?.map((e) => (
            <button
              key={e.name}
              type="button"
              className="chat-style-picker-item"
              aria-pressed={current?.name === e.name}
              onClick={() => choose({ name: e.name, style: e.style, params: e.params })}
            >
              <span className="chat-style-picker-thumbs" aria-hidden>
                <img src={styleThumbUrl(e.web)} alt="" loading="lazy" draggable={false} />
                <img src={styleThumbUrl(e.mobile)} alt="" loading="lazy" draggable={false} />
              </span>
              <span className="chat-style-picker-name">{e.name}</span>
            </button>
          ))}
        </div>
        {failed && <p className="dialog-detail" role="alert">Styles illisibles (réinstallez Maquette).</p>}
      </div>
    </div>
  )
}
