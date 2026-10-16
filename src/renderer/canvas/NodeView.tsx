import type { CSSProperties } from 'react'
import { nodeCss } from '../../core/css'
import type { FrameNode, Node } from '../../core/types'
import { useDoc } from '../state/store'

export function NodeView({ node, parent, index }: { node: Node; parent: FrameNode | null; index: number }) {
  const styles = useDoc((s) => s.doc.styles)
  const style = nodeCss(node, parent, styles, index) as CSSProperties
  switch (node.type) {
    case 'frame':
      return (
        <div data-node-id={node.id} style={style}>
          {node.children.map((child, i) => (
            <NodeView key={child.id} node={child} parent={node} index={i} />
          ))}
        </div>
      )
    case 'text':
      return <div data-node-id={node.id} style={style}>{node.content}</div>
    case 'shape':
      return <div data-node-id={node.id} style={style} />
    case 'image':
      return <img data-node-id={node.id} style={style} src={node.src} alt="" draggable={false} />
  }
}
