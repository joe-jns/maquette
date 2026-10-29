import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Tracés des jeux d'icônes Phosphor, Feather et Material Rounded, lus dans les paquets au moment de
 * la compilation : un module virtuel par variante (`virtual:icon-paths/phosphor-bold`…), chargé à
 * la demande par le rendu (src/renderer/canvas/iconPaths.ts), donc un morceau à part du paquet
 * de l'app. Chaque module exporte { nom: tracé } : l'attribut « d » quand l'icône est un seul
 * chemin sans attribut, sinon le contenu SVG de l'icône (Feather, Phosphor duotone).
 */

const PREFIX = 'virtual:icon-paths/'
const RESOLVED = '\0icon-paths:'
const PHOSPHOR = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']
export const ICON_VARIANTS = [...PHOSPHOR.map((w) => `phosphor-${w}`), 'feather', 'material-rounded', 'material-rounded-fill']

const require = createRequire(import.meta.url)
/** Dossier d'un paquet (sans passer par ses « exports », qui ne publient pas toujours package.json). */
function pkg(name: string): string {
  const dir = (require.resolve.paths(name) ?? []).map((d) => join(d, name)).find((d) => existsSync(join(d, 'package.json')))
  if (!dir) throw new Error(`paquet introuvable : ${name}`)
  return dir
}

/** Contenu d'un fichier SVG : un tracé seul se réduit à son « d ». */
function inner(svg: string): string {
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
  const single = /^<path d="([^"]+)"\s*\/>$/.exec(body)
  return single ? single[1]! : body
}

function readDir(dir: string, toName: (file: string) => string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of readdirSync(dir).sort()) {
    const name = toName(file)
    if (name) out[name] = inner(readFileSync(join(dir, file), 'utf8'))
  }
  return out
}

function variant(id: string): Record<string, string> {
  if (id === 'feather') return JSON.parse(readFileSync(join(pkg('feather-icons'), 'dist/icons.json'), 'utf8')) as Record<string, string>
  if (id.startsWith('phosphor-')) {
    const w = id.slice('phosphor-'.length)
    const suffix = w === 'regular' ? '.svg' : `-${w}.svg`
    return readDir(join(pkg('@phosphor-icons/core'), 'assets', w), (f) => (f.endsWith(suffix) ? f.slice(0, -suffix.length) : null))
  }
  const fill = id === 'material-rounded-fill'
  return readDir(join(pkg('@material-symbols/svg-400'), 'rounded'), (f) =>
    !f.endsWith('.svg') || f.endsWith('-fill.svg') !== fill ? null : f.slice(0, fill ? -'-fill.svg'.length : -'.svg'.length),
  )
}

export function iconPaths(): Plugin {
  return {
    name: 'maquette-icon-paths',
    resolveId(id) {
      if (!id.startsWith(PREFIX)) return null
      const v = id.slice(PREFIX.length)
      return ICON_VARIANTS.includes(v) ? RESOLVED + v : null
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return null
      // JSON.parse d'une chaîne : plus rapide à lire qu'un gros objet littéral.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(variant(id.slice(RESOLVED.length))))})`
    },
  }
}
