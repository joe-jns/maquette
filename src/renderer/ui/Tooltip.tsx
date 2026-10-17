import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeTooltip, type TooltipSide } from './placement'
import { tooltipDelay } from './tooltipTiming'
import './tooltip.css'

/**
 * Infobulles maison, comme Figma : pastille sombre, libellé + raccourci en gris.
 *
 * Un seul gestionnaire pour toute la fenêtre (délégation), pas un composant par bouton. Une cible
 * le demande par ses attributs :
 * - `data-tooltip` : le libellé ;
 * - `data-shortcut` : le raccourci clavier, facultatif (« Ctrl+D ») ;
 * - `data-tooltip-side="top"` sur elle ou un ancêtre : au-dessus (barre d'outils du bas).
 *
 * L'infobulle ne remplace pas le nom accessible : les boutons-icônes gardent leur `aria-label`.
 */

const TIP_ID = 'maquette-tooltip'

interface Tip { target: HTMLElement; label: string; shortcut: string | null }
interface Pos { left: number; top: number; side: TooltipSide; arrowX: number }

const tipTarget = (node: EventTarget | null): HTMLElement | null =>
  node instanceof Element ? (node.closest('[data-tooltip]') as HTMLElement | null) : null

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer = 0
    let watch = 0
    /** Cible sous le pointeur (ou qui a le focus clavier). */
    let current: HTMLElement | null = null
    /** Cible dont l'infobulle est affichée. */
    let shown: HTMLElement | null = null
    /** Quand la dernière infobulle a été cachée en quittant sa cible (pour enchaîner sans délai). */
    let hiddenAt: number | null = null
    /** Cible cliquée : plus d'infobulle tant que le pointeur ne l'a pas quittée. */
    let suppressed: HTMLElement | null = null

    const show = (el: HTMLElement) => {
      const label = el.dataset.tooltip
      if (!label || !el.isConnected) return
      shown = el
      setTip({ target: el, label, shortcut: el.dataset.shortcut || null })
      // Une cible qui disparaît (re-rendu, panneau fermé) emporte son infobulle.
      clearInterval(watch)
      watch = window.setInterval(() => {
        if (shown && (!shown.isConnected || !shown.dataset.tooltip)) hide(false)
      }, 250)
    }

    /** `warm` : quittée normalement (la suivante s'affiche aussitôt) ; sinon clic, Échap, défilement. */
    const hide = (warm: boolean) => {
      clearTimeout(timer)
      clearInterval(watch)
      if (shown) hiddenAt = warm ? performance.now() : null
      shown = null
      setTip(null)
    }

    const enter = (el: HTMLElement | null) => {
      if (el === current) return
      current = el
      clearTimeout(timer)
      if (suppressed && el !== suppressed) suppressed = null
      if (!el || el === suppressed) {
        hide(true)
        return
      }
      const delay = tooltipDelay(performance.now(), shown !== null, hiddenAt)
      if (delay === 0) {
        show(el)
        return
      }
      timer = window.setTimeout(() => show(el), delay)
    }

    const silence = () => {
      suppressed = current
      hide(false)
    }

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') enter(tipTarget(e.target))
    }
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) enter(null) // sorti de la fenêtre
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') silence()
    }
    const onFocusIn = (e: FocusEvent) => {
      const el = tipTarget(e.target)
      if (el && el === e.target && el.matches(':focus-visible')) enter(el)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (shown && e.target === shown && !shown.matches(':hover')) enter(null)
    }
    const onBlur = () => {
      current = null
      hide(false)
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerdown', silence, true)
    document.addEventListener('wheel', silence, { capture: true, passive: true })
    document.addEventListener('scroll', silence, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('blur', onBlur)
    return () => {
      clearTimeout(timer)
      clearInterval(watch)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', silence, true)
      document.removeEventListener('wheel', silence, true)
      document.removeEventListener('scroll', silence, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Placement : mesuré après le rendu, avant l'affichage.
  useLayoutEffect(() => {
    if (!tip || !ref.current) {
      setPos(null)
      return
    }
    const side = (tip.target.closest('[data-tooltip-side]')?.getAttribute('data-tooltip-side') as TooltipSide | null) ?? 'bottom'
    const box = tip.target.getBoundingClientRect()
    const size = { width: ref.current.offsetWidth, height: ref.current.offsetHeight }
    setPos(placeTooltip(box, size, { width: window.innerWidth, height: window.innerHeight }, side))
  }, [tip])

  // Description accessible, seulement si elle apporte quelque chose de plus que le nom.
  useLayoutEffect(() => {
    if (!tip) return
    const el = tip.target
    const name = el.getAttribute('aria-label') ?? el.textContent?.trim()
    if (name === tip.label && !tip.shortcut) return
    const before = el.getAttribute('aria-describedby')
    el.setAttribute('aria-describedby', before ? `${before} ${TIP_ID}` : TIP_ID)
    return () => {
      if (before === null) el.removeAttribute('aria-describedby')
      else el.setAttribute('aria-describedby', before)
    }
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={ref}
      id={TIP_ID}
      role="tooltip"
      className="tooltip"
      data-side={pos?.side ?? 'bottom'}
      style={pos ? { left: pos.left, top: pos.top, ['--arrow-x' as string]: `${pos.arrowX}px` } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      <span className="tooltip-label">{tip.label}</span>
      {tip.shortcut && <span className="tooltip-shortcut">{tip.shortcut}</span>}
    </div>,
    document.body,
  )
}
