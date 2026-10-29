export type Id = string
export type Color = string | { style: Id }
export type Size = number | { mode: 'hug' } | { mode: 'fill' }
export type Axis = 'width' | 'height'

/** Arrêt d'un dégradé : `position` de 0 (début) à 1 (fin). */
export interface GradientStop { color: Color; position: number }
/** Dégradé linéaire : `angle` en degrés, comme en CSS (0 = vers le haut, 90 = vers la droite, 180 = vers le bas). */
export interface LinearGradient { type: 'linear'; angle: number; stops: GradientStop[] }
/** Dégradé radial, du centre vers les coins. */
export interface RadialGradient { type: 'radial'; stops: GradientStop[] }
/** Dégradé conique autour du centre : `angle` = départ en degrés (0 = en haut, sens horaire), comme `conic-gradient(from …)`. */
export interface ConicGradient { type: 'conic'; angle: number; stops: GradientStop[] }
export type Gradient = LinearGradient | RadialGradient | ConicGradient
/** Remplissage d'un cadre ou d'une forme : une couleur ou un dégradé. */
export type Fill = Color | Gradient

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
  fills: Fill[]
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
  fills: Fill[]
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

/** Icône d'un jeu embarqué (Lucide), dessinée au trait dans sa boîte, en `color`. */
export interface IconNode extends BaseNode {
  type: 'icon'
  /** Nom de l'icône dans le jeu (kebab-case, ex. « arrow-right ») ; `name` reste le nom du calque. */
  icon: string
  set: 'lucide'
  color: Color
  /** Épaisseur du trait, dans la grille 24 × 24 de l'icône (mise à l'échelle avec elle). */
  strokeWidth: number
}

export type Node = FrameNode | TextNode | ShapeNode | ImageNode | IconNode
export type NodeType = Node['type']

type Without<T> = Omit<T, 'id' | 'type' | 'children' | 'layout'>
/** Ce qu'il faut fournir pour créer un élément : le type, le reste est facultatif. */
export type NodeInput =
  | ({ type: 'frame'; layout?: FreeLayout | (Partial<AutoLayout> & { mode: 'auto' }) } & Partial<Without<FrameNode>>)
  | ({ type: 'text' } & Partial<Without<TextNode>>)
  | ({ type: 'shape' } & Partial<Without<ShapeNode>>)
  | ({ type: 'image' } & Partial<Without<ImageNode>>)
  | ({ type: 'icon' } & Partial<Without<IconNode>>)

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
