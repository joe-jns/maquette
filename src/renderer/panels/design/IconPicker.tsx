import { useEffect, useMemo, useRef, useState } from 'react'
import { ICON_NAMES, searchIcons } from '../../../core/icons/lucide'
import { IconSvg } from '../../canvas/IconSvg'

const COLS = 6
const CELL = 30
const HEIGHT = 7 * CELL
/** Rangées dessinées en plus au-dessus et au-dessous de la zone visible. */
const MARGIN = 2

/**
 * Sélecteur d'icône Lucide : recherche (français ou anglais) et grille virtualisée (seules les
 * rangées visibles sont dessinées). Entrée prend la première icône, Échap ferme, un clic dehors aussi.
 */
export function IconPicker({ current, onPick, onClose, className, label = 'Choose an icon' }: {
  current?: string
  onPick(name: string): void
  onClose(): void
  className?: string
  label?: string
}) {
  const [query, setQuery] = useState('')
  const [scroll, setScroll] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const results = useMemo(() => (query.trim() ? searchIcons(query, ICON_NAMES.length) : ICON_NAMES), [query])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      // Le bouton qui ouvre le sélecteur le referme lui-même.
      if ((e.target as Element | null)?.closest?.('[data-icon-trigger]')) return
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [onClose])

  // Nouvelle recherche : retour en haut de la grille.
  useEffect(() => {
    if (grid.current) grid.current.scrollTop = 0
    setScroll(0)
  }, [query])

  const rows = Math.ceil(results.length / COLS)
  const first = Math.max(0, Math.floor(scroll / CELL) - MARGIN)
  const last = Math.min(rows, Math.ceil((scroll + HEIGHT) / CELL) + MARGIN)
  const shown = results.slice(first * COLS, last * COLS)

  return (
    <div
      className={`icon-picker${className ? ` ${className}` : ''}`}
      ref={box}
      role="dialog"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        // Échap ferme le sélecteur, sans aller jusqu'au canevas (qui désélectionnerait).
        e.stopPropagation()
        onClose()
      }}
    >
      <input
        autoFocus
        type="search"
        aria-label="Search icons"
        placeholder={`Search ${ICON_NAMES.length} icons`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) onPick(results[0])
        }}
      />
      <div
        className="icon-grid"
        ref={grid}
        role="listbox"
        aria-label="Icons"
        style={{ height: HEIGHT }}
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
      >
        <div style={{ position: 'relative', height: rows * CELL }}>
          {shown.map((name, i) => {
            const k = first * COLS + i
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-label={name}
                aria-selected={name === current}
                style={{ position: 'absolute', left: (k % COLS) * CELL, top: Math.floor(k / COLS) * CELL, width: CELL, height: CELL }}
                onMouseEnter={() => setHover(name)}
                onMouseLeave={() => setHover((h) => (h === name ? null : h))}
                onClick={() => onPick(name)}
              >
                <IconSvg name={name} size={16} strokeWidth={1.75} />
              </button>
            )
          })}
        </div>
        {results.length === 0 && <p className="empty-note">No matching icons.</p>}
      </div>
      <p className="icon-picker-name" aria-live="polite">
        {hover ?? (query.trim() ? `${results.length} icon${results.length > 1 ? 's' : ''}` : current ?? 'Lucide')}
      </p>
    </div>
  )
}
