import { useEffect, useLayoutEffect, useRef } from 'react'
import { useDoc } from '../state/store'
import { uiStore, useUi } from '../state/ui'
import { wheelPan, wheelZoomFactor, zoomAt } from './camera'
import { fitTo } from './camera-actions'
import { InteractionController } from './interaction'
import { NodeView } from './NodeView'
import { Overlay } from './Overlay'
import { Toolbar } from './Toolbar'

export function Canvas() {
  const page = useDoc((s) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]!)
  const camera = useUi((s) => s.camera)
  const fitRequest = useUi((s) => s.fitRequest)
  const tool = useUi((s) => s.tool)
  const ref = useRef<HTMLDivElement>(null)

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

  // Gestes souris et clavier.
  useEffect(() => {
    const controller = new InteractionController(ref.current!)
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
      <Overlay />
      <Toolbar />
      <div className="zoom-badge" data-testid="zoom">{formatZoom(camera.zoom)}</div>
    </div>
  )
}

const formatZoom = (zoom: number) => `${Math.round(zoom * 100)} %`
