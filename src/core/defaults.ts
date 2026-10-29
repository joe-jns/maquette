import { newId } from './ids'
import type { AutoLayout, MaquetteDocument, Node, NodeInput } from './types'

export function autoLayoutDefaults(): AutoLayout {
  return {
    mode: 'auto', direction: 'column', gap: 0, padding: [0, 0, 0, 0],
    justify: 'start', align: 'start', wrap: false, reverseZ: false,
  }
}

export function newDocument(): MaquetteDocument {
  return {
    format: 'maquette',
    version: 1,
    styles: { colors: [], text: [] },
    pages: [{ id: newId(), name: 'Page 1', children: [] }],
  }
}

/** Icône d'un élément `icon` créé sans nom d'icône. */
export const DEFAULT_ICON = 'star'

/** Tracé d'un vecteur créé sans tracé : un triangle dans un carré de 100. */
export const DEFAULT_PATH = 'M50 0L100 100H0Z'

const common = { visible: true, locked: false, opacity: 1, position: 'flow' as const }

/** Crée un élément complet à partir d'une saisie partielle. `id` est imposé. */
export function createNode(input: NodeInput, id: string): Node {
  switch (input.type) {
    case 'frame': {
      const { layout, ...rest } = input
      return {
        ...common, name: 'Frame', width: 400, height: 300,
        fills: ['#FFFFFF'], radius: 0, shadows: [], clip: false,
        ...rest,
        id, type: 'frame', children: [],
        layout: layout?.mode === 'auto' ? { ...autoLayoutDefaults(), ...layout } : { mode: 'free' },
      }
    }
    case 'text': {
      const fontSize = input.fontSize ?? 16
      return {
        ...common, name: 'Text', width: { mode: 'hug' }, height: { mode: 'hug' },
        content: 'Text', fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal',
        fontSize, lineHeight: Math.round(fontSize * 1.2), letterSpacing: 0,
        textAlign: 'left', color: '#111111', textSizing: 'auto',
        ...input, id, type: 'text',
      }
    }
    case 'shape':
      return {
        ...common, name: input.shape === 'ellipse' ? 'Ellipse' : 'Rectangle', width: 100, height: 100,
        shape: 'rectangle', fills: ['#D9D9D9'], radius: 0, shadows: [],
        ...input, id, type: 'shape',
      }
    case 'image':
      return {
        ...common, name: 'Image', width: 200, height: 150,
        src: '', fit: 'cover', radius: 0, shadows: [],
        ...input, id, type: 'image',
      }
    case 'vector':
      return {
        ...common, name: 'Vector', width: input.viewBox?.[2] ?? 100, height: input.viewBox?.[3] ?? 100,
        path: DEFAULT_PATH, viewBox: [0, 0, 100, 100], fillRule: 'nonzero', fills: ['#D9D9D9'], shadows: [],
        ...input, id, type: 'vector',
      }
    case 'icon': {
      const icon = input.icon ?? DEFAULT_ICON
      return {
        ...common, name: icon, width: 24, height: 24,
        icon, set: 'lucide', color: '#111111', strokeWidth: 2,
        ...input, id, type: 'icon',
      }
    }
  }
}
