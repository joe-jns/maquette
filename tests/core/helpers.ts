import { createNode, newDocument } from '../../src/core/defaults'
import type { MaquetteDocument, Node, NodeInput } from '../../src/core/types'

export function docWith(children: Node[]): MaquetteDocument {
  const doc = newDocument()
  doc.pages[0]!.children = children
  return doc
}

export const frame = (id: string, props: Partial<Extract<NodeInput, { type: 'frame' }>> = {}): Node =>
  createNode({ type: 'frame', ...props }, id)

export const text = (id: string, props: Partial<Extract<NodeInput, { type: 'text' }>> = {}): Node =>
  createNode({ type: 'text', ...props }, id)

export const rect = (id: string, props: Partial<Extract<NodeInput, { type: 'shape' }>> = {}): Node =>
  createNode({ type: 'shape', ...props }, id)
