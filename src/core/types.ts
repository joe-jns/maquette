export type Id = string
export type Color = string | { style: Id }
export type Size = number | { mode: 'hug' } | { mode: 'fill' }
export type Axis = 'width' | 'height'

export interface Stroke { color: Color; width: number; align: 'inside' | 'outside' | 'center' }
export interface Shadow { x: number; y: number; blur: number; spread: number; color: Color; inset: boolean }
export type Radius = number | [number, number, number, number]

export type Justify = 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'
export type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline'

export interface FreeLayout { mode: 'free' }
export interface AutoLayout {
  mode: 'auto'
  direction: 'row' | 'column'
  gap: number | 'auto'
  padding: [number, number, number, number]
  justify: Justify
  align: Align
  wrap: boolean
  rowGap?: number
  reverseZ: boolean
}
export type Layout = FreeLayout | AutoLayout

export interface BaseNode {
  id: Id
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  width: Size
  height: Size
  x?: number
  y?: number
  position: 'flow' | 'absolute'
  alignSelf?: 'start' | 'center' | 'end' | 'stretch'
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
}

export interface FrameNode extends BaseNode {
  type: 'frame'
  children: Node[]
  layout: Layout
  fills: Color[]
  stroke?: Stroke
  radius: Radius
  shadows: Shadow[]
  clip: boolean
}

export interface TextNode extends BaseNode {
  type: 'text'
  content: string
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  fontSize: number
  lineHeight: number
  letterSpacing: number
  textAlign: 'left' | 'center' | 'right' | 'justify'
  color: Color
  textStyle?: Id
  textSizing: 'auto' | 'auto-height' | 'fixed'
}

export interface ShapeNode extends BaseNode {
  type: 'shape'
  shape: 'rectangle' | 'ellipse'
  fills: Color[]
  stroke?: Stroke
  radius: Radius
  shadows: Shadow[]
}

export interface ImageNode extends BaseNode {
  type: 'image'
  src: string
  fit: 'cover' | 'contain' | 'fill'
  radius: Radius
  stroke?: Stroke
  shadows: Shadow[]
}

export type Node = FrameNode | TextNode | ShapeNode | ImageNode
export type NodeType = Node['type']

type Without<T> = Omit<T, 'id' | 'type' | 'children' | 'layout'>
/** Ce qu'il faut fournir pour créer un élément : le type, le reste est facultatif. */
export type NodeInput =
  | ({ type: 'frame'; layout?: FreeLayout | (Partial<AutoLayout> & { mode: 'auto' }) } & Partial<Without<FrameNode>>)
  | ({ type: 'text' } & Partial<Without<TextNode>>)
  | ({ type: 'shape' } & Partial<Without<ShapeNode>>)
  | ({ type: 'image' } & Partial<Without<ImageNode>>)

export interface ColorStyle { id: Id; name: string; value: string }
export interface TextStyle {
  id: Id
  name: string
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  fontSize: number
  lineHeight: number
  letterSpacing: number
}
export interface DocStyles { colors: ColorStyle[]; text: TextStyle[] }

export interface Page { id: Id; name: string; children: Node[] }

export interface MaquetteDocument {
  format: 'maquette'
  version: 1
  styles: DocStyles
  pages: Page[]
}

/** Rectangle mesuré dans le rendu, en coordonnées du parent. */
export interface Rect { x: number; y: number; width: number; height: number }
