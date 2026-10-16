import { uiStore } from '../state/ui'
import { fitTo, selectionExists, zoomAroundCenter, zoomStep } from './camera-actions'
import { matchShortcut, type CommandId } from './shortcuts'

/**
 * Machine à états des gestes sur le canevas. Un seul geste à la fois ; chaque état gère le pointeur
 * et sa part de surcouche. La main (Espace maintenu, clic molette) passe avant tout le reste.
 */
type State =
  | { kind: 'idle' }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }

/** Vrai quand la frappe doit aller à un champ de saisie (texte en édition, panneau…), pas au canevas. */
export function typingInField(target: EventTarget | null): boolean {
  if (uiStore.getState().editingTextId) return true
  const el = target as HTMLElement | null
  if (!el || !el.closest) return false
  return el.isContentEditable || !!el.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')
}

export class InteractionController {
  private state: State = { kind: 'idle' }
  private spaceDown = false
  private readonly listeners: [EventTarget, string, EventListener][] = []

  constructor(private readonly el: HTMLElement) {
    this.on(el, 'pointerdown', (e) => this.pointerDown(e as PointerEvent))
    this.on(el, 'pointermove', (e) => this.pointerMove(e as PointerEvent))
    this.on(el, 'pointerup', (e) => this.pointerUp(e as PointerEvent))
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

  // ——— Pointeur ———

  private pointerDown(e: PointerEvent): void {
    if (this.state.kind !== 'idle') return
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      e.preventDefault()
      this.el.setPointerCapture(e.pointerId)
      this.state = { kind: 'pan', pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY }
      this.el.dataset.panning = 'true'
    }
  }

  private pointerMove(e: PointerEvent): void {
    const s = this.state
    if (s.kind === 'pan' && e.pointerId === s.pointerId) {
      const ui = uiStore.getState()
      ui.setCamera({ ...ui.camera, x: ui.camera.x + e.clientX - s.lastX, y: ui.camera.y + e.clientY - s.lastY })
      this.state = { ...s, lastX: e.clientX, lastY: e.clientY }
    }
  }

  private pointerUp(e: PointerEvent): void {
    const s = this.state
    if (s.kind === 'pan' && e.pointerId === s.pointerId) this.endGesture()
  }

  /** Fin d'un geste, y compris quand la fenêtre perd le focus ou la capture du pointeur. */
  private endGesture(): void {
    if (this.state.kind === 'pan') delete this.el.dataset.panning
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
    const command = matchShortcut(e)
    if (command && this.run(command)) e.preventDefault()
  }

  private keyUp(e: KeyboardEvent): void {
    if (e.key === ' ') this.spaceDown = false
  }

  /** Exécute une commande clavier ; renvoie false si elle n'est pas gérée ici. */
  private run(command: CommandId): boolean {
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
        if (selectionExists()) fitTo(uiStore.getState().selection, 220)
        return true
      default:
        return false
    }
  }
}
