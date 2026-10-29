import { z } from 'zod'
import type { MaquetteDocument, Node } from './types'

export const HEX_COLOR = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/

const Id = z.string().regex(/^[^/$][^/]*$/, 'identifiant invalide (pas de « / », pas de « $ » au début)')
const Px = z.number().nonnegative()
const ColorSchema = z.union([z.string().regex(HEX_COLOR, 'couleur attendue : #RRGGBB ou #RRGGBBAA'), z.strictObject({ style: Id })])
const StopSchema = z.strictObject({ color: ColorSchema, position: z.number().min(0).max(1) })
const GradientSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('linear'), angle: z.number(), stops: z.array(StopSchema).min(2, 'un dégradé a au moins 2 arrêts') }),
  z.strictObject({ type: z.literal('radial'), stops: z.array(StopSchema).min(2, 'un dégradé a au moins 2 arrêts') }),
  z.strictObject({ type: z.literal('conic'), angle: z.number(), stops: z.array(StopSchema).min(2, 'un dégradé a au moins 2 arrêts') }),
])
const ImageFillSchema = z.strictObject({ type: z.literal('image'), src: z.string(), fit: z.enum(['cover', 'contain', 'fill']) })
const FillSchema = z.union([ColorSchema, GradientSchema, ImageFillSchema])
const SizeSchema = z.union([Px, z.strictObject({ mode: z.literal('hug') }), z.strictObject({ mode: z.literal('fill') })])
const StrokeSchema = z.strictObject({ color: ColorSchema, width: z.number().positive(), align: z.enum(['inside', 'outside', 'center']) })
const ShadowSchema = z.strictObject({
  x: z.number(), y: z.number(), blur: Px, spread: z.number(), color: ColorSchema, inset: z.boolean(),
})
const RadiusSchema = z.union([Px, z.tuple([Px, Px, Px, Px])])

const LayoutSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('free') }),
  z.strictObject({
    mode: z.literal('auto'),
    direction: z.enum(['row', 'column']),
    gap: z.union([z.number(), z.literal('auto')]),
    padding: z.tuple([Px, Px, Px, Px]),
    justify: z.enum(['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly']),
    align: z.enum(['start', 'center', 'end', 'stretch', 'baseline']),
    wrap: z.boolean(),
    rowGap: z.number().optional(),
    reverseZ: z.boolean(),
  }),
])

const base = {
  id: Id,
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
  width: SizeSchema,
  height: SizeSchema,
  x: z.number().optional(),
  y: z.number().optional(),
  position: z.enum(['flow', 'absolute']),
  alignSelf: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  minWidth: Px.optional(),
  maxWidth: Px.optional(),
  minHeight: Px.optional(),
  maxHeight: Px.optional(),
}

const blurs = { blur: Px.optional(), backgroundBlur: Px.optional() }

const FrameSchema = z.strictObject({
  ...base,
  type: z.literal('frame'),
  ...blurs,
  children: z.array(z.lazy((): z.ZodType<Node> => NodeSchema)),
  layout: LayoutSchema,
  fills: z.array(FillSchema),
  stroke: StrokeSchema.optional(),
  radius: RadiusSchema,
  shadows: z.array(ShadowSchema),
  clip: z.boolean(),
})

const TextSchema = z.strictObject({
  ...base,
  type: z.literal('text'),
  content: z.string(),
  fontFamily: z.string().min(1),
  fontWeight: z.number().int().min(1).max(1000),
  fontStyle: z.enum(['normal', 'italic']),
  fontSize: z.number().positive(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']),
  color: ColorSchema,
  textStyle: Id.optional(),
  textSizing: z.enum(['auto', 'auto-height', 'fixed']),
})

const ShapeSchema = z.strictObject({
  ...base,
  type: z.literal('shape'),
  ...blurs,
  shape: z.enum(['rectangle', 'ellipse']),
  fills: z.array(FillSchema),
  stroke: StrokeSchema.optional(),
  radius: RadiusSchema,
  shadows: z.array(ShadowSchema),
})

const ImageSchema = z.strictObject({
  ...base,
  type: z.literal('image'),
  ...blurs,
  src: z.string(),
  fit: z.enum(['cover', 'contain', 'fill']),
  radius: RadiusSchema,
  stroke: StrokeSchema.optional(),
  shadows: z.array(ShadowSchema),
})

const IconSchema = z.strictObject({
  ...base,
  type: z.literal('icon'),
  icon: z.string().min(1),
  set: z.literal('lucide'),
  color: ColorSchema,
  strokeWidth: z.number().positive().max(24),
})

export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.discriminatedUnion('type', [FrameSchema, TextSchema, ShapeSchema, ImageSchema, IconSchema]),
)

const ColorStyleSchema = z.strictObject({ id: Id, name: z.string().min(1), value: z.string().regex(HEX_COLOR) })
const TextStyleSchema = z.strictObject({
  id: Id,
  name: z.string().min(1),
  fontFamily: z.string().min(1),
  fontWeight: z.number().int().min(1).max(1000),
  fontStyle: z.enum(['normal', 'italic']),
  fontSize: z.number().positive(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
})

const PageSchema = z.strictObject({ id: Id, name: z.string().min(1), children: z.array(NodeSchema) })

export const DocumentSchema: z.ZodType<MaquetteDocument> = z.strictObject({
  format: z.literal('maquette'),
  version: z.literal(1),
  styles: z.strictObject({ colors: z.array(ColorStyleSchema), text: z.array(TextStyleSchema) }),
  pages: z.array(PageSchema),
})
