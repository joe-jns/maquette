import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { findNode } from '../../core/tree'
import { docStore, useDoc } from '../state/store'
import { uiStore, useUi } from '../state/ui'
import { wheelPan, wheelZoomFactor, zoomAt } from './camera'
import { fitTo, stopCameraAnimation } from './camera-actions'
import { InteractionController, type ScreenPoint } from './interaction'
import { selectionMenu } from './contextMenu'
import { Menu } from '../ui/Menu'
import { NodeView } from './NodeView'
import { Overlay } from './Overlay'
import { HelpOverlay } from './HelpOverlay'
import { TastePins } from './TastePins'
import { Toolbar } from './Toolbar'
import { ZoomControl } from './ZoomControl'

export function Canvas() {
  const page = useDoc((s) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]!)
  const camera = useUi((s) => s.camera)
  const fitRequest = useUi((s) => s.fitRequest)
  const tool = useUi((s) => s.tool)
  const ref = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<ScreenPoint | null>(null)

  // Taille de la vue.
  useEffect(() => {
    const el = ref.current!
    const observer = new ResizeObserver(() => uiStore.getState().setViewport(el.clientWidth, el.clientHeight))
    observer.observe(el)
    uiStore.getState().setViewport(el.clientWidth, el.clientHeight)
    return () => observer.disconnect()
  }, [])

  // Molette : écouteur non passif, sinon le pincement zoome toute la fenêtre Electron.
  useEffect(() => {
    const el = ref.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopCameraAnimation()
      const ui = uiStore.getState()
      const box = el.getBoundingClientRect()
      const point = { x: e.clientX - box.left, y: e.clientY - box.top }
      if (e.ctrlKey || e.metaKey) {
        ui.setCamera(zoomAt(ui.camera, wheelZoomFactor(e.deltaY), point))
      } else {
        const horizontal = e.shiftKey && e.deltaX === 0
        const { dx, dy } = wheelPan(horizontal ? e.deltaY : e.deltaX, horizontal ? 0 : e.deltaY)
        ui.setCamera({ ...ui.camera, x: ui.camera.x + dx, y: ui.camera.y + dy })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // La sélection ne garde jamais un élément disparu (annulation, suppression, ouverture d'un document).
  useEffect(
    () =>
      docStore.subscribe((state) => {
        const ui = uiStore.getState()
        const alive = ui.selection.filter((id) => findNode(state.doc, id) !== null)
        if (alive.length !== ui.selection.length) ui.select(alive)
        if (ui.hoverId && !findNode(state.doc, ui.hoverId)) ui.setHover(null)
      }),
    [],
  )

  // Gestes souris et clavier.
  useEffect(() => {
    const controller = new InteractionController(ref.current!, setMenu)
    return () => controller.dispose()
  }, [])

  // Cadrage demandé (chargement d'un document) : juste après le rendu, sans attendre une image —
  // requestAnimationFrame est suspendu tant que la fenêtre est cachée.
  useLayoutEffect(() => {
    if (fitRequest === 0) return
    const el = ref.current!
    uiStore.getState().setViewport(el.clientWidth, el.clientHeight)
    fitTo('all')
  }, [fitRequest])

  return (
    <div ref={ref} className="canvas" data-tool={tool} data-testid="canvas">
      <div
        className="world"
        data-testid="world"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
      >
        {page.children.map((node, i) => (
          <NodeView key={node.id} node={node} parent={null} index={i} />
        ))}
      </div>
      {page.children.length === 0 && (
        <div className="canvas-hint" data-testid="canvas-hint">
          <strong>Page vide</strong>
          Dessinez un cadre avec <kbd>F</kbd>, un rectangle avec <kbd>R</kbd>, un texte avec <kbd>T</kbd> — ou demandez à Claude Code de la dessiner.
        </div>
      )}
      <Overlay />
      <TastePins />
      <Toolbar />
      <HelpOverlay />
      <ZoomControl />
      {menu && (
        <Menu
          label="Canevas"
          x={menu.clientX}
          y={menu.clientY}
          items={selectionMenu({ at: menu })}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
