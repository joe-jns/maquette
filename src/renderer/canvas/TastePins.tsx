import { useLayoutEffect, useState } from 'react'
import { locateFinding } from '../../taste/locate'
import { useDoc } from '../state/store'
import { uiStore, useUi } from '../state/ui'
import { isFresh, useTaste } from '../taste/tasteStore'
import { worldToScreen } from './camera'
import { worldRectOf } from './rects'

const SIZE = 20

/** Épingles numérotées des fautes taste-skill, à côté des éléments concernés (tant que le cadre n'a pas changé). */
export function TastePins() {
  const doc = useDoc((s) => s.doc)
  const camera = useUi((s) => s.camera)
  const viewport = useUi((s) => s.viewport)
  const check = useTaste((s) => s.check)
  const [pins, setPins] = useState<{ n: number; id: string; x: number; y: number; fail: boolean }[]>([])

  useLayoutEffect(() => {
    if (!check || !isFresh(check)) return setPins([])
    // Plusieurs fautes sur le même élément : les épingles se rangent côte à côte.
    const perElement = new Map<string, number>()
    const next = check.result.findings.flatMap((f, i) => {
      const id = locateFinding(doc, check.frameId, f.message)
      const r = worldRectOf(id)
      if (!r) return []
      const k = perElement.get(id) ?? 0
      perElement.set(id, k + 1)
      const p = worldToScreen(camera, { x: r.x + r.width, y: r.y })
      return [{ n: i + 1, id, x: p.x - SIZE / 2 + k * (SIZE + 2), y: p.y - SIZE / 2, fail: f.level === 'FAIL' }]
    })
    setPins(next)
  }, [doc, camera, viewport, check])

  if (!pins.length) return null
  return (
    <div className="taste-pins" data-ui data-testid="taste-pins">
      {pins.map((p) => (
        <button
          key={p.n}
          type="button"
          className={`taste-pin pin-number ${p.fail ? 'is-fail' : 'is-warn'}`}
          style={{ left: p.x, top: p.y, width: SIZE, height: SIZE }}
          aria-label={`Issue ${p.n}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => uiStore.getState().select([p.id])}
        >
          {p.n}
        </button>
      ))}
    </div>
  )
}
