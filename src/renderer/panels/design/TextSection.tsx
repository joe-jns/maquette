import { useEffect, useMemo, useRef, useState } from 'react'
import type { TextNode, TextStyle } from '../../../core/types'
import type { FontInfo } from '../../../shared/ipc'
import { domMeasure } from '../../canvas/measure'
import { ensureFont, useFontCatalog } from '../../fonts/fontLoader'
import { useDoc } from '../../state/store'
import { mixed } from '../props'
import { ColorRow } from './ColorRow'
import { NumberField } from './NumberField'
import { applyPhase } from './PaintSections'
import { commit, Icon, scrubWith, Section, useSelection } from './shared'

/** Polices installées sur Windows, proposées en plus du catalogue Google. */
export const SYSTEM_FONTS: FontInfo[] = ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New', 'Segoe UI', 'Tahoma', 'Trebuchet MS'].map(
  (family) => ({ family, category: 'Système', weights: [400, 700], italic: true, variable: null }),
)

export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
}

const FONT_KEYS = ['fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeight', 'letterSpacing'] as const
type FontProps = Pick<TextStyle, (typeof FONT_KEYS)[number]>

/** Valeurs de police réellement appliquées : celles du style de texte nommé s'il y en a un. */
const fontOf = (t: TextNode, styles: TextStyle[]): FontProps => styles.find((s) => s.id === t.textStyle) ?? t

export function weightsOf(info: FontInfo | undefined): number[] {
  if (!info) return [100, 200, 300, 400, 500, 600, 700, 800, 900]
  if (info.variable) return Object.keys(WEIGHT_NAMES).map(Number).filter((w) => w >= info.variable!.min && w <= info.variable!.max)
  return info.weights
}

export function FontPicker({ current, catalog, onPick, onClose }: { current: string; catalog: FontInfo[]; onPick(family: string): void; onClose(): void }) {
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const hover = useRef(0)
  useEffect(() => () => window.clearTimeout(hover.current), [])
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalog.slice(0, 100)
    const starts = catalog.filter((f) => f.family.toLowerCase().startsWith(q))
    const contains = catalog.filter((f) => !f.family.toLowerCase().startsWith(q) && f.family.toLowerCase().includes(q))
    return [...starts, ...contains].slice(0, 100)
  }, [catalog, query])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      // Le bouton qui ouvre la liste la referme lui-même : ne pas la fermer puis la rouvrir.
      if ((e.target as Element | null)?.closest?.('[data-font-trigger]')) return
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [onClose])

  return (
    <div
      className="font-picker"
      ref={box}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        // Échap ferme la liste, sans aller jusqu'au canevas (qui désélectionnerait).
        e.stopPropagation()
        onClose()
      }}
    >
      <input
        autoFocus
        type="search"
        aria-label="Rechercher une police"
        placeholder={`Rechercher parmi ${catalog.length} polices`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) onPick(results[0].family)
        }}
      />
      <div className="font-results" role="listbox" aria-label="Polices">
        {results.map((f) => (
          <button
            key={f.family}
            type="button"
            role="option"
            aria-selected={f.family === current}
            onMouseEnter={() => {
              // Aperçu chargé seulement si le pointeur s'arrête (balayer la liste ne télécharge rien).
              window.clearTimeout(hover.current)
              hover.current = window.setTimeout(() => void ensureFont(f.family), 150)
            }}
            onMouseLeave={() => window.clearTimeout(hover.current)}
            onClick={() => onPick(f.family)}
          >
            <span className="font-name" style={{ fontFamily: `"${f.family}", system-ui` }}>{f.family}</span>
            <span className="font-category">{f.category}</span>
          </button>
        ))}
        {results.length === 0 && <p className="empty-note">Aucune police ne correspond.</p>}
      </div>
    </div>
  )
}

const ALIGNS: { value: TextNode['textAlign']; label: string; d: string }[] = [
  { value: 'left', label: 'gauche', d: 'M3 4h10M3 8h6M3 12h8' },
  { value: 'center', label: 'centre', d: 'M3 4h10M5 8h6M4 12h8' },
  { value: 'right', label: 'droite', d: 'M3 4h10M7 8h6M5 12h8' },
  { value: 'justify', label: 'justifié', d: 'M3 4h10M3 8h10M3 12h10' },
]

const SIZINGS: { value: TextNode['textSizing']; label: string }[] = [
  { value: 'auto', label: 'Largeur auto' },
  { value: 'auto-height', label: 'Hauteur auto' },
  { value: 'fixed', label: 'Fixe' },
]

/** Police, graisse, taille, interligne, espacement, alignement, couleur, style de texte nommé. */
export function TextSection() {
  const styles = useDoc((s) => s.doc.styles)
  const { ids, nodes } = useSelection()
  const catalog = useFontCatalog()
  const [picking, setPicking] = useState(false)
  const texts = nodes.filter((n): n is TextNode => n.type === 'text')
  const fullCatalog = useMemo(() => {
    const known = new Set((catalog ?? []).map((f) => f.family))
    return [...(catalog ?? []), ...SYSTEM_FONTS.filter((f) => !known.has(f.family))].sort((a, b) => a.family.localeCompare(b.family))
  }, [catalog])
  if (texts.length === 0 || texts.length !== nodes.length) return null

  const fonts = texts.map((t) => fontOf(t, styles.text))
  const family = mixed(fonts.map((f) => f.fontFamily))
  const weight = mixed(fonts.map((f) => f.fontWeight))
  const info = typeof family === 'string' ? fullCatalog.find((f) => f.family === family) : undefined
  const weights = weightsOf(info)
  const styleId = mixed(texts.map((t) => t.textStyle ?? ''))
  const color = mixed(texts.map((t) => t.color))

  // Un texte lié à un style nommé affiche les valeurs du style : si on modifie une propriété de police
  // (ou qu'on retire le style), on recopie d'abord ces valeurs, sinon le texte « sauterait » aux
  // anciennes valeurs propres du nœud.
  const set = (patch: Record<string, unknown>) =>
    texts.map((t) => {
      const detach = !!t.textStyle && (FONT_KEYS.some((k) => k in patch) || patch.textStyle === null)
      if (!detach) return { op: 'update' as const, id: t.id, set: patch }
      const f = fontOf(t, styles.text)
      const fontProps = Object.fromEntries(FONT_KEYS.map((k) => [k, f[k]]))
      return { op: 'update' as const, id: t.id, set: { ...fontProps, ...patch } }
    })
  const num = (key: 'fontSize' | 'lineHeight' | 'letterSpacing', name: string, label: string, opts: { min?: number; step?: number } = {}) => (
    <NumberField
      name={name}
      label={label}
      min={opts.min}
      step={opts.step}
      value={mixed(fonts.map((f) => f[key]))}
      onCommit={(v) => commit(set({ [key]: v }), name)}
      scrub={scrubWith(name, (v) => set({ [key]: opts.min !== undefined ? Math.max(opts.min, v) : v }))}
    />
  )

  const pickFamily = (next: string) => {
    setPicking(false)
    const available = weightsOf(fullCatalog.find((f) => f.family === next))
    const target = typeof weight === 'number' ? weight : 400
    const nearest = available.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), available[0] ?? 400)
    void ensureFont(next)
    commit(set({ fontFamily: next, fontWeight: nearest }), 'Police')
  }

  const sizingOps = (value: TextNode['textSizing']) =>
    texts.map((t) => {
      const r = domMeasure(t.id)
      const w = Math.max(1, Math.round(r?.width ?? 100))
      const h = Math.max(1, Math.round(r?.height ?? 20))
      const size =
        value === 'auto' ? { width: { mode: 'hug' }, height: { mode: 'hug' } }
        : value === 'auto-height' ? { width: typeof t.width === 'number' || (typeof t.width === 'object' && t.width.mode === 'fill') ? t.width : w, height: { mode: 'hug' } }
        : { width: typeof t.width === 'number' ? t.width : w, height: typeof t.height === 'number' ? t.height : h }
      return { op: 'update' as const, id: t.id, set: { ...size, textSizing: value } }
    })

  const createStyle = () => {
    const f = fonts[0]!
    commit(
      [
        {
          op: 'style.text.set', id: '$text', name: `Texte ${styles.text.length + 1}`,
          fontFamily: f.fontFamily, fontWeight: f.fontWeight, fontStyle: f.fontStyle, fontSize: f.fontSize, lineHeight: f.lineHeight, letterSpacing: f.letterSpacing,
        },
        ...set({ textStyle: '$text' }),
      ],
      'Créer un style de texte',
    )
  }

  return (
    <Section
      title="Texte"
      actions={
        styleId === '' ? (
          <button type="button" className="icon-button" aria-label="Créer un style de texte depuis la sélection" data-tooltip="Créer un style de texte" onClick={createStyle}>
            <Icon d="M8 3v10M3 8h10" />
          </button>
        ) : undefined
      }
    >
      {styles.text.length > 0 && (
        <label className="select-field">
          <span>Style</span>
          <select
            aria-label="Style de texte"
            value={styleId === 'mixed' ? '__mixed' : styleId ?? ''}
            onChange={(e) => commit(set({ textStyle: e.target.value || null }), 'Style de texte')}
          >
            {styleId === 'mixed' && <option value="__mixed" disabled>Mixte</option>}
            <option value="">Aucun style</option>
            {styles.text.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <div className="font-row">
        <button type="button" className="font-button" data-font-trigger aria-label="Police" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
          <span style={{ fontFamily: typeof family === 'string' ? `"${family}", system-ui` : undefined }}>{family === 'mixed' ? 'Mixte' : family}</span>
          <Icon d="M5 6.5 8 9.5l3-3" />
        </button>
        {picking && <FontPicker current={typeof family === 'string' ? family : ''} catalog={fullCatalog} onPick={pickFamily} onClose={() => setPicking(false)} />}
      </div>
      <div className="field-grid">
        <label className="select-field">
          <span className="visually-hidden">Graisse</span>
          <select aria-label="Graisse" value={weight === 'mixed' ? '' : String(weight)} onChange={(e) => commit(set({ fontWeight: Number(e.target.value) }), 'Graisse')}>
            {weight === 'mixed' && <option value="" disabled>Mixte</option>}
            {weights.map((w) => <option key={w} value={w}>{WEIGHT_NAMES[w] ?? w} {w}</option>)}
          </select>
        </label>
        {num('fontSize', 'Taille du texte', 'T', { min: 1 })}
        {num('lineHeight', 'Interligne', '↕', { min: 1 })}
        {num('letterSpacing', 'Espacement des lettres', '↔', { step: 0.1 })}
      </div>
      <div className="text-options">
        <div className="segmented" role="group" aria-label="Alignement du texte">
          {ALIGNS.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-label={`Aligner le texte : ${a.label}`}
              data-tooltip={`Aligner : ${a.label}`}
              aria-pressed={mixed(texts.map((t) => t.textAlign)) === a.value}
              onClick={() => commit(set({ textAlign: a.value }), 'Alignement du texte')}
            >
              <Icon d={a.d} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`icon-button${mixed(fonts.map((f) => f.fontStyle)) === 'italic' ? ' is-pressed' : ''}`}
          aria-label="Italique"
          aria-pressed={mixed(fonts.map((f) => f.fontStyle)) === 'italic'}
          data-tooltip="Italique"
          onClick={() => commit(set({ fontStyle: mixed(fonts.map((f) => f.fontStyle)) === 'italic' ? 'normal' : 'italic' }), 'Italique')}
        >
          <Icon d="M7 3h5M4 13h5M10 3 6 13" />
        </button>
      </div>
      <div className="segmented" role="group" aria-label="Taille du bloc de texte">
        {SIZINGS.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-label={`Bloc de texte : ${s.label.toLowerCase()}`}
            aria-pressed={mixed(texts.map((t) => t.textSizing)) === s.value}
            onClick={() => commit(sizingOps(s.value), 'Taille du bloc de texte')}
          >
            {s.label}
          </button>
        ))}
      </div>
      {color !== 'mixed' && color !== null && (
        <ColorRow name="Couleur du texte" color={color} styles={styles} apply={(c, phase) => applyPhase(set({ color: c }), phase, 'Couleur du texte')} />
      )}
    </Section>
  )
}
