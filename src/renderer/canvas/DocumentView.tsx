import { useDoc } from '../state/store'
import { NodeView } from './NodeView'

export function DocumentView() {
  const page = useDoc((s) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]!)
  return (
    <div className="canvas">
      <div className="world" data-testid="world">
        {page.children.map((node, i) => (
          <NodeView key={node.id} node={node} parent={null} index={i} />
        ))}
      </div>
    </div>
  )
}
