import { createStore, useStore } from 'zustand'
import type { Camera } from '../canvas/camera'
import type { DistanceLine } from '../canvas/geometry'
import type { Gap, Guide } from '../canvas/snapping'
import type { Rect } from '../../core/types'

export type Tool = 'move' | 'frame' | 'rect' | 'ellipse' | 'text'

/** Ce que la surcouche dessine en plus de la sélection (en coordonnées du monde). */
export interface OverlayExtras {
  guides: Guide[]
  gaps: Gap[]
  marquee: Rect | null
  insertion: { x1: number; y1: number; x2: number; y2: number } | null
  distances: DistanceLine[]
  /** Silhouette de l'élément tiré quand il va être déposé ailleurs. */
  ghost: Rect | null
}

export interface UiState {
  camera: Camera
  /** Taille de la zone du canevas à l'écran. */
  viewport: { width: number; height: number }
  tool: Tool
  selection: string[]
  hoverId: string | null
  editingTextId: string | null
  helpOpen: boolean
  /** Incrémenté pour demander un cadrage « tout voir » au prochain rendu. */
  fitRequest: number
  extras: OverlayExtras
  setCamera(camera: Camera): void
  setViewport(width: number, height: number): void
  setTool(tool: Tool): void
  select(ids: string[]): void
  setHover(id: string | null): void
  setEditing(id: string | null): void
  setHelp(open: boolean): void
  requestFit(): void
  setExtras(extras: Partial<OverlayExtras>): void
  clearExtras(): void
}

const NO_EXTRAS: OverlayExtras = { guides: [], gaps: [], marquee: null, insertion: null, distances: [], ghost: null }

export const uiStore = createStore<UiState>()((set) => ({
  camera: { x: 0, y: 0, zoom: 1 },
  viewport: { width: 0, height: 0 },
  tool: 'move',
  selection: [],
  hoverId: null,
  editingTextId: null,
  helpOpen: false,
  fitRequest: 0,
  extras: NO_EXTRAS,
  setCamera: (camera) => set({ camera }),
  setViewport: (width, height) => set({ viewport: { width, height } }),
  setTool: (tool) => set({ tool }),
  select: (selection) => set({ selection }),
  setHover: (hoverId) => set({ hoverId }),
  setEditing: (editingTextId) => set({ editingTextId }),
  setHelp: (helpOpen) => set({ helpOpen }),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
  setExtras: (extras) => set((s) => ({ extras: { ...s.extras, ...extras } })),
  clearExtras: () => set({ extras: NO_EXTRAS }),
}))

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(uiStore, selector)
}
