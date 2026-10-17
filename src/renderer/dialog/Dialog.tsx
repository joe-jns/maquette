import { useEffect, useRef, useState } from 'react'
import { ask, dialogStore, useDialog, type PendingDialog } from './dialogStore'
import './dialog.css'

/** Fenêtre de question de l'app : une à la fois, les suivantes attendent leur tour. */
export function Dialog() {
  const current = useDialog((s) => s.queue[0])
  // Questions du processus principal : même fenêtre, même file.
  useEffect(() => window.maquette.onDialogAsk(ask), [])
  return current ? <Backdrop pending={current} /> : null
}

/** Fond assombri : le même tant que des questions attendent (un clic dessus ne perd pas la suivante). */
function Backdrop({ pending }: { pending: PendingDialog }) {
  // Élément qui avait le focus avant la première question : il le retrouve après la dernière.
  const [before] = useState(() => document.activeElement as HTMLElement | null)
  useEffect(
    () => () => {
      if (before?.isConnected) before.focus()
    },
    [before],
  )
  return (
    <div
      className="dialog-backdrop"
      data-ui
      onPointerDown={() => dialogStore.getState().answer(pending.id, pending.request.cancelIndex)}
      // Le clic sur le fond ne retire pas le focus à la question suivante.
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Une clé par question : focus et clavier repartent de zéro pour la suivante. */}
      <DialogCard key={pending.id} pending={pending} />
    </div>
  )
}

function DialogCard({ pending }: { pending: PendingDialog }) {
  const { id, request } = pending
  const card = useRef<HTMLDivElement>(null)
  const answer = (index: number) => dialogStore.getState().answer(id, index)
  const titleId = `dialog-${id}-title`
  const textId = `dialog-${id}-text`

  useEffect(() => {
    const buttons = () => [...(card.current?.querySelectorAll('button') ?? [])]
    buttons()[request.defaultIndex]?.focus()
    // Capture sur la fenêtre : aucun raccourci du canevas ne passe sous la question.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        answer(request.cancelIndex)
      } else if (e.key === 'Enter') {
        // Un bouton qui a le focus répond lui-même ; sinon, le bouton par défaut.
        if ((e.target as Element | null)?.closest?.('.dialog button')) return
        e.preventDefault()
        answer(request.defaultIndex)
      } else if (e.key === 'Tab') {
        // Le focus tourne entre les boutons, sans sortir de la fenêtre.
        e.preventDefault()
        const list = buttons()
        if (!list.length) return
        const at = list.indexOf(document.activeElement as HTMLButtonElement)
        const next = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + list.length) % list.length
        list[next]!.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <div
      ref={card}
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={request.title || request.detail ? textId : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Sans titre, le message tient lieu de titre. */}
      <h2 id={titleId}>{request.title ?? request.message}</h2>
      <div id={textId}>
        {request.title && <p className="dialog-message">{request.message}</p>}
        {request.detail && <p className="dialog-detail">{request.detail}</p>}
      </div>
      {request.code && <pre className="dialog-code">{request.code}</pre>}
      <div className="dialog-buttons">
        {request.buttons.map((b, i) => (
          <button key={i} type="button" className={b.kind && b.kind !== 'default' ? `is-${b.kind}` : undefined} onClick={() => answer(i)}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}
