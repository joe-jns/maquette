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
/**
 * Image en remplissage d'un cadre ou d'une forme. `src` suit les règles d'un élément image (« assets/… »
 * à côté du fichier) ; `fit` comme `object-fit` : cover (recadre), contain (entière), fill (étirée).
 */
export interface ImageFill { type: 'image'; src: string; fit: 'cover' | 'contain' | 'fill' }
/** Couleur ou dégradé (remplissage d'un vecteur). */
export type Paint = Color | Gradient
/** Remplissage d'un cadre ou d'une forme : une couleur, un dégradé ou une image. */
export type Fill = Paint | ImageFill

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

/** Flous d'un cadre, d'une forme, d'une image ou d'un vecteur, en px (absents = aucun). */
export interface Blurs {
  /** Flou du calque lui-même (`filter: blur()`). */
  blur?: number
  /** Flou de ce qui est derrière le calque, visible à travers ses parties transparentes (`backdrop-filter: blur()`). */
  backgroundBlur?: number
}

export interface FrameNode extends BaseNode, Blurs {
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

export interface ShapeNode extends BaseNode, Blurs {
  type: 'shape'
  shape: 'rectangle' | 'ellipse'
  fills: Fill[]
  stroke?: Stroke
  radius: Radius
  shadows: Shadow[]
}

export interface ImageNode extends BaseNode, Blurs {
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

/**
 * Tracé vectoriel (attribut « d » d'un chemin SVG) étiré dans sa boîte : `viewBox` [x, y, largeur, hauteur]
 * est la zone du tracé qui remplit la boîte. Le contour garde son épaisseur en px quelle que soit la taille.
 */
export interface VectorNode extends BaseNode, Blurs {
  type: 'vector'
  path: string
  viewBox: [number, number, number, number]
  fillRule: 'nonzero' | 'evenodd'
  /** Couleurs et dégradés (pas d'image). */
  fills: Paint[]
  stroke?: Stroke
  shadows: Shadow[]
}

export type Node = FrameNode | TextNode | ShapeNode | ImageNode | IconNode | VectorNode
export type NodeType = Node['type']

type Without<T> = Omit<T, 'id' | 'type' | 'children' | 'layout'>
/** Ce qu'il faut fournir pour créer un élément : le type, le reste est facultatif. */
export type NodeInput =
  | ({ type: 'frame'; layout?: FreeLayout | (Partial<AutoLayout> & { mode: 'auto' }) } & Partial<Without<FrameNode>>)
  | ({ type: 'text' } & Partial<Without<TextNode>>)
  | ({ type: 'shape' } & Partial<Without<ShapeNode>>)
  | ({ type: 'image' } & Partial<Without<ImageNode>>)
  | ({ type: 'icon' } & Partial<Without<IconNode>>)
  | ({ type: 'vector' } & Partial<Without<VectorNode>>)

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
