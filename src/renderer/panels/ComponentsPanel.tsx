import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FrameNode } from '../../core/types'
import { insertInstance, mainComponents } from '../canvas/componentActions'
import { NodeView, PreviewContext } from '../canvas/NodeView'
import { worldRectOf } from '../canvas/rects'
import { useDoc } from '../state/store'
import { modalStore } from '../ui/Modals'
import { Icon } from '../ui/icons'

/** Boîte de l'aperçu d'un composant, en px. */
const THUMB = { width: 168, height: 104 }

/**
 * Aperçu d'un principal : rendu réel du document (sans s'inscrire dans les mesures du canevas), posé à
 * l'origine puis réduit pour tenir dans la vignette. Une taille "fill" prend la taille affichée.
 */
function Thumbnail({ main }: { main: FrameNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const node = useMemo<FrameNode>(() => {
    const measured = worldRectOf(main.id)
    const size = (axis: 'width' | 'height') => {
      const s = main[axis]
      return typeof s === 'object' && s.mode === 'fill' ? Math.round(measured?.[axis] ?? 200) : s
    }
    return { ...main, x: 0, y: 0, position: 'flow', width: size('width'), height: size('height') }
  }, [main])
  useLayoutEffect(() => {
    const el = inner.current?.firstElementChild as HTMLElement | null
    if (!el) return
    const w = el.offsetWidth || 1
    const h = el.offsetHeight || 1
    setScale(Math.min(THUMB.width / w, THUMB.height / h, 1))
  }, [node])
  return (
    <span className="component-thumb" aria-hidden>
      <span ref={inner} className="component-thumb-inner" style={{ transform: `translate(-50%, -50%) scale(${scale})`, visibility: scale ? 'visible' : 'hidden' }}>
        <PreviewContext.Provider value>
          <NodeView node={node} parent={null} index={0} />
        </PreviewContext.Provider>
      </span>
    </span>
  )
}

/**
 * Fenêtre « Components » (barre du bas) : les composants principaux du document, avec un aperçu.
 * Un clic pose une instance au centre de la vue (ou dans le cadre sélectionné) et ferme la fenêtre.
 */
export function ComponentsPanel() {
  const doc = useDoc((s) => s.doc)
  const mains = useMemo(() => mainComponents(doc), [doc])
  if (mains.length === 0) {
    return (
      <p className="empty-note components-empty">
        No components yet. Select a frame and choose <strong>Create component</strong> (Ctrl+Alt+K).
      </p>
    )
  }
  return (
    <ul className="components-grid" aria-label="Main components">
      {mains.map(({ node, page }) => (
        <li key={node.id}>
          <button
            type="button"
            className="component-card"
            data-testid="component-card"
            data-component-id={node.id}
            data-tooltip="Insert an instance"
            onClick={() => {
              modalStore.getState().close()
              insertInstance(node.id)
            }}
          >
            <Thumbnail main={node} />
            <span className="component-card-name">
              <Icon name="component" size={16} />
              <span>{node.name}</span>
            </span>
            {doc.pages.length > 1 && <span className="component-card-page">{page}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
