import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { join } from 'node:path'
import type { MaquetteDocument, Node } from '../core/types'
import type { ExportJob, ExportMeasure, RenderedImage, RenderOptions } from '../shared/ipc'

/** Au-delà, le rendu est abandonné (image ou police qui ne répond pas). */
const TIMEOUT_MS = 15_000
const MAX_SCALE = 4

export interface Rendered { buffer: Buffer; width: number; height: number }

let win: BrowserWindow | null = null
let ready: Promise<void> | null = null
let queue: Promise<unknown> = Promise.resolve()
let nextId = 1
const pending = new Map<number, (m: ExportMeasure) => void>()
/** Taille de la dernière image dessinée par la fenêtre d'export. */
let lastPaint: { width: number; height: number } | null = null

/** La fenêtre cachée du rendu hors écran (créée au premier export, puis réutilisée). */
function exportWindow(): { win: BrowserWindow; ready: Promise<void> } {
  if (win && !win.isDestroyed() && ready) return { win, ready }
  const w = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: {
      offscreen: true,
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  w.webContents.on('paint', (_e, _dirty, image) => {
    lastPaint = image.getSize()
  })
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.on('closed', () => {
    if (win === w) {
      win = null
      ready = null
    }
  })
  const loaded = new Promise<void>((resolve, reject) => {
    w.webContents.once('did-finish-load', () => resolve())
    w.webContents.once('did-fail-load', (_e, _code, desc) => reject(new Error(desc)))
  })
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL + '?export=1')
  else void w.loadFile(join(__dirname, '../renderer/index.html'), { query: { export: '1' } })
  win = w
  ready = loaded
  return { win: w, ready: loaded }
}

export const isExportWindow = (w: BrowserWindow): boolean => w === win

/** Ferme la fenêtre d'export (fin de l'app, fenêtre principale fermée, rendu bloqué). */
export function closeExportWindow(): void {
  const w = win
  win = null
  ready = null
  for (const resolve of pending.values()) resolve(null)
  pending.clear()
  if (w && !w.isDestroyed()) w.destroy()
}

/** L'élément existe et ni lui ni un de ses ancêtres n'est masqué. */
function findVisible(doc: MaquetteDocument, id: string): Node | null {
  const search = (list: Node[]): Node | null | undefined => {
    for (const node of list) {
      if (node.id === id) return node.visible ? node : null
      if (node.type === 'frame') {
        const inner = search(node.children)
        if (inner !== undefined) return node.visible ? inner : null
      }
    }
    return undefined
  }
  for (const page of doc.pages ?? []) {
    const found = search(page.children ?? [])
    if (found !== undefined) return found
  }
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Attend que la fenêtre ait dessiné une image après le changement de taille : tant que le
 * compositeur n'a pas suivi, capturePage échoue (UnknownVizError) ou rend l'ancienne image.
 * Abandonne l'attente après 2 s.
 */
function nextPaint(wc: WebContents, previous: { width: number; height: number } | null, resized: boolean): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      wc.removeListener('paint', onPaint)
      resolve()
    }
    const onPaint = (_e: unknown, _dirty: unknown, image: Electron.NativeImage) => {
      const s = image.getSize()
      if (!resized || !previous || s.width !== previous.width || s.height !== previous.height) done()
    }
    const timer = setTimeout(done, 2000)
    wc.on('paint', onPaint)
    wc.invalidate()
  })
}

async function capture(wc: WebContents, width: number, height: number): Promise<Electron.NativeImage> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await wc.capturePage({ x: 0, y: 0, width, height })
    } catch (e) {
      if (attempt >= 4 || wc.isDestroyed()) throw e
      wc.invalidate()
      await sleep(50 * (attempt + 1))
    }
  }
}

async function renderOnce(doc: MaquetteDocument, nodeId: string, opts: RenderOptions): Promise<Rendered | null> {
  const { win: w, ready: loaded } = exportWindow()
  await loaded
  const wc = w.webContents
  const id = nextId++
  const job: ExportJob = { doc, nodeId, scale: opts.scale, ...(opts.maxWidth ? { maxWidth: opts.maxWidth } : {}) }
  const measure = await new Promise<ExportMeasure>((resolve) => {
    pending.set(id, resolve)
    wc.send('export:job', id, job)
  })
  pending.delete(id)
  if (!measure || w.isDestroyed()) return null
  const { width, height } = measure
  const before = w.getContentSize()
  const previous = lastPaint
  w.setContentSize(width, height)
  const after = w.getContentSize()
  await nextPaint(wc, previous, before[0] !== after[0] || before[1] !== after[1])
  if (w.isDestroyed()) return null
  let image = await capture(wc, width, height)
  if (image.isEmpty()) return null
  const size = image.getSize()
  // Écran à haute densité : la capture est en pixels physiques, on revient à la taille demandée.
  if (size.width !== width || size.height !== height) image = image.resize({ width, height, quality: 'best' })
  const buffer = opts.format === 'jpeg' ? image.toJPEG(85) : image.toPNG()
  return { buffer, width, height }
}

/**
 * Rend un élément seul en image (fenêtre cachée, rendu hors écran) : null si l'élément n'existe pas,
 * est masqué, ou si le rendu dépasse 15 s. Un seul rendu à la fois (file d'attente).
 */
export function renderNode(doc: MaquetteDocument, nodeId: string, opts: RenderOptions): Promise<Rendered | null> {
  const run = queue.then(async (): Promise<Rendered | null> => {
    if (!findVisible(doc, nodeId)) return null
    const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? Math.min(opts.scale, MAX_SCALE) : 1
    const maxWidth = opts.maxWidth && opts.maxWidth > 0 ? Math.floor(opts.maxWidth) : undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        // Rendu bloqué : la fenêtre repart de zéro au prochain export.
        closeExportWindow()
        resolve(null)
      }, TIMEOUT_MS)
    })
    try {
      return await Promise.race([renderOnce(doc, nodeId, { scale, format: opts.format, ...(maxWidth ? { maxWidth } : {}) }), timeout])
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  })
  queue = run.catch(() => undefined)
  return run
}

export function registerExportIpc(): void {
  ipcMain.on('export:measured', (event, id: number, measure: ExportMeasure) => {
    if (!win || event.sender !== win.webContents) return
    pending.get(id)?.(measure)
  })

  ipcMain.handle(
    'export:node',
    async (event, args: { doc: MaquetteDocument; nodeId: string } & RenderOptions): Promise<RenderedImage | null> => {
      if (win && event.sender === win.webContents) return null
      const format = args.format === 'jpeg' ? 'jpeg' : 'png'
      const opts: RenderOptions = { scale: args.scale, format, ...(args.maxWidth ? { maxWidth: args.maxWidth } : {}) }
      const r = await renderNode(args.doc, args.nodeId, opts)
      if (!r) return null
      return { data: r.buffer.toString('base64'), mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png', width: r.width, height: r.height }
    },
  )

}
