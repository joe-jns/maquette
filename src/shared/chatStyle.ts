/**
 * Style choisi dans le chat (« Style » de la saisie), comme le sélecteur « Choose a style » de Pen :
 * une variante de style archétype, jointe à chaque message. Code pur.
 */
import { CHAT_IMAGE_SCHEME } from './chat'

/** Une entrée du sélecteur (vendor/design/thumbs/picker.json, extrait par scripts/extract-pen-picker.mjs). */
export interface PickerEntry {
  /** Nom de la variante, ex. « Centered Serif List - Prismatic White » ou « Swiss Type Atlas ». */
  name: string
  /** Style archétype, ex. « Centered Serif List ». */
  style: string
  /** Paramètres de la variante (polices par rôle, palette, arrondis, élévation, imagerie). */
  params: Record<string, string>
  /** Vignettes (fichiers de vendor/design/thumbs). */
  web: string
  mobile: string
}

/** Style choisi, mémorisé avec la conversation. */
export interface ChatStyle { name: string; style: string; params: Record<string, string> }

export const PICKER_FILE = 'thumbs/picker.json'

export const styleThumbUrl = (file: string): string => `${CHAT_IMAGE_SCHEME}://style/${encodeURIComponent(file)}`

/** Variante telle que l'outil `style` l'attend : ce qui suit « Style - », ou le nom entier. */
export function styleVariant(s: ChatStyle): string {
  const prefix = `${s.style} - `
  return s.name.startsWith(prefix) ? s.name.slice(prefix.length) : s.name
}

/** Description envoyée par Pen : le style puis « - clé: valeur » par paramètre. */
export function styleDescription(s: ChatStyle): string {
  return [s.style, ...Object.entries(s.params).map(([k, v]) => `- ${k}: ${v}`)].join('\n')
}

/** Ce qui part avec le message : la ligne de Pen, puis l'appel à l'outil `style` de Maquette. */
export function styleContext(s: ChatStyle): string {
  return [
    `Use the following style: ${styleDescription(s)}`,
    `Call style("${s.style}", "${styleVariant(s)}", appliquer:true) unless this conversation already applied it, then apply the whole style: typefaces and weights, palette, radii, elevation, imagery and composition rules.`,
  ].join('\n')
}

/** Style lu dans le fichier des conversations, ou null s'il est abîmé. */
export function cleanStyle(raw: unknown): ChatStyle | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.name !== 'string' || typeof o.style !== 'string' || !o.name || !o.style || o.name.length > 120 || o.style.length > 120) return null
  const params: Record<string, string> = {}
  if (o.params && typeof o.params === 'object') {
    for (const [k, v] of Object.entries(o.params as Record<string, unknown>).slice(0, 12)) {
      if (typeof v === 'string' && /^[A-Za-z]{1,40}$/.test(k)) params[k] = v.slice(0, 80)
    }
  }
  return { name: o.name, style: o.style, params }
}
