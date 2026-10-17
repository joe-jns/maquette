import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './icons'
import './quick-menu.css'

export type QuickMenuEntry =
  | {
      id: string
      label: string
      icon?: IconName
      shortcut?: string
      /** Défini : l'entrée est un choix exclusif (coche à gauche). */
      checked?: boolean
      disabled?: boolean
      onSelect(): void
    }
  | 'separator'

interface Props {
  /** Bouton qui ouvre le menu : il sert d'ancre et reprend le focus à la fermeture. */
  anchor: RefObject<HTMLElement | null>
  entries: QuickMenuEntry[]
  label: string
  /** Au-dessus de l'ancre (barre du bas) ou en dessous. */
  placement: 'above' | 'below'
  align?: 'start' | 'end'
  onClose(): void
}

const GAP = 8

/**
 * Petit menu sombre (style Figma) : rangées de 24 px, raccourci à droite, coche pour le choix courant.
 * Clavier : flèches, Début/Fin, Entrée ou Espace pour choisir, Échap pour fermer (le focus revient à l'ancre).
 */
export function QuickMenu({ anchor, entries, label, placement, align = 'start', onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const items = entries.filter((e) => e !== 'separator')

  // Place le menu contre l'ancre, sans sortir de la fenêtre.
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect()
    const menu = ref.current
    if (!a || !menu) return
    const w = menu.offsetWidth
    const h = menu.offsetHeight
    let left = align === 'end' ? a.right - w : a.left
    let top = placement === 'above' ? a.top - GAP - h : a.bottom + 4
    left = Math.max(GAP, Math.min(left, window.innerWidth - w - GAP))
    top = Math.max(GAP, Math.min(top, window.innerHeight - h - GAP))
    setPos({ left, top })
  }, [anchor, placement, align])

  // Focus sur le choix courant (ou la première entrée) : les flèches marchent tout de suite.
  useEffect(() => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])]
    ;(buttons.find((b) => b.getAttribute('aria-checked') === 'true') ?? buttons[0])?.focus()
  }, [])

  // Un clic ailleurs ferme (le clic sur l'ancre est laissé à son propre bouton, qui bascule).
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const blur = () => onClose()
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('blur', blur)
    }
  }, [anchor, onClose])

  const close = (refocus: boolean) => {
    onClose()
    if (refocus) anchor.current?.focus()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Rien ne remonte au canevas (flèches = décalage, Échap = désélection).
    e.stopPropagation()
    const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const go = (k: number) => buttons[(k + buttons.length) % buttons.length]?.focus()
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        go(i + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        go(i < 0 ? buttons.length - 1 : i - 1)
        break
      case 'Home':
        e.preventDefault()
        go(0)
        break
      case 'End':
        e.preventDefault()
        go(buttons.length - 1)
        break
      case 'Escape':
        e.preventDefault()
        close(true)
        break
      case 'Tab':
        e.preventDefault()
        close(true)
        break
    }
  }

  const hasChecks = items.some((e) => e.checked !== undefined)
  const hasIcons = items.some((e) => e.icon)

  return createPortal(
    <div
      ref={ref}
      className="quick-menu"
      role="menu"
      aria-label={label}
      data-ui
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === 'separator' ? (
          <div key={`sep-${i}`} className="quick-menu-separator" role="separator" />
        ) : (
          <button
            key={entry.id}
            type="button"
            role={entry.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={entry.checked}
            tabIndex={-1}
            disabled={entry.disabled}
            data-menu-item={entry.id}
            onClick={() => {
              close(true)
              entry.onSelect()
            }}
          >
            {hasChecks && <span className="quick-menu-check">{entry.checked && <Icon name="check" size={16} />}</span>}
            {hasIcons && <span className="quick-menu-icon">{entry.icon && <Icon name={entry.icon} size={16} />}</span>}
            <span className="quick-menu-label">{entry.label}</span>
            {entry.shortcut && <kbd className="quick-menu-shortcut">{entry.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
