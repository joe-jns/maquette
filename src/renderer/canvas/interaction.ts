import type { Op } from '../../core/ops'
import { containsId, findNode } from '../../core/tree'
import type { FrameNode, MaquetteDocument, Rect } from '../../core/types'
import { chatStore } from '../chat/chatStore'
import { runCommand } from '../state/commands'
import { docStore } from '../state/store'
import { tasteStore } from '../taste/tasteStore'
import { uiStore, type Tool } from '../state/ui'
import { assetUrl } from './assetUrl'
import { screenToWorld } from './camera'
import { fitTo, selectionExists, stopCameraAnimation, zoomAroundCenter, zoomStep } from './camera-actions'
import {
  addAutoLayoutOps, deleteOps, duplicateOps, inFlow, nudgeOps, topLevel, wrapInFrameOps, zOrderOps, type CommandOps,
} from './canvasOps'
import { copyNodes, parseClipboard, pasteOps } from './clipboard'
import { domMeasure } from './measure'
import { createClickTracker } from './clicks'
import { distanceLines, normalizeRect, union, type Point } from './geometry'
import { deepestHitAt, worldRectOf } from './rects'
import { ascend, contextOf, descend, marqueeSelect, nextSibling, pickClickTarget } from './selection'
import { flowIndexToChildIndex, insertionIndex, insertionMarker } from './reorder'
import { matchShortcut, type CommandId } from './shortcuts'
import type { HandleName } from './Overlay'
import { snapMove, snapValue, type Guide } from './snapping'

const TOOLS = { 'tool.move': 'move', 'tool.frame': 'frame', 'tool.rect': 'rect', 'tool.ellipse': 'ellipse', 'tool.text': 'text' } as const

/** Taille naturelle d'une image servie par masset:// (1 × 1 si elle ne se charge pas). */
function naturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 })
    img.onerror = () => resolve({ width: 1, height: 1 })
    img.src = url
  })
}

/** Distance (px écran) avant qu'un appui devienne un glisser. */
const DRAG_THRESHOLD = 4
/** Portée du magnétisme, en px écran. */
const SNAP = 5

/**
 * Machine à états des gestes sur le canevas. Un seul geste à la fois ; chaque état gère le pointeur
 * et sa part de surcouche. La main (Espace maintenu, clic molette) passe avant tout le reste.
 */
type State =
  | { kind: 'idle' }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'press'; pointerId: number; startX: number; startY: number; target: string; collapseTo: string | null }
  | { kind: 'marquee'; pointerId: number; startX: number; startY: number; start: Point; base: string[]; active: boolean }
  | MoveState
  | {
      kind: 'create'; pointerId: number; tool: Exclude<Tool, 'move'>; start: Point; startX: number; startY: number
      container: Container; began: boolean; createdId: string | null
    }
  | {
      kind: 'resize'; pointerId: number; handle: HandleName; id: string; start: Point; rect: Rect
      x0: number | undefined; y0: number | undefined; xs: number[]; ys: number[]; began: boolean
    }

/** Un cadre (ou la page) qui reçoit un nouvel élément, avec son rectangle dans le monde. */
interface Container { id: string; frame: FrameNode | null; rect: Rect }

interface MoveState {
  kind: 'move'
  pointerId: number
  start: Point
  items: { id: string; x: number; y: number }[]
  bounds: Rect
  targets: Rect[]
  /** Un seul élément tiré : il peut être réordonné ou changer de parent. */
  single: { id: string; parent: string; pageId: string; flow: boolean; grab: Point } | null
  /** Enfants des cadres automatiques survolés, mesurés à l'entrée (sans l'élément tiré). */
  cache: Map<string, Rect[]>
  /** Dépôt prévu dans un autre cadre automatique, appliqué au relâchement. */
  drop: { parent: string; index: number; marker: { x1: number; y1: number; x2: number; y2: number } } | null
  lastKey: string
}

/** Vrai quand la frappe doit aller à un champ de saisie (texte en édition, panneau…), pas au canevas. */
export function typingInField(target: EventTarget | null): boolean {
  if (uiStore.getState().editingTextId) return true
  const el = target as HTMLElement | null
  if (!el || !el.closest) return false
  return el.isContentEditable || !!el.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')
}

const doc = () => docStore.getState().doc
const ui = () => uiStore.getState()

function currentPageChildren(d: MaquetteDocument) {
  const { pageId } = docStore.getState()
  return (d.pages.find((p) => p.id === pageId) ?? d.pages[0]!).children
}

/** Un élément caché ou verrouillé (lui ou un ancêtre) ne se sélectionne pas sur le canevas. */
function selectable(d: MaquetteDocument, id: string): boolean {
  let loc = findNode(d, id)
  while (loc) {
    if (loc.node.locked || !loc.node.visible) return false
    loc = loc.parent ? findNode(d, loc.parent.id) : null
  }
  return true
}

/** Le contexte de sélection : le parent de la sélection courante (null = la page). */
function currentContext(): string | null {
  const [first] = ui().selection
  return first ? contextOf(doc(), first) : null
}

function isAncestor(d: MaquetteDocument, ancestor: string, id: string): boolean {
  let loc = findNode(d, id)
  while (loc?.parent) {
    if (loc.parent.id === ancestor) return true
    loc = findNode(d, loc.parent.id)
  }
  return false
}

/** Point de l'écran (clientX/clientY). */
export interface ScreenPoint { clientX: number; clientY: number }

/** Contrôleur actif (un seul canevas), pour les menus qui lancent les mêmes commandes que le clavier. */
let active: InteractionController | null = null

/**
 * Lance une commande du canevas comme son raccourci (menus contextuels). `at` : point du clic droit,
 * où « Coller ici » dépose. Renvoie false sans canevas ou pour une commande non gérée.
 */
export function runCanvasCommand(command: CommandId, at?: ScreenPoint): boolean {
  return active?.command(command, at) ?? false
}

export class InteractionController {
  private state: State = { kind: 'idle' }
  private spaceDown = false
  private readonly clicks = createClickTracker()
  /** Dernière position du pointeur sur le canevas (null s'il est sorti), pour coller à cet endroit. */
  private pointer: { clientX: number; clientY: number } | null = null
  /** Presse-papiers interne, si celui du système est indisponible. */
  private clipboard = ''
  private readonly listeners: [EventTarget, string, EventListener][] = []

  constructor(
    private readonly el: HTMLElement,
    /** Clic droit sur le canevas, après la mise à jour de la sélection : ouvrir le menu à ce point. */
    private readonly onContextMenu: (at: ScreenPoint) => void = () => {},
  ) {
    active = this
    this.on(el, 'pointerdown', (e) => this.pointerDown(e as PointerEvent))
    this.on(el, 'contextmenu', (e) => this.contextMenu(e as MouseEvent))
    this.on(el, 'pointermove', (e) => this.pointerMove(e as PointerEvent))
    this.on(el, 'pointerup', (e) => this.pointerUp(e as PointerEvent))
    this.on(el, 'pointerleave', () => {
      ui().setHover(null)
      this.pointer = null
    })
    this.on(el, 'lostpointercapture', () => this.endGesture())
    this.on(el, 'auxclick', (e) => e.preventDefault())
    this.on(el, 'dragover', (e) => this.dragOver(e as DragEvent))
    this.on(el, 'drop', (e) => void this.drop(e as DragEvent))
    this.on(window, 'keydown', (e) => this.keyDown(e as KeyboardEvent))
    this.on(window, 'keyup', (e) => this.keyUp(e as KeyboardEvent))
    this.on(window, 'blur', () => {
      this.spaceDown = false
      this.endGesture()
    })
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn)
    if (active === this) active = null
  }

  /** Commande lancée depuis un menu (même effet que son raccourci). */
  command(command: CommandId, at?: ScreenPoint): boolean {
    if (command === 'paste') {
      void this.paste(at)
      return true
    }
    return this.run(command)
  }

  /**
   * Clic droit, comme Figma : sur un élément hors de la sélection, il devient la sélection ; dans le
   * vide, la sélection est vidée ; puis le menu s'ouvre.
   */
  private contextMenu(e: MouseEvent): void {
    const target = e.target as Element | null
    if (target?.closest?.('[data-ui]') || target?.closest?.('[data-editing]')) return
    e.preventDefault()
    if (this.state.kind !== 'idle') return
    const hit = this.hitAt(e)
    if (hit) {
      const picked = pickClickTarget(doc(), hit, { deep: e.ctrlKey || e.metaKey, context: currentContext(), rectOf: worldRectOf })
      if (!ui().selection.includes(picked)) ui().select([picked])
    } else if (!(target?.closest?.('[data-handle]'))) {
      ui().select([])
    }
    this.onContextMenu({ clientX: e.clientX, clientY: e.clientY })
  }

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn)
    this.listeners.push([target, type, fn])
  }

  private toWorld(e: { clientX: number; clientY: number }): Point {
    const box = this.el.getBoundingClientRect()
    return screenToWorld(ui().camera, { x: e.clientX - box.left, y: e.clientY - box.top })
  }

  /** Élément visé sous le pointeur, en ignorant ce qui est caché ou verrouillé. */
  private hitAt(e: { clientX: number; clientY: number }): string | null {
    const id = deepestHitAt(e.clientX, e.clientY)
    return id && selectable(doc(), id) ? id : null
  }

  // ——— Pointeur ———

  private pointerDown(e: PointerEvent): void {
    if (this.state.kind !== 'idle') return
    // Les éléments d'interface posés sur le canevas (barre d'outils…) gèrent leurs propres clics.
    if ((e.target as Element | null)?.closest?.('[data-ui]')) return
    if ((e.target as Element | null)?.closest?.('[data-editing]')) return
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      e.preventDefault()
      this.el.setPointerCapture(e.pointerId)
      this.state = { kind: 'pan', pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY }
      this.el.dataset.panning = 'true'
      return
    }
    if (e.button !== 0) return
    this.el.setPointerCapture(e.pointerId)
    const count = this.clicks.track(e.timeStamp, e.clientX, e.clientY)
    const tool = ui().tool
    if (tool !== 'move') {
      const start = this.toWorld(e)
      this.state = {
        kind: 'create', pointerId: e.pointerId, tool, start, startX: e.clientX, startY: e.clientY,
        container: this.frameUnder(e.clientX, e.clientY), began: false, createdId: null,
      }
      return
    }
    const handle = (e.target as Element | null)?.closest?.('[data-handle]') as HTMLElement | SVGElement | null
    if (handle) {
      this.pressHandle(e, handle.dataset.handle as HandleName, count)
      return
    }
    const d = doc()
    const hit = this.hitAt(e)

    if (!hit) {
      const base = e.shiftKey ? ui().selection : []
      if (!e.shiftKey) ui().select([])
      this.state = { kind: 'marquee', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, start: this.toWorld(e), base, active: false }
      return
    }

    const selection = ui().selection
    let target: string
    const [only] = selection
    if (count === 2 && selection.length === 1 && only && only !== hit && isAncestor(d, only, hit)) {
      // Double-clic : on entre dans l'élément sélectionné.
      target = pickClickTarget(d, hit, { deep: false, context: only })
    } else {
      target = pickClickTarget(d, hit, { deep: e.ctrlKey || e.metaKey, context: currentContext(), rectOf: worldRectOf })
    }

    if (count === 2 && selection.length === 1 && only === target && findNode(d, target)?.node.type === 'text') {
      // Sans preventDefault, l'action par défaut du clic rendrait aussitôt le focus à la page et
      // fermerait l'éditeur qui vient de s'ouvrir.
      e.preventDefault()
      this.el.releasePointerCapture(e.pointerId)
      this.state = { kind: 'idle' }
      ui().setEditing(target)
      return
    }

    let collapseTo: string | null = null
    if (e.shiftKey) {
      ui().select(selection.includes(target) ? selection.filter((id) => id !== target) : [...selection, target])
    } else if (selection.includes(target) && selection.length > 1) {
      // Garder la sélection multiple pour un éventuel glisser ; sinon on la réduit au relâchement.
      collapseTo = target
    } else {
      ui().select([target])
    }
    this.state = { kind: 'press', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, target, collapseTo }
  }

  private pointerMove(e: PointerEvent): void {
    this.pointer = { clientX: e.clientX, clientY: e.clientY }
    const s = this.state
    switch (s.kind) {
      case 'pan': {
        if (e.pointerId !== s.pointerId) return
        const u = ui()
        stopCameraAnimation()
        u.setCamera({ ...u.camera, x: u.camera.x + e.clientX - s.lastX, y: u.camera.y + e.clientY - s.lastY })
        this.state = { ...s, lastX: e.clientX, lastY: e.clientY }
        return
      }
      case 'marquee': {
        if (e.pointerId !== s.pointerId) return
        if (!s.active && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD) return
        const rect = normalizeRect(s.start, this.toWorld(e))
        const { pageId } = docStore.getState()
        const hits = marqueeSelect(doc(), pageId, null, worldRectOf, rect)
        ui().select([...s.base, ...hits.filter((id) => !s.base.includes(id))])
        ui().setExtras({ marquee: rect })
        this.state = { ...s, active: true }
        return
      }
      case 'press':
        if (e.pointerId === s.pointerId && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) >= DRAG_THRESHOLD) {
          this.startMove(s, e)
        }
        return
      case 'move':
        if (e.pointerId === s.pointerId) this.moveTo(s, e)
        return
      case 'resize':
        if (e.pointerId === s.pointerId) this.resizeTo(s, e)
        return
      case 'create':
        if (e.pointerId !== s.pointerId) return
        if (!s.began && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD) return
        if (s.tool === 'text') return
        if (!s.began) {
          docStore.getState().beginGesture()
          s.began = true
        }
        this.drawTo(s, e)
        return
      case 'idle':
        this.hover(e)
    }
  }

  private pointerUp(e: PointerEvent): void {
    const s = this.state
    if (s.kind === 'idle' || e.pointerId !== s.pointerId) return
    if (s.kind === 'press' && s.collapseTo) ui().select([s.collapseTo])
    if (s.kind === 'create' && !s.began) {
      // Simple clic : taille par défaut, coin haut-gauche au point cliqué.
      this.state = { kind: 'idle' }
      const result = docStore.getState().dispatch([this.createOp(s, null)], 'Créer')
      if (result.ok) this.afterCreate(s.tool, result.ids['$new'] ?? null)
      return
    }
    this.endGesture()
  }

  // ——— Création ———

  /** Cadre (ou page) le plus profond sous un point de l'écran, visible et déverrouillé. */
  private frameUnder(clientX: number, clientY: number): Container {
    const d = doc()
    const seen = new Set<string>()
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const id = (el as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId
      if (!id || seen.has(id)) continue
      seen.add(id)
      const loc = findNode(d, id)
      if (!loc || loc.node.type !== 'frame' || !selectable(d, id)) continue
      const rect = worldRectOf(id)
      if (rect) return { id, frame: loc.node, rect }
    }
    return { id: docStore.getState().pageId, frame: null, rect: { x: 0, y: 0, width: 0, height: 0 } }
  }

  /** Opération qui crée l'élément de l'outil : `rect` dessiné, ou taille par défaut au point de départ. */
  private createOp(s: Extract<State, { kind: 'create' }>, rect: Rect | null): Op {
    const kind =
      s.tool === 'frame' ? { type: 'frame' as const }
      : s.tool === 'text' ? { type: 'text' as const }
      : { type: 'shape' as const, shape: s.tool === 'ellipse' ? ('ellipse' as const) : ('rectangle' as const) }
    const size = rect ? { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) } : {}
    const at = rect ?? { x: s.start.x, y: s.start.y, width: 0, height: 0 }
    const layout = s.container.frame?.layout
    if (s.container.frame && layout?.mode === 'auto') {
      const children = s.container.frame.children
      const rects = children.filter((c) => c.position === 'flow' && c.visible).map((c) => worldRectOf(c.id)).filter((r) => r !== undefined)
      const index = flowIndexToChildIndex(children, null, insertionIndex(rects, layout.direction, s.start, layout.wrap))
      return { op: 'create', parent: s.container.id, index, node: { id: '$new', ...kind, ...size } }
    }
    return {
      op: 'create', parent: s.container.id,
      node: { id: '$new', ...kind, ...size, x: Math.round(at.x - s.container.rect.x), y: Math.round(at.y - s.container.rect.y) },
    }
  }

  private drawTo(s: Extract<State, { kind: 'create' }>, e: PointerEvent): void {
    const p = this.toWorld(e)
    let end = p
    if (e.shiftKey) {
      const side = Math.max(Math.abs(p.x - s.start.x), Math.abs(p.y - s.start.y))
      end = { x: s.start.x + Math.sign(p.x - s.start.x || 1) * side, y: s.start.y + Math.sign(p.y - s.start.y || 1) * side }
    }
    const result = docStore.getState().previewGesture([this.createOp(s, normalizeRect(s.start, end))])
    if (result.ok) s.createdId = result.ids['$new'] ?? null
  }

  /** Après une création : l'élément est sélectionné, retour à l'outil Déplacer, un texte s'ouvre en édition. */
  private afterCreate(tool: Tool, id: string | null): void {
    ui().setTool('move')
    if (!id) return
    ui().select([id])
    if (tool === 'text') ui().setEditing(id)
  }

  // ——— Dépôt d'images ———

  private dragOver(e: DragEvent): void {
    if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
  }

  private async drop(e: DragEvent): Promise<void> {
    const all = [...(e.dataTransfer?.files ?? [])]
    if (!all.length) return
    // Toujours intercepter : un fichier lâché non intercepté ferait naviguer la fenêtre vers lui.
    e.preventDefault()
    const files = all.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f.name))
    if (!files.length) {
      docStore.getState().showError('Seules les images peuvent être déposées sur le canevas')
      return
    }
    const point = this.toWorld(e)
    const container = this.frameUnder(e.clientX, e.clientY)
    if (!docStore.getState().filePath) {
      await runCommand('save-as')
      if (!docStore.getState().filePath) return
    }
    // Toutes les images d'un même dépôt : une seule opération groupée, donc une seule annulation.
    const ops: Op[] = []
    const temps: string[] = []
    for (const [i, file] of files.entries()) {
      const res = await window.maquette.importImage(file.name, new Uint8Array(await file.arrayBuffer()))
      if (!res.ok) {
        docStore.getState().showError(`${file.name} : ${res.message}`)
        continue
      }
      const natural = await naturalSize(assetUrl(res.src))
      const scale = natural.width > 800 ? 800 / natural.width : 1
      const temp = `$img${i}`
      const node = {
        id: temp, type: 'image' as const, name: file.name.replace(/\.[^.]+$/, ''), src: res.src,
        width: Math.max(1, Math.round(natural.width * scale)), height: Math.max(1, Math.round(natural.height * scale)),
      }
      const auto = container.frame?.layout.mode === 'auto'
      const op: Op = auto
        ? { op: 'create', parent: container.id, node }
        : { op: 'create', parent: container.id, node: { ...node, x: Math.round(point.x - container.rect.x + i * 20), y: Math.round(point.y - container.rect.y + i * 20) } }
      ops.push(op)
      temps.push(temp)
    }
    if (!ops.length) return
    const result = docStore.getState().dispatch(ops, ops.length > 1 ? 'Importer des images' : 'Importer une image')
    if (result.ok) ui().select(temps.map((t) => result.ids[t]).filter((id) => id !== undefined))
  }

  // ——— Redimensionnement ———

  private pressHandle(e: PointerEvent, handle: HandleName, count: 1 | 2): void {
    const [id, ...rest] = ui().selection
    if (!id || rest.length) return
    if (count === 2 && (handle === 'n' || handle === 's' || handle === 'e' || handle === 'w')) {
      // Double-clic sur un bord : s'adapter au contenu ; avec Alt : remplir. Sans effet si impossible.
      const axis = handle === 'n' || handle === 's' ? 'height' : 'width'
      const loc = findNode(doc(), id)
      if (!loc) return
      const allowed = e.altKey
        ? inFlow(loc)
        : loc.node.type === 'text' || (loc.node.type === 'frame' && loc.node.layout.mode === 'auto')
      if (allowed) {
        docStore.getState().dispatch([{ op: 'update', id, set: { [axis]: { mode: e.altKey ? 'fill' : 'hug' } } }], e.altKey ? 'Remplir' : 'Adapter au contenu')
      }
      return
    }
    const loc = findNode(doc(), id)
    const rect = worldRectOf(id)
    if (!loc || !rect) return
    const xs: number[] = []
    const ys: number[] = []
    const siblings = (loc.parent ? loc.parent.children : loc.page.children).filter((n) => n.id !== id && n.visible).map((n) => n.id)
    for (const other of loc.parent ? [...siblings, loc.parent.id] : siblings) {
      const r = worldRectOf(other)
      if (!r) continue
      xs.push(r.x, r.x + r.width / 2, r.x + r.width)
      ys.push(r.y, r.y + r.height / 2, r.y + r.height)
    }
    this.state = {
      kind: 'resize', pointerId: e.pointerId, handle, id, start: this.toWorld(e), rect,
      x0: inFlow(loc) ? undefined : loc.node.x, y0: inFlow(loc) ? undefined : loc.node.y, xs, ys, began: false,
    }
  }

  private resizeTo(s: Extract<State, { kind: 'resize' }>, e: PointerEvent): void {
    if (!s.began) {
      docStore.getState().beginGesture()
      s.began = true
    }
    const p = this.toWorld(e)
    const { rect, handle } = s
    const left = handle.includes('w')
    const right = handle.includes('e')
    const top = handle.includes('n')
    const bottom = handle.includes('s')
    let l = rect.x
    let r = rect.x + rect.width
    let t = rect.y
    let b = rect.y + rect.height
    if (left) l += p.x - s.start.x
    if (right) r += p.x - s.start.x
    if (top) t += p.y - s.start.y
    if (bottom) b += p.y - s.start.y

    const guides: Guide[] = []
    if (!(e.ctrlKey || e.metaKey)) {
      const threshold = SNAP / ui().camera.zoom
      const snapX = (v: number) => snapValue(v, s.xs, threshold)
      const snapY = (v: number) => snapValue(v, s.ys, threshold)
      if (left || right) {
        const res = snapX(left ? l : r)
        if (res.snapped !== null) {
          if (left) l = res.value
          else r = res.value
          guides.push({ axis: 'x', at: res.value, from: Math.min(t, b), to: Math.max(t, b) })
        }
      }
      if (top || bottom) {
        const res = snapY(top ? t : b)
        if (res.snapped !== null) {
          if (top) t = res.value
          else b = res.value
          guides.push({ axis: 'y', at: res.value, from: Math.min(l, r), to: Math.max(l, r) })
        }
      }
    }

    // Maj sur un coin : proportions gardées, le côté qui a le plus bougé l'emporte.
    if (e.shiftKey && (left || right) && (top || bottom) && rect.width > 0 && rect.height > 0) {
      const scale = Math.max((r - l) / rect.width, (b - t) / rect.height)
      const w = rect.width * scale
      const h = rect.height * scale
      if (left) l = r - w
      else r = l + w
      if (top) t = b - h
      else b = t + h
    }

    // Jamais moins de 1 px : on bloque le bord qui bouge.
    if (r - l < 1) {
      if (left) l = r - 1
      else r = l + 1
    }
    if (b - t < 1) {
      if (top) t = b - 1
      else b = t + 1
    }

    const set: Record<string, number> = {}
    if (left || right) set.width = Math.round(r - l)
    if (top || bottom) set.height = Math.round(b - t)
    if (left && s.x0 !== undefined) set.x = Math.round(s.x0 + (l - rect.x))
    if (top && s.y0 !== undefined) set.y = Math.round(s.y0 + (t - rect.y))
    ui().setExtras({ guides })
    docStore.getState().previewGesture([{ op: 'update', id: s.id, set }])
  }

  // ——— Déplacer (libre, réordonner, changer de parent) ———

  /** Le glisser démarre. Plusieurs éléments : déplacement libre seulement. Un seul : il peut changer de place. */
  private startMove(s: Extract<State, { kind: 'press' }>, e: PointerEvent): void {
    const d = doc()
    const locs = topLevel(d, ui().selection)
    if (locs.length === 0 || (locs.length > 1 && locs.some(inFlow))) {
      this.state = { kind: 'idle' }
      return
    }
    const selected = new Set(locs.map((l) => l.node.id))
    const targets: Rect[] = []
    const seen = new Set<string>()
    for (const loc of locs) {
      const siblings = loc.parent ? loc.parent.children : loc.page.children
      for (const n of siblings) {
        if (selected.has(n.id) || seen.has(n.id) || !n.visible) continue
        seen.add(n.id)
        const r = worldRectOf(n.id)
        if (r) targets.push(r)
      }
      if (loc.parent && !seen.has(loc.parent.id)) {
        seen.add(loc.parent.id)
        const r = worldRectOf(loc.parent.id)
        if (r) targets.push(r)
      }
    }
    const bounds = union(locs.map((l) => worldRectOf(l.node.id)).filter((r) => r !== undefined))
    if (!bounds) {
      this.state = { kind: 'idle' }
      return
    }
    docStore.getState().beginGesture()
    const start = this.toWorld({ clientX: s.startX, clientY: s.startY })
    const items = locs.map((l) => ({ id: l.node.id, x: l.node.x ?? 0, y: l.node.y ?? 0 }))
    const [only] = locs
    const single =
      locs.length === 1 && only
        ? {
            id: only.node.id,
            parent: only.parent?.id ?? only.page.id,
            pageId: only.page.id,
            flow: inFlow(only),
            grab: { x: start.x - bounds.x, y: start.y - bounds.y },
          }
        : null
    const move: MoveState = {
      kind: 'move', pointerId: s.pointerId, start, items, bounds, targets, single, cache: new Map(), drop: null, lastKey: '',
    }
    this.state = move
    ui().setHover(null)
    this.moveTo(move, e)
  }

  /**
   * Cadre (ou page) sous le pointeur où l'élément tiré pourrait aller : le plus profond, hors de
   * l'élément lui-même, visible, déverrouillé et assez grand pour le contenir (son parent actuel est
   * toujours accepté).
   */
  private containerUnder(e: PointerEvent, single: NonNullable<MoveState['single']>, size: Rect) {
    const d = doc()
    const dragged = findNode(d, single.id)?.node
    const seen = new Set<string>()
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      const id = (el as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId
      if (!id || seen.has(id)) continue
      seen.add(id)
      if (dragged && containsId(dragged, id)) continue
      const loc = findNode(d, id)
      if (!loc || loc.node.type !== 'frame' || !selectable(d, id)) continue
      const rect = worldRectOf(id)
      if (!rect) continue
      if (id !== single.parent && (rect.width < size.width || rect.height < size.height)) continue
      return { id, frame: loc.node, rect }
    }
    return { id: single.pageId, frame: null, rect: { x: 0, y: 0, width: 0, height: 0 } }
  }

  /** Rectangles des enfants d'un cadre automatique, sans l'élément tiré, mesurés une fois à l'entrée. */
  private childRects(s: MoveState, frame: FrameNode, draggedId: string): Rect[] {
    let rects = s.cache.get(frame.id)
    if (!rects) {
      rects = frame.children
        .filter((c) => c.id !== draggedId && c.position === 'flow' && c.visible)
        .map((c) => worldRectOf(c.id))
        .filter((r) => r !== undefined)
      s.cache.set(frame.id, rects)
    }
    return rects
  }

  private moveTo(s: MoveState, e: PointerEvent): void {
    const p = this.toWorld(e)
    let dx = p.x - s.start.x
    let dy = p.y - s.start.y
    const single = s.single
    const container = single ? this.containerUnder(e, single, s.bounds) : null

    // 1. Même parent, libre ou page : déplacement en x/y avec magnétisme.
    if (!single || !container || (container.id === single.parent && !single.flow)) {
      this.setDrop(s, null)
      if (e.ctrlKey || e.metaKey) {
        ui().setExtras({ guides: [], gaps: [] })
      } else {
        const moved = { ...s.bounds, x: s.bounds.x + dx, y: s.bounds.y + dy }
        const snap = snapMove(moved, s.targets, SNAP / ui().camera.zoom)
        dx += snap.dx
        dy += snap.dy
        ui().setExtras({ guides: snap.guides, gaps: snap.gaps })
      }
      this.preview(
        s,
        s.items.map((it) => ({ op: 'update' as const, id: it.id, set: { x: Math.round(it.x + dx), y: Math.round(it.y + dy) } })),
      )
      return
    }
    ui().setExtras({ guides: [], gaps: [] })
    const layout = container.frame?.layout

    // 2. Cadre automatique : point d'insertion.
    if (container.frame && layout?.mode === 'auto') {
      const rects = this.childRects(s, container.frame, single.id)
      const flowIndex = insertionIndex(rects, layout.direction, p, layout.wrap)
      // Rang parmi tous les enfants (les absolus et masqués n'interviennent pas dans le calcul).
      const index = flowIndexToChildIndex(container.frame.children, single.id, flowIndex)
      if (container.id === single.parent && single.flow) {
        // Son propre cadre : réordonnancement en direct, frères animés.
        this.setDrop(s, null)
        this.preview(s, [{ op: 'move', id: single.id, parent: container.id, index }], container.id)
      } else {
        // Un autre cadre : trait d'insertion, dépôt au relâchement.
        this.preview(s, [])
        const ghost = { x: p.x - single.grab.x, y: p.y - single.grab.y, width: s.bounds.width, height: s.bounds.height }
        this.setDrop(s, { parent: container.id, index, marker: insertionMarker(rects, layout.direction, flowIndex, container.rect) }, ghost)
      }
      return
    }

    // 3. Cadre libre ou page, autre que le parent : l'élément suit le pointeur et change de parent.
    this.setDrop(s, null)
    const x = Math.round(p.x - single.grab.x - container.rect.x)
    const y = Math.round(p.y - single.grab.y - container.rect.y)
    this.preview(s, [{ op: 'move', id: single.id, parent: container.id, x, y }])
  }

  private setDrop(s: MoveState, drop: MoveState['drop'], ghost: Rect | null = null): void {
    s.drop = drop
    ui().setExtras({ insertion: drop?.marker ?? null, ghost })
  }

  /** Aperçu depuis l'état de départ ; anime les frères d'un cadre automatique quand l'ordre change. */
  private preview(s: MoveState, ops: Op[], animateIn?: string): void {
    const key = JSON.stringify(ops)
    if (key === s.lastKey) return
    s.lastKey = key
    const before = animateIn ? childScreenRects(animateIn) : null
    docStore.getState().previewGesture(ops)
    if (before && animateIn) requestAnimationFrame(() => flip(animateIn, before, s.single?.id ?? ''))
  }

  /** Survol : ce qu'un clic sélectionnerait ; avec Alt, les distances jusqu'à la sélection. */
  private hover(e: PointerEvent): void {
    const hit = this.hitAt(e)
    const target = hit ? pickClickTarget(doc(), hit, { deep: e.ctrlKey || e.metaKey, context: currentContext(), rectOf: worldRectOf }) : null
    if (target !== ui().hoverId) ui().setHover(target)
    const selection = ui().selection
    if (e.altKey && target && selection.length && !selection.includes(target)) {
      const from = union(selection.map(worldRectOf).filter((r) => r !== undefined))
      const to = worldRectOf(target)
      ui().setExtras({ distances: from && to ? distanceLines(from, to) : [] })
    } else if (ui().extras.distances.length) {
      ui().setExtras({ distances: [] })
    }
  }

  /**
   * Fin d'un geste, y compris quand la fenêtre perd le focus ou la capture du pointeur : un geste en
   * cours est validé (une entrée d'historique), ou annulé si `cancel`.
   */
  private endGesture(cancel = false): void {
    const s = this.state
    this.state = { kind: 'idle' }
    if (s.kind === 'pan') delete this.el.dataset.panning
    if (s.kind === 'marquee') ui().setExtras({ marquee: null })
    if (s.kind === 'create' && s.began) {
      if (cancel) docStore.getState().cancelGesture()
      else {
        docStore.getState().commitGesture('Créer')
        this.afterCreate(s.tool, s.createdId)
      }
    }
    if (s.kind === 'move' || (s.kind === 'resize' && s.began)) {
      if (!cancel && s.kind === 'move' && s.drop && s.single) {
        docStore.getState().previewGesture([{ op: 'move', id: s.single.id, parent: s.drop.parent, index: s.drop.index }])
      }
      if (cancel) docStore.getState().cancelGesture()
      else docStore.getState().commitGesture(s.kind === 'move' ? 'Déplacer' : 'Redimensionner')
      ui().setExtras({ guides: [], gaps: [], insertion: null, ghost: null })
    }
  }

  // ——— Clavier ———

  private keyDown(e: KeyboardEvent): void {
    // Le chat s'ouvre et se ferme de partout, même depuis sa propre saisie.
    if (matchShortcut(e) === 'toggleChat') {
      e.preventDefault()
      chatStore.getState().toggle()
      return
    }
    if (typingInField(e.target)) return
    // Focus dans un panneau latéral : Tab, Entrée, Espace et Échap gardent leur rôle clavier normal.
    if ((e.target as Element | null)?.closest?.('.panel') && ['Tab', 'Enter', ' ', 'Escape'].includes(e.key)) return
    if (ui().helpOpen) {
      const command = matchShortcut(e)
      if (command === 'escape' || command === 'help') ui().setHelp(false)
      e.preventDefault()
      return
    }
    if (e.key === 'Escape' && (this.state.kind === 'move' || this.state.kind === 'resize' || this.state.kind === 'create')) {
      e.preventDefault()
      this.endGesture(true)
      return
    }
    if (this.state.kind !== 'idle' && this.state.kind !== 'pan') {
      e.preventDefault()
      return
    }
    if (e.key === ' ') {
      e.preventDefault()
      this.spaceDown = true
      return
    }
    if (e.key === 'Alt') {
      e.preventDefault()
      return
    }
    const command = matchShortcut(e)
    if (command && this.run(command)) e.preventDefault()
  }

  private keyUp(e: KeyboardEvent): void {
    if (e.key === ' ') this.spaceDown = false
    if (e.key === 'Alt' && ui().extras.distances.length) ui().setExtras({ distances: [] })
  }

  /** Applique le lot d'une commande et sélectionne ce qu'elle désigne (identifiants temporaires résolus). */
  private apply(built: CommandOps, label: string): void {
    if (built.ops.length === 0) return
    const result = docStore.getState().dispatch(built.ops, label)
    if (!result.ok) {
      // Une commande ne doit jamais produire un lot refusé : c'est un bug à corriger.
      console.error(`Commande « ${label} » refusée`, result.errors)
      return
    }
    ui().select(built.select.map((id) => (id.startsWith('$') ? (result.ids[id] ?? id) : id)))
  }

  private async copy(ids: string[]): Promise<void> {
    const text = JSON.stringify(copyNodes(doc(), ids, domMeasure))
    this.clipboard = text
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Le presse-papiers interne suffit pour coller dans Maquette.
    }
  }

  /**
   * Coller : dans le cadre sélectionné, sinon à côté de la sélection ; au point `at` (clic droit) ou
   * au pointeur s'il est sur le canevas.
   */
  private async paste(at: ScreenPoint | null = this.pointer): Promise<void> {
    let text = this.clipboard
    try {
      text = (await navigator.clipboard.readText()) || text
    } catch {
      // Presse-papiers système indisponible : on garde la copie interne.
    }
    const payload = parseClipboard(text)
    if (!payload) return
    const d = doc()
    const [first, ...rest] = ui().selection
    const firstNode = first ? findNode(d, first)?.node : undefined
    const parent =
      firstNode?.type === 'frame' && rest.length === 0 ? firstNode.id : (first ? contextOf(d, first) : null) ?? docStore.getState().pageId
    let place: Point | undefined
    if (at) {
      const world = this.toWorld(at)
      const origin = parent === docStore.getState().pageId ? { x: 0, y: 0 } : worldRectOf(parent)
      if (origin) place = { x: Math.round(world.x - origin.x), y: Math.round(world.y - origin.y) }
    }
    this.apply(pasteOps(d, payload, { parent, at: place }), 'Coller')
  }

  /** Exécute une commande clavier ; renvoie false si elle n'est pas gérée ici. */
  private run(command: CommandId): boolean {
    const d = doc()
    const selection = ui().selection
    const [first] = selection
    switch (command) {
      case 'zoom100':
        zoomAroundCenter(1)
        return true
      case 'zoomIn':
        zoomStep(1)
        return true
      case 'zoomOut':
        zoomStep(-1)
        return true
      case 'zoomFit':
        fitTo('all', 220)
        return true
      case 'zoomSelection':
        if (selectionExists()) fitTo(selection, 220)
        return true
      case 'escape':
        if (ui().helpOpen) {
          ui().setHelp(false)
          return true
        }
        if (ui().tool !== 'move') {
          ui().setTool('move')
          return true
        }
        if (first) {
          const parent = ascend(d, first)
          ui().select(parent ? [parent] : [])
        }
        return true
      case 'enter': {
        if (first && selection.length === 1 && findNode(d, first)?.node.type === 'text' && selectable(d, first)) {
          ui().setEditing(first)
          return true
        }
        const child = first && selection.length === 1 ? descend(d, first) : null
        if (child) ui().select([child])
        return true
      }
      case 'parent': {
        const parent = first ? ascend(d, first) : null
        if (parent) ui().select([parent])
        return true
      }
      case 'nextSibling':
      case 'prevSibling':
        if (first) ui().select([nextSibling(d, first, command === 'nextSibling' ? 1 : -1)])
        return true
      case 'selectAll': {
        const context = currentContext()
        const loc = context ? findNode(d, context) : null
        const children = loc ? (loc.node as FrameNode).children : currentPageChildren(d)
        ui().select(children.filter((n) => selectable(d, n.id)).map((n) => n.id))
        return true
      }
      case 'tool.move':
      case 'tool.frame':
      case 'tool.rect':
      case 'tool.ellipse':
      case 'tool.text':
        ui().setTool(TOOLS[command])
        return true
      case 'help':
        ui().setHelp(!ui().helpOpen)
        return true
      case 'toggleChat':
        chatStore.getState().toggle()
        return true
      case 'tasteCheck': {
        const node = selection.length === 1 ? findNode(d, selection[0]!)?.node : undefined
        if (first && node?.type === 'frame') {
          tasteStore.getState().setTab('design')
          void tasteStore.getState().runCheck(node.id)
        }
        return true
      }
      case 'delete':
        if (first) this.apply(deleteOps(d, selection), 'Supprimer')
        return true
      case 'duplicate':
        if (first) this.apply(duplicateOps(d, selection), 'Dupliquer')
        return true
      case 'wrapInFrame':
        if (first) this.apply(wrapInFrameOps(d, selection, domMeasure), 'Encadrer')
        return true
      case 'addAutoLayout':
        if (first) this.apply(addAutoLayoutOps(d, selection, domMeasure), 'Mise en page automatique')
        return true
      case 'forward':
      case 'backward':
      case 'front':
      case 'back':
        if (first) this.apply(zOrderOps(d, selection, command), 'Changer l’ordre')
        return true
      case 'copy':
      case 'cut':
        if (first) {
          void this.copy(selection)
          if (command === 'cut') this.apply(deleteOps(d, selection), 'Couper')
        }
        return true
      case 'paste':
        void this.paste()
        return true
      case 'undo':
        docStore.getState().undo()
        return true
      case 'redo':
        docStore.getState().redo()
        return true
      case 'nudgeLeft':
      case 'nudgeRight':
      case 'nudgeUp':
      case 'nudgeDown':
      case 'nudgeLeft10':
      case 'nudgeRight10':
      case 'nudgeUp10':
      case 'nudgeDown10': {
        if (!first) return true
        const step = command.endsWith('10') ? 10 : 1
        const dir = command.replace('nudge', '').replace('10', '')
        const dx = dir === 'Left' ? -step : dir === 'Right' ? step : 0
        const dy = dir === 'Up' ? -step : dir === 'Down' ? step : 0
        const built = nudgeOps(d, selection, dx, dy)
        if (built.ops.length) docStore.getState().dispatch(built.ops, 'Déplacer')
        return true
      }
      default:
        return false
    }
  }
}

/** Positions écran des enfants d'un cadre, avant un changement d'ordre. */
function childScreenRects(frameId: string): Map<string, DOMRect> {
  const out = new Map<string, DOMRect>()
  const frame = document.querySelector(`[data-node-id="${CSS.escape(frameId)}"]`)
  frame?.querySelectorAll<HTMLElement>(':scope > [data-node-id]').forEach((el) => out.set(el.dataset.nodeId!, el.getBoundingClientRect()))
  return out
}

/** Animation FLIP : chaque frère part de son ancienne place et glisse vers la nouvelle (150 ms). */
function flip(frameId: string, before: Map<string, DOMRect>, skip: string): void {
  const frame = document.querySelector(`[data-node-id="${CSS.escape(frameId)}"]`)
  const zoom = uiStore.getState().camera.zoom
  frame?.querySelectorAll<HTMLElement>(':scope > [data-node-id]').forEach((el) => {
    const id = el.dataset.nodeId!
    const old = before.get(id)
    if (!old || id === skip) return
    const now = el.getBoundingClientRect()
    const dx = (old.left - now.left) / zoom
    const dy = (old.top - now.top) / zoom
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    el.style.transition = 'none'
    el.style.translate = `${dx}px ${dy}px`
    void el.offsetWidth
    el.style.transition = 'translate 150ms ease-out'
    el.style.translate = ''
    el.addEventListener('transitionend', () => { el.style.transition = '' }, { once: true })
  })
}
