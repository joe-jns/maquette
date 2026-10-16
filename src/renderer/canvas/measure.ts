import type { Measure } from '../../core/ops'

/** Le zoom de la caméra arrive au plan 2 ; jusque-là le monde est affiché à l'échelle 1. */
const ZOOM = 1

export const domMeasure: Measure = (id) => {
  const el = document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)
  if (!el) return undefined
  const origin = el.parentElement?.closest('[data-node-id]') ?? document.querySelector('[data-testid="world"]')
  if (!origin) return undefined
  const r = el.getBoundingClientRect()
  const o = origin.getBoundingClientRect()
  return { x: (r.left - o.left) / ZOOM, y: (r.top - o.top) / ZOOM, width: r.width / ZOOM, height: r.height / ZOOM }
}
