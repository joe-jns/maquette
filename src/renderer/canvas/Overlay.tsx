import { useLayoutEffect, useState } from 'react'
import type { Rect } from '../../core/types'
import { useDoc } from '../state/store'
import { useUi } from '../state/ui'
import { worldToScreen, type Camera } from './camera'
import { union } from './geometry'
import { worldRectOf } from './rects'

/** Taille visible des poignées et zone cliquable (spec §7). */
const HANDLE = 8
const HANDLE_HIT = 15
const MIN_FOR_HANDLES = 10
const ACCENT = '#0D99FF'
const GUIDE = '#F24E1E'

export type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const toScreen = (c: Camera, r: Rect): Rect => {
  const p = worldToScreen(c, { x: r.x, y: r.y })
  return { x: p.x, y: p.y, width: r.width * c.zoom, height: r.height * c.zoom }
}

export function handlePoints(r: Rect): [HandleName, number, number][] {
  const { x, y, width: w, height: h } = r
  return [
    ['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y], ['e', x + w, y + h / 2],
    ['se', x + w, y + h], ['s', x + w / 2, y + h], ['sw', x, y + h], ['w', x, y + h / 2],
  ]
}

const CURSORS: Record<HandleName, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}

/** Surcouche SVG en coordonnées écran : taille constante quel que soit le zoom. */
export function Overlay() {
  const doc = useDoc((s) => s.doc)
  const camera = useUi((s) => s.camera)
  const selection = useUi((s) => s.selection)
  const hoverId = useUi((s) => s.hoverId)
  const editing = useUi((s) => s.editingTextId)
  const extras = useUi((s) => s.extras)
  const viewport = useUi((s) => s.viewport)
  const [rects, setRects] = useState<{ selected: Rect[]; hover: Rect | null }>({ selected: [], hover: null })

  // Les positions viennent du rendu : on les lit une fois le DOM à jour, avant l'affichage.
  useLayoutEffect(() => {
    const selected = selection.map(worldRectOf).filter((r) => r !== undefined)
    const hover = hoverId && !selection.includes(hoverId) ? (worldRectOf(hoverId) ?? null) : null
    setRects({ selected, hover })
  }, [doc, camera, selection, hoverId, viewport])

  const bounds = union(rects.selected)
  const box = bounds ? toScreen(camera, bounds) : null
  const showHandles = box !== null && !editing && box.width >= MIN_FOR_HANDLES && box.height >= MIN_FOR_HANDLES

  return (
    <svg className="overlay" data-testid="overlay" aria-hidden>
      {camera.zoom >= 4 && <PixelGrid camera={camera} />}

      {rects.hover && <RectPath r={toScreen(camera, rects.hover)} stroke={ACCENT} width={1.5} />}

      {rects.selected.length > 1 &&
        rects.selected.map((r, i) => <RectPath key={i} r={toScreen(camera, r)} stroke={ACCENT} width={1} />)}

      {box && <RectPath r={box} stroke={ACCENT} width={1.5} />}

      {showHandles &&
        handlePoints(box).map(([name, x, y]) => (
          <g key={name} data-handle={name} style={{ cursor: CURSORS[name], pointerEvents: 'all' }}>
            <rect x={x - HANDLE_HIT / 2} y={y - HANDLE_HIT / 2} width={HANDLE_HIT} height={HANDLE_HIT} fill="transparent" />
            <rect x={x - HANDLE / 2} y={y - HANDLE / 2} width={HANDLE} height={HANDLE} fill="#fff" stroke={ACCENT} strokeWidth={1} />
          </g>
        ))}

      {box && bounds && !editing && (
        <SizeLabel x={box.x + box.width / 2} y={box.y + box.height + 8} text={`${round(bounds.width)} × ${round(bounds.height)}`} />
      )}

      {extras.marquee && (
        <rect
          data-testid="marquee"
          {...rectAttrs(toScreen(camera, extras.marquee))}
          fill={`${ACCENT}14`}
          stroke={ACCENT}
          strokeWidth={1}
        />
      )}

      {extras.guides.map((g, i) => {
        const a = worldToScreen(camera, g.axis === 'x' ? { x: g.at, y: g.from } : { x: g.from, y: g.at })
        const b = worldToScreen(camera, g.axis === 'x' ? { x: g.at, y: g.to } : { x: g.to, y: g.at })
        return <line key={`g${i}`} data-guide x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={GUIDE} strokeWidth={1} />
      })}

      {extras.gaps.map((g, i) => {
        const a = worldToScreen(camera, g.axis === 'x' ? { x: g.from, y: g.at } : { x: g.at, y: g.from })
        const b = worldToScreen(camera, g.axis === 'x' ? { x: g.to, y: g.at } : { x: g.at, y: g.to })
        return <line key={`e${i}`} data-gap x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={GUIDE} strokeWidth={1} strokeDasharray="3 2" />
      })}

      {extras.insertion && (() => {
        const a = worldToScreen(camera, { x: extras.insertion.x1, y: extras.insertion.y1 })
        const b = worldToScreen(camera, { x: extras.insertion.x2, y: extras.insertion.y2 })
        return <line data-testid="insertion" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
      })()}

      {extras.distances.map((d, i) => {
        const a = worldToScreen(camera, { x: d.x1, y: d.y1 })
        const b = worldToScreen(camera, { x: d.x2, y: d.y2 })
        return (
          <g key={`d${i}`} data-distance>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={GUIDE} strokeWidth={1} />
            <SizeLabel x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 10} text={String(round(d.length))} color={GUIDE} />
          </g>
        )
      })}
    </svg>
  )
}

/** Valeur affichée : au dixième, et un quasi-entier (bruit de mesure à zoom non entier) devient entier. */
const round = (n: number) => {
  const whole = Math.round(n)
  return Math.abs(n - whole) < 0.05 ? whole : Math.round(n * 10) / 10
}

const rectAttrs = (r: Rect) => ({ x: r.x, y: r.y, width: Math.max(0, r.width), height: Math.max(0, r.height) })

function RectPath({ r, stroke, width }: { r: Rect; stroke: string; width: number }) {
  return <rect {...rectAttrs(r)} fill="none" stroke={stroke} strokeWidth={width} />
}

function SizeLabel({ x, y, text, color = ACCENT }: { x: number; y: number; text: string; color?: string }) {
  const w = text.length * 6.6 + 12
  return (
    <g data-testid={color === ACCENT ? 'size-label' : undefined}>
      <rect x={x - w / 2} y={y} width={w} height={18} rx={3} fill={color} />
      <text x={x} y={y + 13} textAnchor="middle" fill="#fff" fontSize={11} fontFamily="system-ui, sans-serif">
        {text}
      </text>
    </g>
  )
}

/** Grille de pixels à partir de 400 % : une ligne par pixel du monde. */
function PixelGrid({ camera }: { camera: Camera }) {
  const step = camera.zoom
  const ox = ((camera.x % step) + step) % step
  const oy = ((camera.y % step) + step) % step
  return (
    <>
      <defs>
        <pattern id="pixel-grid" x={ox} y={oy} width={step} height={step} patternUnits="userSpaceOnUse">
          <path d={`M ${step} 0 L 0 0 0 ${step}`} fill="none" stroke="#0000001a" strokeWidth={1} />
        </pattern>
      </defs>
      <rect data-testid="pixel-grid" x={0} y={0} width="100%" height="100%" fill="url(#pixel-grid)" />
    </>
  )
}
