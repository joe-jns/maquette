import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { isFill } from '../../core/tree'
import type { MaquetteDocument, Node } from '../../core/types'
import type { ExportJob, ExportMeasure } from '../../shared/ipc'
import { ensureDocumentIcons } from '../canvas/iconPaths'
import { NodeView } from '../canvas/NodeView'
import { ensureDocumentFonts } from '../fonts/fontLoader'
import { docStore } from '../state/store'

/**
 * Fenêtre d'export (cachée, rendu hors écran) : n'affiche qu'un élément, à l'origine, sur fond
 * transparent, puis renvoie au principal la taille en pixels de l'image à capturer.
 */

let show: ((view: ReactNode) => void) | null = null

function ExportView() {
  const [view, setView] = useState<ReactNode>(null)
  show = setView
  return <>{view}</>
}

/** Remplace le contenu affiché et attend que React l'ait posé dans la page. */
function display(view: ReactNode): void {
  flushSync(() => show?.(view))
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** L'élément et ses ancêtres (du plus haut au plus bas), ou null s'il n'existe pas. */
function chainTo(doc: MaquetteDocument, id: string): Node[] | null {
  const search = (list: Node[]): Node[] | null => {
    for (const node of list) {
      if (node.id === id) return [node]
      if (node.type === 'frame') {
        const inner = search(node.children)
        if (inner) return [node, ...inner]
      }
    }
    return null
  }
  for (const page of doc.pages) {
    const chain = search(page.children)
    if (chain) return chain
  }
  return null
}

const rectOf = (root: ParentNode, id: string) =>
  root.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null

/** Charge une image (fond CSS) dans le cache du navigateur ; résolu aussi en cas d'échec. */
const preload = (url: string) =>
  new Promise<void>((r) => {
    const img = new Image()
    img.onload = () => r()
    img.onerror = () => r()
    img.src = url
  })

/** Les adresses `url("…")` des fonds des éléments (images en remplissage). */
function backgroundUrls(root: HTMLElement): string[] {
  const urls = new Set<string>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-node-id]')) {
    // Adresses masset:// encodées (assetUrl) : ni guillemet ni barre oblique inverse.
    for (const m of el.style.backgroundImage.matchAll(/url\("([^"]*)"\)/g)) urls.add(m[1]!)
  }
  return [...urls]
}

async function imagesLoaded(root: HTMLElement): Promise<void> {
  await Promise.all([
    ...[...root.querySelectorAll('img')].map((img) =>
      img.complete
        ? undefined
        : new Promise<void>((r) => {
            img.addEventListener('load', () => r(), { once: true })
            img.addEventListener('error', () => r(), { once: true })
          }),
    ),
    ...backgroundUrls(root).map(preload),
  ])
}

/**
 * Taille affichée d'un élément « remplir » : elle dépend de son parent, on la mesure donc dans
 * l'arbre complet de son ancêtre de premier niveau (rendu invisible).
 */
async function filledSize(top: Node, id: string): Promise<{ width: number; height: number } | null> {
  display(
    <div data-export-measure style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}>
      <NodeView node={top} parent={null} index={0} />
    </div>,
  )
  await nextFrame()
  const r = rectOf(document, id)
  return r ? { width: r.width, height: r.height } : null
}

const pixels = (v: number) => Math.max(1, Math.ceil(v - 0.001))

async function renderJob(job: ExportJob): Promise<ExportMeasure> {
  const { doc, nodeId } = job
  docStore.getState().load(doc, null)
  const chain = chainTo(doc, nodeId)
  if (!chain || chain.some((n) => !n.visible)) {
    display(null)
    return null
  }
  // Polices et tracés d'icônes chargés avant le premier rendu mesuré.
  await Promise.all([ensureDocumentFonts(doc), ensureDocumentIcons(doc)])

  let node = chain[chain.length - 1]!
  if (chain.length > 1 && (isFill(node.width) || isFill(node.height))) {
    const size = await filledSize(chain[0]!, nodeId)
    if (!size) return null
    node = {
      ...node,
      ...(isFill(node.width) ? { width: size.width } : {}),
      ...(isFill(node.height) ? { height: size.height } : {}),
    }
  }
  // Seul, à l'origine : nodeCss sans parent, avec x = y = 0.
  const alone = { ...node, x: 0, y: 0 } as Node
  const root = document.getElementById('root')!
  const view = (zoom: number) => (
    <div data-export-root style={{ position: 'absolute', left: 0, top: 0, zoom }}>
      <NodeView node={alone} parent={null} index={0} />
    </div>
  )
  display(view(1))
  await imagesLoaded(root)
  await document.fonts.ready
  await nextFrame()
  const r = rectOf(root, nodeId)
  if (!r || r.width <= 0 || r.height <= 0) return null

  const scale = job.maxWidth ? Math.min(job.scale, job.maxWidth / r.width) : job.scale
  display(view(scale))
  await document.fonts.ready
  await nextFrame()
  await nextFrame()
  const width = pixels(r.width * scale)
  return { width: job.maxWidth ? Math.min(width, job.maxWidth) : width, height: pixels(r.height * scale) }
}

/** Monte la vue d'export et répond aux travaux du principal (un à la fois). */
export function startExportView(container: HTMLElement): void {
  for (const el of [document.documentElement, document.body]) {
    el.style.background = 'transparent'
    el.style.overflow = 'hidden'
  }
  createRoot(container).render(<ExportView />)
  window.maquette.exportView.onJob(async (job) => {
    // Le premier travail peut arriver avant le premier rendu de React.
    while (!show) await nextFrame()
    return renderJob(job)
  })
}
