import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { edgeIndex, matchIndex, placeList, stepIndex } from './listNav'
import './select.css'

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  /** Texte discret à droite (une valeur, un raccourci). */
  hint?: string
  disabled?: boolean
  /** Pourquoi l'option est grisée (affiché au survol). */
  reason?: string
}

interface ListMenuProps<V extends string> {
  id: string
  label: string
  anchor: HTMLElement
  options: SelectOption<V>[]
  value: V | null
  /** Option active à l'ouverture (saisie d'une lettre sur le champ fermé), sinon la valeur choisie. */
  initialActive?: number
  placement: 'over' | 'below'
  onPick(value: V): void
  onClose(refocus: boolean): void
}

const TYPEAHEAD_MS = 600

/**
 * Liste flottante façon menu Figma : sombre, rangées de 24 px, coche devant la valeur choisie,
 * option active en bleu. Clavier : ↑ ↓ Début Fin, Entrée ou Espace pour choisir, Échap pour fermer,
 * lettres pour sauter. Toujours entière dans la fenêtre ; se ferme au clic ailleurs ou au défilement.
 */
function ListMenu<V extends string>({ id, label, anchor, options, value, initialActive, placement, onPick, onClose }: ListMenuProps<V>) {
  const list = useRef<HTMLDivElement>(null)
  const chosen = options.findIndex((o) => o.value === value)
  const [active, setActive] = useState(() => initialActive ?? (chosen >= 0 ? chosen : edgeIndex(options, 'first')))
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const typed = useRef({ text: '', at: 0 })
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const a = anchor.getBoundingClientRect()
    const row = chosen >= 0 && placement === 'over' ? el.querySelector<HTMLElement>(`[data-index="${chosen}"]`) : null
    const center = row ? row.offsetTop + row.offsetHeight / 2 : null
    const next = placeList(
      { left: a.left, top: a.top, width: a.width, height: a.height },
      { width: el.offsetWidth, height: el.scrollHeight },
      center,
      { width: window.innerWidth, height: window.innerHeight },
    )
    setPos(next)
  }, [anchor, chosen, placement])

  // Liste trop haute pour la fenêtre : l'option choisie reste visible.
  useLayoutEffect(() => {
    if (!pos) return
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, pos])

  // Focus une fois la liste placée (cachée, elle ne pourrait pas le recevoir).
  const placed = pos !== null
  useEffect(() => {
    if (placed) list.current?.focus({ preventScroll: true })
  }, [placed])

  useEffect(() => {
    const away = (e: Event) => {
      const t = e.target as Node | null
      if (t && (list.current?.contains(t) || anchor.contains(t))) return
      closeRef.current(false)
    }
    const scrolled = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return
      closeRef.current(false)
    }
    const resized = () => closeRef.current(false)
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('scroll', scrolled, true)
    window.addEventListener('resize', resized)
    window.addEventListener('blur', resized)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('scroll', scrolled, true)
      window.removeEventListener('resize', resized)
      window.removeEventListener('blur', resized)
    }
  }, [anchor])

  const pick = (i: number) => {
    const o = options[i]
    if (!o || o.disabled) return
    onPick(o.value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Rien ne part vers le canevas (raccourcis d'outils, Échap qui désélectionne…).
    e.stopPropagation()
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => stepIndex(options, i, e.key === 'ArrowDown' ? 1 : -1))
        return
      case 'Home':
      case 'End':
        e.preventDefault()
        setActive(edgeIndex(options, e.key === 'Home' ? 'first' : 'last'))
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (e.key === ' ' && typed.current.text && Date.now() - typed.current.at < TYPEAHEAD_MS) break
        pick(active)
        return
      case 'Escape':
        e.preventDefault()
        onClose(true)
        return
      case 'Tab':
        onClose(false)
        return
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      const now = Date.now()
      const text = now - typed.current.at < TYPEAHEAD_MS ? typed.current.text + e.key : e.key
      typed.current = { text, at: now }
      const i = matchIndex(options, text, active)
      if (i >= 0) setActive(i)
    }
  }

  return createPortal(
    <div
      ref={list}
      id={id}
      className="select-menu"
      role="listbox"
      aria-label={label}
      aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
      tabIndex={-1}
      data-ui
      style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight, minWidth: anchor.offsetWidth } : { visibility: 'hidden', minWidth: anchor.offsetWidth }}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <div
          key={o.value}
          id={`${id}-${i}`}
          data-index={i}
          role="option"
          aria-selected={o.value === value}
          aria-disabled={o.disabled || undefined}
          className={`select-option${i === active ? ' is-active' : ''}`}
          data-tooltip={o.disabled ? o.reason : undefined}
          onPointerMove={() => !o.disabled && i !== active && setActive(i)}
          onClick={() => pick(i)}
        >
          <span className="select-check" aria-hidden>
            {o.value === value && (
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span className="select-label">{o.label}</span>
          {o.hint && <span className="select-hint">{o.hint}</span>}
        </div>
      ))}
    </div>,
    document.body,
  )
}

export const Chevron = () => (
  <svg className="select-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
    <path d="M5.5 7 8 9.5 10.5 7" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

interface SelectProps<V extends string> {
  /** Nom accessible du champ (ex. « Graisse »). */
  label: string
  /** `null` : aucune valeur commune (sélection mixte) ; le champ montre `placeholder`. */
  value: V | null
  options: SelectOption<V>[]
  onChange(value: V): void
  placeholder?: string
  disabled?: boolean
  /** `over` (défaut) : l'option choisie s'ouvre posée sur le champ, comme Figma ; `below` : sous le champ. */
  placement?: 'over' | 'below'
  /** Classe du bouton ; par défaut il a l'allure d'un champ de 24 px. */
  className?: string
  /** Contenu du bouton à la place de « valeur + chevron ». */
  children?: ReactNode
  /** Élément sur lequel la liste se cale (par défaut le bouton ; ex. le champ entier qui le contient). */
  anchor?: (button: HTMLElement) => HTMLElement
}

/** Liste déroulante maison : un bouton qui ressemble au champ, une liste flottante sombre. */
export function Select<V extends string>({ label, value, options, onChange, placeholder = 'Mixte', disabled, placement = 'over', className, children, anchor }: SelectProps<V>) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<{ active?: number } | null>(null)
  const current = options.find((o) => o.value === value)

  const close = (refocus: boolean) => {
    setOpen(null)
    if (refocus) button.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      setOpen({})
    } else if (e.key.length === 1 && /\p{L}|\p{N}/u.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Une lettre sur le champ fermé : ouvre la liste sur la première option qui commence par elle.
      e.preventDefault()
      e.stopPropagation()
      const i = matchIndex(options, e.key, options.findIndex((o) => o.value === value))
      setOpen(i >= 0 ? { active: i } : {})
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        className={className ?? 'select-trigger'}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open !== null}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        data-open={open !== null || undefined}
        onClick={() => setOpen((o) => (o ? null : {}))}
        onKeyDown={onKeyDown}
      >
        {children ?? (
          <>
            <span className={`select-value${current ? '' : ' is-placeholder'}`}>{current?.label ?? placeholder}</span>
            <Chevron />
          </>
        )}
      </button>
      {open && button.current && (
        <ListMenu
          id={id}
          label={label}
          anchor={anchor ? anchor(button.current) : button.current}
          options={options}
          value={value}
          initialActive={open.active}
          placement={placement}
          onPick={(v) => {
            close(true)
            if (v !== value) onChange(v)
          }}
          onClose={close}
        />
      )}
    </>
  )
}
