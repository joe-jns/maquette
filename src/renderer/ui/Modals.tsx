import { useEffect, useRef } from 'react'
import { createStore, useStore } from 'zustand'
import { DocumentPanel } from '../panels/design/DocumentPanel'
import { DirectionPanel } from '../panels/direction/DirectionPanel'

/** Fenêtres de l'éditeur : Variables (barre du bas) et Direction (menu du fichier). */
export type ModalId = 'variables' | 'direction'

export const modalStore = createStore<{ open: ModalId | null; toggle(id: ModalId): void; close(): void }>()((set, get) => ({
  open: null,
  toggle: (id) => set({ open: get().open === id ? null : id }),
  close: () => set({ open: null }),
}))
export const useModal = () => useStore(modalStore, (s) => s.open)

const TITLES: Record<ModalId, string> = { variables: 'Variables', direction: 'Art direction' }

const CLOSE_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/**
 * Fenêtre centrée sur fond assombri. Se ferme par Échap, la croix ou un clic sur le fond ;
 * le focus revient ensuite où il était.
 */
function Modal({ id }: { id: ModalId }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) modalStore.getState().close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])
  const close = () => modalStore.getState().close()
  return (
    <div
      className="modal-backdrop"
      data-ui
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={box}
        className={`modal modal-${id} panel`}
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[id]}
        data-testid={`floating-${id}`}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2>{TITLES[id]}</h2>
          <button type="button" className="icon-button" aria-label="Close" data-tooltip="Close" data-shortcut="Esc" onClick={close}>
            {CLOSE_ICON}
          </button>
        </header>
        <div className="modal-body">{id === 'variables' ? <DocumentPanel /> : <DirectionPanel />}</div>
      </div>
    </div>
  )
}

export function Modals() {
  const open = useModal()
  return open ? <Modal key={open} id={open} /> : null
}
