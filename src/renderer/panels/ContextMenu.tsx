import { useEffect, useRef } from 'react'

export interface MenuItem { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }

/** Petit menu contextuel : Échap ou un clic ailleurs le ferme ; flèches pour naviguer. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      data-ui
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') onClose()
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
          buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={item.danger ? 'danger' : undefined}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
