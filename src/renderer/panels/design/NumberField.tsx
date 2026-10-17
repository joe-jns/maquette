import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { evalNumber, formatNumber } from '../props'

export interface Scrub {
  start(): void
  change(value: number): void
  end(): void
}

interface Props {
  /** Nom accessible du champ (ex. « Largeur »). */
  name: string
  /** Étiquette visible courte (ex. « L ») ou icône ; on la glisse pour changer la valeur. */
  label: React.ReactNode
  value: number | 'mixed' | null
  onCommit(value: number): void
  scrub?: Scrub
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  title?: string
  suffix?: string
}

const clamp = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))

/**
 * Champ numérique à la Figma : calculs (`24*2`), flèches ±1 (Maj ±10), Entrée/Tab/clic ailleurs
 * valident, Échap annule, « Mixte » pour des valeurs différentes ; l'étiquette se glisse (un geste
 * = une annulation). Une saisie invalide revient à la valeur précédente.
 */
export function NumberField({ name, label, value, onCommit, scrub, step = 1, min, max, disabled, title, suffix }: Props) {
  const shown = typeof value === 'number' ? formatNumber(value) : ''
  const [draft, setDraft] = useState(shown)
  // Vrai seulement quand l'utilisateur a tapé : sinon le champ suit la valeur affichée, même avec le
  // focus (une sélection qui change ne doit jamais recevoir une saisie destinée à l'ancienne).
  const dirty = useRef(false)
  // La cible d'une saisie est fixée à la première frappe : si la sélection change avant la
  // validation (clic sur un autre élément), la valeur va à ce qui était sélectionné quand on a tapé.
  const target = useRef<{ onCommit: (v: number) => void; value: Props['value'] } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!dirty.current) setDraft(shown)
  }, [shown])

  const commitText = (text: string) => {
    const to = target.current ?? { onCommit, value }
    target.current = null
    dirty.current = false
    const v = evalNumber(text)
    if (v === null) {
      setDraft(shown)
      return
    }
    const next = clamp(v, min, max)
    setDraft(formatNumber(next))
    if (next !== to.value) to.onCommit(next)
  }

  const onScrubDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled || !scrub || typeof value !== 'number' || e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const start = value
    let began = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      if (!began) {
        if (Math.abs(dx) < 2) return
        began = true
        scrub.start()
      }
      const next = clamp(start + Math.round(dx) * step * (ev.shiftKey ? 10 : 1), min, max)
      setDraft(formatNumber(next))
      scrub.change(next)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('lostpointercapture', up)
      if (began) scrub.end()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('lostpointercapture', up)
  }

  return (
    <label className={`number-field${disabled ? ' is-disabled' : ''}`} title={title}>
      <span
        className={`number-label${scrub && !disabled && typeof value === 'number' ? ' can-scrub' : ''}`}
        data-testid={`scrub-${name}`}
        onPointerDown={onScrubDown}
      >
        {label}
      </span>
      <input
        ref={input}
        type="text"
        inputMode="decimal"
        aria-label={name}
        value={draft}
        placeholder={value === 'mixed' ? 'Mixte' : undefined}
        disabled={disabled}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          if (!dirty.current) target.current = { onCommit, value }
          dirty.current = true
          setDraft(e.target.value)
        }}
        onBlur={() => {
          if (dirty.current) commitText(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitText(draft)
            e.currentTarget.select()
          } else if (e.key === 'Escape') {
            dirty.current = false
            target.current = null
            setDraft(shown)
            e.currentTarget.blur()
          } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && typeof value === 'number') {
            e.preventDefault()
            const next = clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), min, max)
            setDraft(formatNumber(next))
            onCommit(next)
          }
        }}
      />
      {suffix && <span className="number-suffix">{suffix}</span>}
    </label>
  )
}
