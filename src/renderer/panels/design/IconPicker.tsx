import { useEffect, useMemo, useRef, useState } from 'react'
import { ICON_SET_LABELS, ICON_SETS, iconNames, PHOSPHOR_WEIGHTS, searchIconsIn } from '../../../core/icons/sets'
import type { IconSet, PhosphorWeight } from '../../../core/types'
import { IconSvg } from '../../canvas/IconSvg'
import { Select, type SelectOption } from '../../ui/Select'

const COLS = 6
const CELL = 30
const HEIGHT = 7 * CELL
/** Rangées dessinées en plus au-dessus et au-dessous de la zone visible. */
const MARGIN = 2

/** Jeu, variante Phosphor et forme Material choisis dans le sélecteur. */
export interface IconStyle { set: IconSet; weight?: PhosphorWeight; filled?: boolean }

const SET_OPTIONS: SelectOption<IconSet>[] = ICON_SETS.map((s) => ({ value: s, label: ICON_SET_LABELS[s] }))
const WEIGHT_OPTIONS: SelectOption<PhosphorWeight>[] = PHOSPHOR_WEIGHTS.map((w) => ({ value: w, label: w[0]!.toUpperCase() + w.slice(1) }))

/** Dernier jeu choisi : le sélecteur d'insertion rouvre dessus. */
let lastStyle: IconStyle = { set: 'lucide' }

/**
 * Sélecteur d'icône : jeu (Lucide, Phosphor, Feather, Material Rounded), variante Phosphor ou forme
 * pleine Material, recherche (français ou anglais) et grille virtualisée (seules les rangées visibles
 * sont dessinées). Entrée prend la première icône, Échap ferme, un clic dehors aussi.
 */
export function IconPicker({ current, style, onPick, onClose, className, label = 'Choose an icon' }: {
  current?: string
  /** Jeu et variante de l'icône actuelle ; absent : le dernier jeu choisi. */
  style?: IconStyle
  onPick(name: string, style: IconStyle): void
  onClose(): void
  className?: string
  label?: string
}) {
  const [query, setQuery] = useState('')
  const [scroll, setScroll] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  const [chosen, setChosen] = useState<IconStyle>(() => style ?? lastStyle)
  const { set } = chosen
  const weight = set === 'phosphor' ? (chosen.weight ?? 'regular') : undefined
  const filled = set === 'material-rounded' ? chosen.filled === true : undefined
  const box = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const names = iconNames(set)
  const results = useMemo(() => (query.trim() ? searchIconsIn(set, query, names.length) : names), [query, set, names])
  const pick = (name: string) => {
    const picked: IconStyle = { set, ...(weight ? { weight } : {}), ...(filled !== undefined ? { filled } : {}) }
    lastStyle = picked
    onPick(name, picked)
  }

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Element | null
      // Le bouton qui ouvre le sélecteur le referme lui-même ; la liste d'un champ du sélecteur est hors de sa boîte.
      if (target?.closest?.('[data-icon-trigger], .select-menu')) return
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [onClose])

  // Nouvelle recherche ou autre jeu : retour en haut de la grille.
  useEffect(() => {
    if (grid.current) grid.current.scrollTop = 0
    setScroll(0)
  }, [query, set])

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
      <div className="icon-picker-sets">
        <Select label="Icon set" value={set} options={SET_OPTIONS} placement="below" onChange={(s) => setChosen((c) => ({ ...c, set: s }))} />
        {set === 'phosphor' && (
          <Select label="Icon weight" value={weight!} options={WEIGHT_OPTIONS} placement="below" onChange={(w) => setChosen((c) => ({ ...c, weight: w }))} />
        )}
        {set === 'material-rounded' && (
          <button
            type="button"
            className="icon-picker-toggle"
            aria-pressed={filled}
            onClick={() => setChosen((c) => ({ ...c, filled: !c.filled }))}
          >
            Filled
          </button>
        )}
      </div>
      <input
        autoFocus
        type="search"
        aria-label="Search icons"
        placeholder={`Search ${names.length} icons`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) pick(results[0])
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
                aria-selected={name === current && set === (style?.set ?? set)}
                style={{ position: 'absolute', left: (k % COLS) * CELL, top: Math.floor(k / COLS) * CELL, width: CELL, height: CELL }}
                onMouseEnter={() => setHover(name)}
                onMouseLeave={() => setHover((h) => (h === name ? null : h))}
                onClick={() => pick(name)}
              >
                <IconSvg name={name} set={set} weight={weight} filled={filled} size={16} strokeWidth={1.75} />
              </button>
            )
          })}
        </div>
        {results.length === 0 && <p className="empty-note">No matching icons.</p>}
      </div>
      <p className="icon-picker-name" aria-live="polite">
        {hover ?? (query.trim() ? `${results.length} icon${results.length > 1 ? 's' : ''}` : current ?? ICON_SET_LABELS[set])}
      </p>
    </div>
  )
}
