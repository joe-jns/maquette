import { describe, it, expect } from 'vitest'
import { nodeCss, resolveColor, MISSING_COLOR } from '../../src/core/css'
import type { DocStyles, FrameNode } from '../../src/core/types'
import { frame, rect, text } from './helpers'

const styles: DocStyles = {
  colors: [{ id: 'c00001', name: 'accent', value: '#C2410C' }],
  text: [{ id: 's00001', name: 'titre', fontFamily: 'Fraunces', fontWeight: 600, fontStyle: 'normal', fontSize: 64, lineHeight: 68, letterSpacing: -1.5 }],
}
const autoRow = (props = {}) =>
  frame('f00001', { x: 0, y: 0, layout: { mode: 'auto', direction: 'row', gap: 12, padding: [1, 2, 3, 4], justify: 'center', align: 'end', ...props } }) as FrameNode

describe('nodeCss', () => {
  it('cadre libre posé sur la page', () => {
    const css = nodeCss(frame('f00001', { x: 10, y: 20 }), null, styles)
    expect(css).toMatchObject({ position: 'absolute', left: '10px', top: '20px', width: '400px', height: '300px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' })
    expect(css.display).toBeUndefined()
  })

  it('cadre automatique en ligne', () => {
    expect(nodeCss(autoRow(), null, styles)).toMatchObject({
      display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', padding: '1px 2px 3px 4px',
      justifyContent: 'center', alignItems: 'flex-end', columnGap: '12px', rowGap: '12px',
    })
  })

  it('espacement "auto" = space-between', () => {
    expect(nodeCss(autoRow({ gap: 'auto' }), null, styles)).toMatchObject({ justifyContent: 'space-between', columnGap: '0px' })
  })

  it('cadre automatique "hug" sur la page = fit-content', () => {
    const f = frame('f00001', { x: 0, y: 0, width: { mode: 'hug' }, layout: { mode: 'auto' } })
    expect(nodeCss(f, null, styles)).toMatchObject({ width: 'fit-content' })
  })

  it('enfants d’une ligne : fixe, fill et hug sur les deux axes', () => {
    const parent = autoRow()
    expect(nodeCss(rect('r00001', { width: 50, height: 20 }), parent, styles)).toMatchObject({ position: 'relative', width: '50px', flexShrink: 0, height: '20px' })
    const fill = nodeCss(rect('r00002', { width: { mode: 'fill' }, height: { mode: 'fill' } }), parent, styles)
    expect(fill).toMatchObject({ flex: '1 1 0', minWidth: '0px', alignSelf: 'stretch' })
    expect(fill.width).toBeUndefined()
    expect(fill.height).toBeUndefined()
    const hug = nodeCss(text('t00001'), parent, styles)
    expect(hug).toMatchObject({ flex: '0 0 auto' })
    expect(hug.width).toBeUndefined()
  })

  it('min/max et alignSelf explicite', () => {
    const css = nodeCss(rect('r00001', { width: { mode: 'fill' }, minWidth: 80, maxWidth: 400, alignSelf: 'center' }), autoRow(), styles)
    expect(css).toMatchObject({ minWidth: '80px', maxWidth: '400px', alignSelf: 'center' })
  })

  it('enfant absolu dans un cadre automatique, enfant d’un cadre libre', () => {
    expect(nodeCss(rect('r00001', { position: 'absolute', x: 5, y: 6 }), autoRow(), styles)).toMatchObject({ position: 'absolute', left: '5px', top: '6px' })
    const free = frame('f00002', { x: 0, y: 0 }) as FrameNode
    expect(nodeCss(rect('r00002', { x: 7, y: 8 }), free, styles)).toMatchObject({ position: 'absolute', left: '7px', top: '8px' })
  })

  it('texte : police, interligne et espacement en px, couleur nommée, pas de retour en "auto"', () => {
    const css = nodeCss(text('t00001', { x: 0, y: 0, fontSize: 20, lineHeight: 24, letterSpacing: -0.5, color: { style: 'c00001' } }), null, styles)
    expect(css).toMatchObject({ fontFamily: '"Inter"', fontSize: '20px', lineHeight: '24px', letterSpacing: '-0.5px', color: '#C2410C', whiteSpace: 'pre', margin: 0, fontOpticalSizing: 'auto' })
  })

  it('texte avec style nommé : le style l’emporte', () => {
    const css = nodeCss(text('t00001', { x: 0, y: 0, textStyle: 's00001', textSizing: 'auto' }), null, styles)
    expect(css).toMatchObject({ fontFamily: '"Fraunces"', fontWeight: 600, fontSize: '64px', lineHeight: '68px', letterSpacing: '-1.5px' })
  })

  it('texte à hauteur automatique : retour à la ligne', () => {
    const css = nodeCss(text('t00001', { x: 0, y: 0, width: 300, textSizing: 'auto-height' }), null, styles)
    expect(css).toMatchObject({ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: '300px' })
  })

  it('plusieurs remplissages : le premier est dessous', () => {
    const css = nodeCss(rect('r00001', { x: 0, y: 0, fills: ['#FFFFFF', '#000000'] }), null, styles)
    expect(css.backgroundImage).toBe('linear-gradient(#000000, #000000), linear-gradient(#FFFFFF, #FFFFFF)')
    expect(css.backgroundColor).toBeUndefined()
  })

  it('contour intérieur + ombre ; contour centré en outline', () => {
    const a = nodeCss(rect('r00001', { x: 0, y: 0, stroke: { color: '#FF0000', width: 2, align: 'inside' }, shadows: [{ x: 0, y: 4, blur: 8, spread: 0, color: '#00000040', inset: false }] }), null, styles)
    expect(a.boxShadow).toBe('inset 0 0 0 2px #FF0000, 0px 4px 8px 0px #00000040')
    const b = nodeCss(rect('r00002', { x: 0, y: 0, stroke: { color: '#FF0000', width: 2, align: 'center' } }), null, styles)
    expect(b).toMatchObject({ outline: '2px solid #FF0000', outlineOffset: '-1px' })
  })

  it('arrondis, ellipse, opacité, caché, rognage', () => {
    expect(nodeCss(rect('r00001', { x: 0, y: 0, radius: [1, 2, 3, 4] }), null, styles).borderRadius).toBe('1px 2px 3px 4px')
    expect(nodeCss(rect('r00002', { x: 0, y: 0, shape: 'ellipse' }), null, styles).borderRadius).toBe('50%')
    expect(nodeCss(rect('r00003', { x: 0, y: 0, opacity: 0.5 }), null, styles).opacity).toBe(0.5)
    const hidden = frame('f00002', { x: 0, y: 0, visible: false, clip: true, layout: { mode: 'auto' } })
    expect(nodeCss(hidden, null, styles)).toMatchObject({ display: 'none', overflow: 'hidden' })
  })

  it('premier enfant au-dessus (reverseZ)', () => {
    const parent = autoRow({ reverseZ: true })
    parent.children.push(rect('r00001'), rect('r00002'))
    expect(nodeCss(parent.children[0]!, parent, styles, 0).zIndex).toBe(2)
    expect(nodeCss(parent.children[1]!, parent, styles, 1).zIndex).toBe(1)
  })

  it('hug sur l’axe secondaire d’un parent en align "stretch" : reste à la taille du contenu', () => {
    const hug = nodeCss(text('t00001'), autoRow({ align: 'stretch' }), styles)
    expect(hug.alignSelf).toBe('flex-start')
    expect(hug.height).toBeUndefined()
    expect(nodeCss(text('t00002'), autoRow({ align: 'center' }), styles).alignSelf).toBeUndefined()
  })

  it('couleur nommée inconnue : magenta visible', () => {
    expect(resolveColor({ style: 'absent' }, styles)).toBe(MISSING_COLOR)
  })
})
