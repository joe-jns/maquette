import { describe, it, expect } from 'vitest'
import { createNode } from '../../src/core/defaults'
import type { FrameNode, Node } from '../../src/core/types'
import { buttonLikeIds, navLikeIds } from '../../src/taste/rules'

const auto = { mode: 'auto', direction: 'row', gap: 8, padding: [16, 28, 16, 28] } as const
const hug = { mode: 'hug' } as const

function frame(id: string, props: Record<string, unknown>, children: Node[] = []): FrameNode {
  const f = createNode({ type: 'frame', ...props } as never, id) as FrameNode
  f.children.push(...children)
  return f
}
const text = (id: string, content: string) => createNode({ type: 'text', content } as never, id)
const icon = (id: string) => createNode({ type: 'icon', icon: 'arrow-right' } as never, id)

describe('barres de navigation (règle eyebrow)', () => {
  it('reconnues à leur nom, sans descendre dedans ; une section « Menu du jour » n’en est pas une', () => {
    const page = frame('page', { width: 1440, height: 900, fills: [], layout: { mode: 'auto', direction: 'column' } }, [
      frame('n1', { name: 'Navigation', layout: auto }, [frame('n2', { name: 'Nav interne', layout: auto })]),
      frame('n3', { name: 'Barre du haut', layout: auto }),
      frame('n4', { name: 'En-tête', layout: auto }),
      frame('m1', { name: 'Menu du jour', layout: auto }),
    ])
    expect(navLikeIds(page)).toEqual(['n1', 'n3', 'n4'])
  })
})

describe('cadres lus comme des boutons (règle first-action)', () => {
  it('un cadre rempli en disposition auto avec un libellé court, avec ou sans icône', () => {
    const page = frame('page', { width: 1440, height: 900, layout: { mode: 'auto', direction: 'column' } }, [
      frame('b1', { layout: auto, width: { mode: 'hug' }, height: { mode: 'hug' } }, [text('t1', 'Réserver un cours d’essai')]),
      frame('b2', { layout: auto, height: hug, fills: [], stroke: { color: '#111111', width: 1, align: 'inside' } }, [text('t2', 'Voir'), icon('i2')]),
    ])
    page.fills = []
    expect(buttonLikeIds(page)).toEqual(['b1', 'b2'])
  })

  it('ni un cadre transparent sans bordure, ni un bloc de texte, ni un cadre libre, ni une section', () => {
    const page = frame('page', { width: 1440, height: 900, fills: [], layout: { mode: 'auto', direction: 'column' } }, [
      frame('nu', { layout: auto, height: hug, fills: [] }, [text('t1', 'Lien')]),
      frame('long', { layout: auto, height: hug }, [text('t2', 'Un paragraphe entier qui dépasse largement la longueur d’un libellé de bouton.')]),
      frame('libre', { height: 48 }, [text('t3', 'Libre')]),
      frame('haut', { layout: auto, height: 400 }, [text('t4', 'Section')]),
      frame('deux', { layout: auto, height: hug }, [text('t5', 'Un'), text('t6', 'Deux')]),
    ])
    expect(buttonLikeIds(page)).toEqual([])
  })
})
