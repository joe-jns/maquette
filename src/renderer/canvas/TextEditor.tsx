import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { TextNode } from '../../core/types'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'

/**
 * Édition d'un texte directement dans son élément (contentEditable en texte brut) : ce qu'on tape
 * s'affiche avec la vraie mise en forme. À la sortie, une seule opération — donc une seule
 * annulation ; un texte vidé est supprimé.
 */
export function TextEditor({ node, style }: { node: TextNode; style: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current!
    el.textContent = node.content
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // Le contenu est géré à la main : React ne doit pas le réécrire pendant la frappe.
  }, [node.id])

  const finish = () => {
    if (done.current) return
    done.current = true
    const content = (ref.current?.innerText ?? node.content).replace(/\r\n?/g, '\n').replace(/\n$/, '')
    uiStore.getState().setEditing(null)
    if (content === '') {
      docStore.getState().dispatch([{ op: 'delete', id: node.id }], 'Modifier le texte')
      // Ne retirer que ce texte : un clic ailleurs a peut-être déjà sélectionné autre chose.
      const ui = uiStore.getState()
      ui.select(ui.selection.filter((id) => id !== node.id))
    } else if (content !== node.content) {
      docStore.getState().dispatch([{ op: 'update', id: node.id, set: { content } }], 'Modifier le texte')
    }
  }

  return (
    <div
      ref={ref}
      data-node-id={node.id}
      data-editing
      style={{ ...style, cursor: 'text', userSelect: 'text', outline: 'none' }}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          finish()
        }
      }}
    />
  )
}
