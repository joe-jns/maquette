import { describe, it, expect } from 'vitest'
import { copyNodes } from '../../src/renderer/canvas/clipboard'
import {
  choosePaste, droppedImageUrls, gridLayout, imageUrlsFromHtml, imageUrlsFromUriList, importSize, looksLikeImageUrl,
} from '../../src/renderer/canvas/imagePaste'
import { docWith, rect } from '../core/helpers'

const copied = JSON.stringify(copyNodes(docWith([rect('R1')]), ['R1']))
const clip = (c: Partial<{ text: string; html: string; image: boolean }>) => ({ text: '', html: '', image: false, ...c })

describe('que coller', () => {
  it('des éléments Maquette copiés passent avant tout', () => {
    expect(choosePaste(clip({ text: copied, image: true }), '').kind).toBe('nodes')
  })

  it('une image (capture Win+Maj+S, « Copier l’image ») avant le HTML qui l’accompagne', () => {
    expect(choosePaste(clip({ image: true, html: '<img src="https://x.com/a.png">' }), copied)).toEqual({ kind: 'image' })
  })

  it('sans image : les images du HTML, puis une adresse d’image seule', () => {
    expect(choosePaste(clip({ html: '<meta charset="utf-8"><img src="https://cdn.dribbble.com/shot.webp" alt="">' }), '')).toEqual({
      kind: 'urls', urls: ['https://cdn.dribbble.com/shot.webp'],
    })
    expect(choosePaste(clip({ text: ' https://exemple.be/photo.JPG ' }), '')).toEqual({ kind: 'urls', urls: ['https://exemple.be/photo.JPG'] })
    expect(choosePaste(clip({ text: 'https://exemple.be/page' }), '')).toEqual({ kind: 'none' })
  })

  it('un texte quelconque ne colle rien, même avec une copie interne', () => {
    expect(choosePaste(clip({ text: 'bonjour' }), copied)).toEqual({ kind: 'none' })
  })

  it('presse-papiers vide ou illisible : la copie interne', () => {
    expect(choosePaste(clip({}), copied).kind).toBe('nodes')
    expect(choosePaste(null, copied).kind).toBe('nodes')
    expect(choosePaste(null, '')).toEqual({ kind: 'none' })
  })
})

describe('adresses d’images', () => {
  it('reconnaît une image par son extension, le format de Twitter/X ou data:image', () => {
    expect(looksLikeImageUrl('https://a.b/c/d.avif?x=1')).toBe(true)
    expect(looksLikeImageUrl('https://pbs.twimg.com/media/abc?format=jpg&name=small')).toBe(true)
    expect(looksLikeImageUrl('data:image/png;base64,AAAA')).toBe(true)
    expect(looksLikeImageUrl('file:///C:/a.png')).toBe(false)
    expect(looksLikeImageUrl('https://a.b/page.html')).toBe(false)
  })

  it('HTML : plus grande variante du srcset, entités décodées, Twitter en grand, sans doublon', () => {
    const html = [
      '<img srcset="https://a.b/s.jpg 400w, https://a.b/l.jpg 1600w, https://a.b/m.jpg 800w" src="https://a.b/s.jpg">',
      "<IMG alt='x' src='https://pbs.twimg.com/media/Q1?format=jpg&amp;name=small'>",
      '<img src="https://a.b/l.jpg">',
      '<img src="/relatif.png"><img src="javascript:alert(1)">',
    ].join('')
    expect(imageUrlsFromHtml(html)).toEqual(['https://a.b/l.jpg', 'https://pbs.twimg.com/media/Q1?format=jpg&name=large'])
  })

  it('glisser depuis une page : le HTML d’abord (un lien autour d’une image vise la page), sinon la liste d’URI', () => {
    expect(droppedImageUrls('<a href="https://dribbble.com/shots/1"><img src="https://cdn.x/1.png"></a>', 'https://dribbble.com/shots/1')).toEqual(['https://cdn.x/1.png'])
    expect(droppedImageUrls('', '# commentaire\r\nhttps://a.b/1.png\r\nhttps://a.b/page')).toEqual(['https://a.b/1.png'])
    expect(imageUrlsFromUriList('https://a.b/1.png\nhttps://a.b/1.png')).toEqual(['https://a.b/1.png'])
  })
})

describe('disposition', () => {
  it('taille importée : 800 px de large au plus, proportions gardées', () => {
    expect(importSize({ width: 2880, height: 1800 })).toEqual({ width: 800, height: 500 })
    expect(importSize({ width: 300, height: 200 })).toEqual({ width: 300, height: 200 })
  })

  it('une image : à l’origine', () => {
    expect(gridLayout([{ width: 800, height: 500 }])).toEqual({ positions: [{ x: 0, y: 0 }], width: 800, height: 500 })
  })

  it('plusieurs images : grille de ⌈√n⌉ colonnes, colonnes et rangées à la taille de leur plus grande image', () => {
    const sizes = [
      { width: 800, height: 500 }, { width: 600, height: 900 }, { width: 800, height: 450 },
      { width: 400, height: 300 }, { width: 800, height: 600 },
    ]
    const g = gridLayout(sizes, 40)
    // 5 images → 3 colonnes (800, 800, 800 de large), 2 rangées (900 puis 600 de haut).
    expect(g.positions).toEqual([
      { x: 0, y: 0 }, { x: 840, y: 0 }, { x: 1680, y: 0 },
      { x: 0, y: 940 }, { x: 840, y: 940 },
    ])
    expect(g).toMatchObject({ width: 2480, height: 1540 })
    // Rien ne se chevauche.
    const boxes = g.positions.map((p, i) => ({ ...p, ...sizes[i]! }))
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)
      }
    }
  })
})
