import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ariaKeys, firstIndex, isFocusable, isSeparator, lastIndex, stepIndex, tidy, type MenuEntry } from './menuModel'
import { placeMenu, placeSubmenu, type Box } from './placement'
import './menu.css'

export { SEPARATOR, type MenuEntry, type MenuAction } from './menuModel'

/**
 * Menu unique de l'application (menu contextuel du canevas, des calques, des pages), style Figma UI3 :
 * raccourcis à droite, séparateurs, sous-menus ›.
 *
 * Souris : survol = surbrillance, sous-menu ouvert au survol ; clic ailleurs, Échap ou perte de la
 * fenêtre = fermeture. Clavier : ↑ ↓ Début Fin, Entrée ou Espace, → ouvre un sous-menu, ← ou Échap
 * le referme. Le focus revient où il était à la fermeture.
 */
export function Menu({ x, y, items, onClose, label }: {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
  label?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  // Focus rendu à l'élément d'avant, sauf si l'action l'a donné ailleurs (champ de renommage…).
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const layer = root.current
    return () => {
      const now = document.activeElement
      const lost = !now || now === document.body || (layer?.contains(now) ?? false)
      if (lost && before?.isConnected && before !== document.body) before.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const outside = (e: Event) => {
      if (!(e.target instanceof Node) || !root.current?.contains(e.target)) close.current()
    }
    const shut = () => close.current()
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('wheel', outside, { capture: true, passive: true })
    window.addEventListener('blur', shut)
    window.addEventListener('resize', shut)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('wheel', outside, true)
      window.removeEventListener('blur', shut)
      window.removeEventListener('resize', shut)
    }
  }, [])

  return createPortal(
    <div ref={root} className="menu-layer" data-ui onContextMenu={(e) => e.preventDefault()}>
      <MenuList
        items={tidy(items)}
        anchor={{ kind: 'point', x, y }}
        label={label}
        focus="menu"
        onCloseAll={() => close.current()}
      />
    </div>,
    document.body,
  )
}

type Anchor = { kind: 'point'; x: number; y: number } | { kind: 'sub'; parent: Box; rowTop: number }

interface Open { index: number; anchor: Anchor; focus: 'first' | 'none' }

function MenuList({ items, anchor, label, focus, onCloseAll, onBack }: {
  items: MenuEntry[]
  anchor: Anchor
  label?: string
  /** À l'ouverture : focus sur le menu (rien en surbrillance), sur la première rangée, ou nulle part. */
  focus: 'menu' | 'first' | 'none'
  onCloseAll: () => void
  /** Sous-menu : le refermer et revenir à la rangée qui l'a ouvert. */
  onBack?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState<Open | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const activate = (i: number, moveFocus = true) => {
    setActive(i)
    if (moveFocus) (i >= 0 ? rows.current[i] : ref.current)?.focus({ preventScroll: true })
  }

  // Placement mesuré avant l'affichage, puis focus initial.
  useLayoutEffect(() => {
    const el = ref.current!
    const size = { width: el.offsetWidth, height: el.offsetHeight }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    setPos(anchor.kind === 'point' ? placeMenu(anchor, size, viewport) : placeSubmenu(anchor.parent, anchor.rowTop, size, viewport))
    if (focus === 'menu') el.focus({ preventScroll: true })
    if (focus === 'first') activate(firstIndex(items))
    // L'ancre et la liste sont fixes pour la vie de ce menu : une seule fois.
  }, [])

  const openSub = (i: number, focusFirst: boolean) => {
    const row = rows.current[i]
    if (!row || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    setOpen({ index: i, anchor: { kind: 'sub', parent: box, rowTop: row.getBoundingClientRect().top }, focus: focusFirst ? 'first' : 'none' })
  }

  const choose = (i: number, e?: MouseEvent) => {
    const item = items[i]
    if (!isFocusable(item)) return
    if (item.submenu) {
      // Clavier (Entrée, Espace) : on entre dans le sous-menu ; souris : il s'ouvre, le focus reste.
      openSub(i, !e || e.detail === 0)
      return
    }
    onCloseAll()
    item.onSelect?.()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    // Rien ne remonte au canevas (Suppr, flèches, Échap y ont un autre sens).
    e.stopPropagation()
    const item = items[active]
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        setOpen(null)
        activate(stepIndex(items, active, e.key === 'ArrowDown' ? 1 : -1))
        return
      case 'Home':
      case 'End':
        e.preventDefault()
        setOpen(null)
        activate(e.key === 'Home' ? firstIndex(items) : lastIndex(items))
        return
      case 'ArrowRight':
        e.preventDefault()
        if (isFocusable(item) && item.submenu) openSub(active, true)
        return
      case 'ArrowLeft':
        e.preventDefault()
        onBack?.()
        return
      case 'Escape':
        e.preventDefault()
        if (onBack) onBack()
        else onCloseAll()
        return
      case 'Enter':
      case ' ':
        // Le bouton actif reçoit son clic natif ; sans rangée active, rien.
        if (active < 0) e.preventDefault()
        return
      case 'Tab':
        e.preventDefault()
        onCloseAll()
        return
    }
  }

  const sub = open ? items[open.index] : undefined
  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
      onPointerLeave={() => {
        if (!open) activate(-1, ref.current?.contains(document.activeElement) ?? false)
      }}
    >
      {items.map((item, i) => {
        if (isSeparator(item)) return <div key={`sep-${i}`} role="separator" className="menu-separator" />
        const expanded = open?.index === i
        return (
          <button
            key={`${i}-${item.label}`}
            ref={(el) => {
              rows.current[i] = el
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={['menu-item', item.danger && 'is-danger', (active === i || expanded) && 'is-active'].filter(Boolean).join(' ')}
            disabled={item.disabled}
            aria-haspopup={item.submenu ? 'menu' : undefined}
            aria-expanded={item.submenu ? expanded : undefined}
            aria-keyshortcuts={item.shortcut ? ariaKeys(item.shortcut) : undefined}
            onPointerEnter={() => {
              if (!isFocusable(item)) {
                activate(-1)
                setOpen(null)
                return
              }
              activate(i)
              if (item.submenu) {
                if (!expanded) openSub(i, false)
              } else setOpen(null)
            }}
            onClick={(e) => choose(i, e)}
          >
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut" aria-hidden>{item.shortcut}</span>}
            {item.submenu && (
              <svg className="menu-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                <path d="M6.5 4.5 10 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )
      })}
      {open && sub && !isSeparator(sub) && sub.submenu && (
        <MenuList
          key={`${open.index}-${open.focus}`}
          items={tidy(sub.submenu)}
          anchor={open.anchor}
          label={sub.label}
          focus={open.focus}
          onCloseAll={onCloseAll}
          onBack={() => {
            const at = open.index
            setOpen(null)
            activate(at)
          }}
        />
      )}
    </div>
  )
}
