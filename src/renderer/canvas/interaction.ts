import { findNode } from '../../core/tree'
import type { FrameNode, MaquetteDocument } from '../../core/types'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { screenToWorld } from './camera'
import { fitTo, selectionExists, zoomAroundCenter, zoomStep } from './camera-actions'
import { createClickTracker } from './clicks'
import { distanceLines, normalizeRect, union, type Point } from './geometry'
import { deepestHitAt, worldRectOf } from './rects'
import { ascend, contextOf, descend, marqueeSelect, nextSibling, pickClickTarget } from './selection'
import { matchShortcut, type CommandId } from './shortcuts'

/** Distance (px écran) avant qu'un appui devienne un glisser. */
const DRAG_THRESHOLD = 4

/**
 * Machine à états des gestes sur le canevas. Un seul geste à la fois ; chaque état gère le pointeur
 * et sa part de surcouche. La main (Espace maintenu, clic molette) passe avant tout le reste.
 */
type State =
  | { kind: 'idle' }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'press'; pointerId: number; startX: number; startY: number; target: string; collapseTo: string | null }
  | { kind: 'marquee'; pointerId: number; startX: number; startY: number; start: Point; base: string[]; active: boolean }

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

export class InteractionController {
  private state: State = { kind: 'idle' }
  private spaceDown = false
  private readonly clicks = createClickTracker()
  private readonly listeners: [EventTarget, string, EventListener][] = []

  constructor(private readonly el: HTMLElement) {
    this.on(el, 'pointerdown', (e) => this.pointerDown(e as PointerEvent))
    this.on(el, 'pointermove', (e) => this.pointerMove(e as PointerEvent))
    this.on(el, 'pointerup', (e) => this.pointerUp(e as PointerEvent))
    this.on(el, 'pointerleave', () => ui().setHover(null))
    this.on(el, 'lostpointercapture', () => this.endGesture())
    this.on(el, 'auxclick', (e) => e.preventDefault())
    this.on(window, 'keydown', (e) => this.keyDown(e as KeyboardEvent))
    this.on(window, 'keyup', (e) => this.keyUp(e as KeyboardEvent))
    this.on(window, 'blur', () => {
      this.spaceDown = false
      this.endGesture()
    })
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn)
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
    const s = this.state
    switch (s.kind) {
      case 'pan': {
        if (e.pointerId !== s.pointerId) return
        const u = ui()
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
        return
      case 'idle':
        this.hover(e)
    }
  }

  private pointerUp(e: PointerEvent): void {
    const s = this.state
    if (s.kind === 'idle' || e.pointerId !== s.pointerId) return
    if (s.kind === 'press' && s.collapseTo) ui().select([s.collapseTo])
    this.endGesture()
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

  /** Fin d'un geste, y compris quand la fenêtre perd le focus ou la capture du pointeur. */
  private endGesture(): void {
    if (this.state.kind === 'pan') delete this.el.dataset.panning
    if (this.state.kind === 'marquee') ui().setExtras({ marquee: null })
    this.state = { kind: 'idle' }
  }

  // ——— Clavier ———

  private keyDown(e: KeyboardEvent): void {
    if (typingInField(e.target)) return
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
        if (first) {
          const parent = ascend(d, first)
          ui().select(parent ? [parent] : [])
        }
        return true
      case 'enter': {
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
      default:
        return false
    }
  }
}
