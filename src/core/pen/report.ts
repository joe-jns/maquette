/**
 * Rapport d'import d'un .pen : ce qui n'a pas été repris tel quel, par catégorie, avec le nombre de
 * calques ou de valeurs touchés. Les libellés sont montrés à l'utilisateur (en anglais).
 */

export interface ReportItem {
  /** Libellé lisible de la catégorie (anglais, montré tel quel). */
  label: string
  count: number
}

export interface ImportReport {
  /** Catégories dans l'ordre du premier signalement, sans doublon. */
  items: ReportItem[]
}

/** Catégories connues (libellés de l'interface). */
export const R = {
  notes: 'Notes, prompts and AI context removed',
  scripts: 'Script and browser layers removed',
  shaders: 'Shader fills and effects removed',
  mesh: 'Mesh gradients replaced by their average color',
  rotation: 'Rotations ignored',
  flip: 'Flips ignored',
  sideStroke: 'Strokes on some sides only, drawn as shadows',
  gradientStroke: 'Gradient strokes drawn with their first color',
  imageStroke: 'Image strokes removed',
  textStroke: 'Strokes on texts removed',
  textGradient: 'Gradient texts drawn with their first color',
  textEffects: 'Shadows and blurs on texts and icons removed',
  textVertical: 'Vertical text alignment ignored',
  textDecoration: 'Underline and strikethrough ignored',
  iconSetUnknown: 'Icons from an unknown set, drawn as grey squares',
  iconMaterialStyle: 'Material Outlined and Sharp icons drawn as Material Rounded',
  iconNotFound: 'Icons not found in their set',
  iconBrand: 'Brand logos missing from Lucide, drawn with Phosphor',
  imageMissing: 'Images not found',
  imageCrop: 'Image crops ignored',
  imageOpacity: 'Image fill opacity ignored',
  vectorImage: 'Image fills on paths removed',
  blendMode: 'Blend modes ignored',
  radialOffCenter: 'Off-center radial gradients approximated',
  conicOffCenter: 'Off-center angular gradients centered',
  missingComponent: 'Instances of a missing component (empty frames)',
  componentCycle: 'Components that contain themselves (loop broken)',
  variant: 'Component variants made independent components',
  descendantNotFound: 'Instance overrides pointing to nothing',
  theme: 'Other themes not imported (first theme of each axis shown)',
  imports: 'Linked .pen libraries not imported',
  unknownType: 'Unknown layer types removed',
  polygonRadius: 'Rounded polygon corners ignored',
  fontsDeclared: 'Fonts declared by the file (loaded from the font catalog instead)',
  newerVersion: 'File made by a newer Pen: unknown properties may be ignored',
} as const

export class ReportBuilder {
  private readonly counts = new Map<string, number>()

  add(label: string, n = 1): void {
    if (n <= 0) return
    this.counts.set(label, (this.counts.get(label) ?? 0) + n)
  }

  build(): ImportReport {
    return { items: [...this.counts].map(([label, count]) => ({ label, count })) }
  }
}
