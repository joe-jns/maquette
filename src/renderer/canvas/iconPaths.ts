import { useEffect, useSyncExternalStore } from 'react'
import type { IconSet, IconWeight, MaquetteDocument, Node } from '../../core/types'

/**
 * Tracés des jeux Phosphor, Feather et Material Rounded : un morceau par variante (scripts/iconPathsPlugin.ts),
 * chargé au premier usage puis gardé. Lucide reste dans le paquet principal (IconSvg.tsx).
 */

export type IconVariant =
  | 'phosphor-thin' | 'phosphor-light' | 'phosphor-regular' | 'phosphor-bold' | 'phosphor-fill' | 'phosphor-duotone'
  | 'feather' | 'material-rounded' | 'material-rounded-fill'

type Paths = Record<string, string>

// Une entrée écrite par variante : Vite en fait un morceau séparé chacune.
const LOADERS: Record<IconVariant, () => Promise<{ default: Paths }>> = {
  'phosphor-thin': () => import('virtual:icon-paths/phosphor-thin'),
  'phosphor-light': () => import('virtual:icon-paths/phosphor-light'),
  'phosphor-regular': () => import('virtual:icon-paths/phosphor-regular'),
  'phosphor-bold': () => import('virtual:icon-paths/phosphor-bold'),
  'phosphor-fill': () => import('virtual:icon-paths/phosphor-fill'),
  'phosphor-duotone': () => import('virtual:icon-paths/phosphor-duotone'),
  feather: () => import('virtual:icon-paths/feather'),
  'material-rounded': () => import('virtual:icon-paths/material-rounded'),
  'material-rounded-fill': () => import('virtual:icon-paths/material-rounded-fill'),
}

/**
 * Variante à charger pour une icône ; null pour Lucide. Material : seule la graisse 400 est embarquée,
 * la graisse du document ne change pas le dessin.
 */
export function iconVariant(set: IconSet, weight?: IconWeight, filled?: boolean): IconVariant | null {
  switch (set) {
    case 'lucide':
      return null
    case 'feather':
      return 'feather'
    case 'phosphor':
      return `phosphor-${typeof weight === 'string' ? weight : 'regular'}`
    case 'material-rounded':
      return filled ? 'material-rounded-fill' : 'material-rounded'
  }
}

const loaded = new Map<IconVariant, Paths>()
const loading = new Map<IconVariant, Promise<void>>()
const listeners = new Set<() => void>()
let version = 0

/** Charge une variante (une seule fois) ; résolu aussi en cas d'échec, l'icône reste alors vide. */
export function loadIconVariant(v: IconVariant): Promise<void> {
  if (loaded.has(v)) return Promise.resolve()
  let p = loading.get(v)
  if (!p) {
    p = LOADERS[v]()
      .then((m) => {
        loaded.set(v, m.default)
        version++
        for (const l of listeners) l()
      })
      .catch((e: unknown) => console.error(`icônes ${v} :`, e))
    loading.set(v, p)
  }
  return p
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** Tracés d'une variante, ou undefined tant qu'elle se charge (le composant est redessiné ensuite). */
export function useIconPaths(v: IconVariant | null): Paths | undefined {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (v) void loadIconVariant(v)
  }, [v])
  return v ? loaded.get(v) : undefined
}

function collect(nodes: Node[], out: Set<IconVariant>): void {
  for (const node of nodes) {
    if (node.type === 'icon') {
      const v = iconVariant(node.set, node.weight, node.filled)
      if (v) out.add(v)
    } else if (node.type === 'frame') collect(node.children, out)
  }
}

/** Charge les variantes utilisées par le document : un rendu fait juste après (export, capture) a ses tracés. */
export async function ensureDocumentIcons(doc: MaquetteDocument): Promise<void> {
  const used = new Set<IconVariant>()
  for (const page of doc.pages) collect(page.children, used)
  await Promise.all([...used].map(loadIconVariant))
}
