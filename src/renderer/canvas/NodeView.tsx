import { memo, useState, type CSSProperties } from 'react'
import { frameStrokeCss, nodeCss } from '../../core/css'
import type { FrameNode, ImageNode, Node, TextNode } from '../../core/types'
import { useDoc } from '../state/store'
import { useUi } from '../state/ui'
import { assetUrl } from './assetUrl'
import { TextEditor } from './TextEditor'

/**
 * Un élément du document en vraie balise HTML. Mémoïsé : grâce au partage de structure d'Immer, un
 * élément inchangé garde la même identité et n'est pas redessiné.
 */
export const NodeView = memo(function NodeView({ node, parent, index }: { node: Node; parent: FrameNode | null; index: number }) {
  const styles = useDoc((s) => s.doc.styles)
  const style = nodeCss(node, parent, styles, index) as CSSProperties
  switch (node.type) {
    case 'frame': {
      const stroke = frameStrokeCss(node, styles)
      return (
        <div data-node-id={node.id} style={style}>
          {node.children.map((child, i) => (
            <NodeView key={child.id} node={child} parent={node} index={i} />
          ))}
          {stroke && <div aria-hidden data-stroke style={stroke as CSSProperties} />}
        </div>
      )
    }
    case 'text':
      return <TextView node={node} style={style} />
    case 'shape':
      return <div data-node-id={node.id} style={style} />
    case 'image':
      return <ImageView node={node} style={style} />
  }
})

function TextView({ node, style }: { node: TextNode; style: CSSProperties }) {
  const editing = useUi((s) => s.editingTextId === node.id)
  if (editing) return <TextEditor node={node} style={style} />
  return <div data-node-id={node.id} style={style}>{node.content}</div>
}

function ImageView({ node, style }: { node: ImageNode; style: CSSProperties }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!node.src || failedSrc === node.src) {
    return (
      <div data-node-id={node.id} style={style} className="missing-image" role="img" aria-label="Image introuvable">
        Image introuvable
      </div>
    )
  }
  return (
    <img
      data-node-id={node.id}
      style={style}
      src={assetUrl(node.src)}
      alt=""
      draggable={false}
      onError={() => setFailedSrc(node.src)}
    />
  )
}
