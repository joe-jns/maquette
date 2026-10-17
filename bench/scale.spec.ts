import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseDocument } from '../src/core/format'
import { launch } from '../e2e/launch'
import { makeScene, stats, type SceneKind } from './make-scene'

/**
 * Montée en charge de l'éditeur : pour chaque scène générée (bench/make-scene.ts), ouverture,
 * déplacement et zoom continus, latences (sélection, glisser, annulation, frappe), mémoire, MCP.
 *
 * Variables d'environnement :
 *   BENCH_N=500,1000      tailles (défaut : 500 → 20 000)
 *   BENCH_KINDS=site,plat types de scène (défaut : les deux)
 *   BENCH_CSS='.world{will-change:transform}'  expérience : CSS injecté après l'ouverture (résultats suffixés « +css »)
 *   BENCH_PROFILE=site:2000  au lieu des mesures, profil CPU + compteurs d'appels sur cette scène
 *                            (lancer d'abord le build non minifié : bench/electron.vite.profile.config.ts)
 */

const SIZES = (process.env.BENCH_N ?? '500,1000,2000,5000,10000,20000').split(',').map(Number)
const KINDS = (process.env.BENCH_KINDS ?? 'site,plat').split(',') as SceneKind[]
const OPEN_LIMIT_MS = 60_000
const HERE = __dirname
const SCENES = join(HERE, '.scenes')
const RESULTS = join(HERE, '.results')
mkdirSync(SCENES, { recursive: true })
mkdirSync(RESULTS, { recursive: true })

/** Écrit la scène (validée par le vrai parseur du format) et renvoie son chemin. */
function sceneFile(n: number, kind: SceneKind): { file: string; count: number; depth: number } {
  const scene = makeScene(n, kind)
  const text = JSON.stringify(scene.doc)
  const parsed = parseDocument(text)
  if (!parsed.ok) throw new Error(`scène ${kind} ${n} invalide : ${JSON.stringify(parsed.errors.slice(0, 5))}`)
  const file = join(SCENES, `${kind}-${n}.maquette`)
  writeFileSync(file, text, 'utf8')
  return { file, count: scene.count, depth: stats(scene.doc).depth }
}

type FrameStats = { frames: number; fps: number; mean: number; p95: number; max: number; over50: number }

function frameStats(durations: number[], elapsedMs: number): FrameStats {
  const d = [...durations].sort((a, b) => a - b)
  const r = (v: number) => Math.round(v * 10) / 10
  return {
    frames: d.length,
    fps: r((d.length / elapsedMs) * 1000),
    mean: r(d.reduce((a, b) => a + b, 0) / Math.max(1, d.length)),
    p95: r(d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] ?? 0),
    max: r(d[d.length - 1] ?? 0),
    over50: d.filter((v) => v > 50).length,
  }
}

/** Outils de mesure installés dans la page (rAF, latence entrée → image). */
async function installProbes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const store = () => w.__maquetteStore.getState()
    const ui = () => w.__maquetteUi.getState()
    const find = (id: string) => {
      const visit = (list: any[]): any => {
        for (const n of list) {
          if (n.id === id) return n
          if (n.children) { const f = visit(n.children); if (f) return f }
        }
        return null
      }
      for (const p of store().doc.pages) { const f = visit(p.children); if (f) return f }
      return null
    }
    const preds: Record<string, (...a: any[]) => boolean> = {
      selected: (id: string) => ui().selection[0] === id && !!document.querySelector('[data-testid="right-panel"] input[aria-label="X"]'),
      movedFrom: (id: string, x: number) => !store().inGesture && find(id)?.x !== x,
      xIs: (id: string, x: number) => find(id)?.x === x && !store().inGesture,
      editing: (id: string) => !!document.querySelector(`[data-editing][data-node-id="${id}"]`),
      editorIs: (id: string, s: string) => document.querySelector(`[data-editing][data-node-id="${id}"]`)?.textContent === s,
      committed: (id: string, s: string) => find(id)?.content === s && ui().editingTextId === null
        && document.querySelector(`.world [data-node-id="${id}"]`)?.textContent === s,
    }
    let frames: number[] = []
    let recording = false
    w.__bench = {
      startFrames() {
        frames = []
        recording = true
        let last = 0
        // performance.now() et non l'horodatage du rAF : celui-ci est l'heure de début de l'image
        // (vsync), antérieure au travail qui l'a retardée — il sous-estimerait les longues images.
        const loop = () => {
          if (!recording) return
          const t = performance.now()
          if (last) frames.push(t - last)
          last = t
          requestAnimationFrame(loop)
        }
        requestAnimationFrame(loop)
      },
      stopFrames() { recording = false; return frames },
      /** Arme une mesure : horodatage de la prochaine entrée `events`, puis première image où le prédicat est vrai. */
      arm(events: string[], pred: string, args: unknown[]) {
        const st: { t0: number | null; t1: number | null } = { t0: null, t1: null }
        w.__lat = st
        const onInput = (e: Event) => { if (st.t0 === null) st.t0 = e.timeStamp }
        for (const ev of events) window.addEventListener(ev, onInput, true)
        const check = () => {
          if (st.t0 !== null && preds[pred]!(...args)) {
            st.t1 = performance.now()
            for (const ev of events) window.removeEventListener(ev, onInput, true)
            return
          }
          requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      },
      /** Caméra : l'élément au centre du canevas, au zoom donné. */
      centerOn(id: string, zoom: number) {
        const el = document.querySelector(`.world [data-node-id="${id}"]`)!
        const world = document.querySelector('[data-testid="world"]')!.getBoundingClientRect()
        const cam = ui().camera
        const r = el.getBoundingClientRect()
        const cx = (r.left + r.width / 2 - world.left) / cam.zoom
        const cy = (r.top + r.height / 2 - world.top) / cam.zoom
        const v = ui().viewport
        ui().setCamera({ x: v.width / 2 - cx * zoom, y: v.height / 2 - cy * zoom, zoom })
      },
      nodeX: (id: string) => find(id)?.x,
    }
  })
}

async function latency(page: Page, timeout = 120_000): Promise<number> {
  const handle = await page.waitForFunction(() => {
    const st = (window as unknown as { __lat: { t0: number | null; t1: number | null } }).__lat
    return st.t1 !== null ? Math.round((st.t1 - st.t0!) * 10) / 10 : null
  }, null, { timeout, polling: 50 })
  return (await handle.jsonValue()) as number
}

const arm = (page: Page, events: string[], pred: string, args: unknown[]) =>
  page.evaluate(({ events, pred, args }) => (window as any).__bench.arm(events, pred, args), { events, pred, args })

/** Laisse la page au repos (deux images) avant une mesure. */
const idle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100)))))

async function canvasCenter(page: Page) {
  const b = (await page.getByTestId('canvas').boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function centerOf(page: Page, id: string) {
  const b = (await page.locator(`.world [data-node-id="${id}"]`).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Geste continu de 2 s (molette) en enregistrant la durée de chaque image. */
async function continuous(page: Page, step: (i: number) => Promise<void>): Promise<FrameStats & { events: number }> {
  await idle(page)
  await page.evaluate(() => (window as any).__bench.startFrames())
  const t0 = Date.now()
  let i = 0
  while (Date.now() - t0 < 2000) await step(i++)
  // La dernière image du geste.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
  const elapsed = Date.now() - t0
  const frames = (await page.evaluate(() => (window as any).__bench.stopFrames())) as number[]
  return { ...frameStats(frames, elapsed), events: i }
}

async function memory(app: ElectronApplication, page: Page) {
  const renderer = await page.evaluate(() => ({
    heapMB: Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576),
    domElements: document.getElementsByTagName('*').length,
  }))
  const metrics = await app.evaluate(({ app }) => app.getAppMetrics().map((m) => ({ type: m.type, ws: m.memory.workingSetSize })))
  const total = Math.round(metrics.reduce((a, m) => a + m.ws, 0) / 1024)
  const tab = Math.round((metrics.filter((m) => m.type === 'Tab').reduce((a, m) => a + m.ws, 0)) / 1024)
  return { ...renderer, rendererMB: tab, totalMB: total }
}

/** Client MCP réel (relais stdio → app), comme le ferait Claude Code. */
async function mcpClient(app: ElectronApplication, env: Record<string, string>): Promise<Client> {
  const exe = await app.evaluate(() => process.execPath)
  const transport = new StdioClientTransport({
    command: exe,
    args: [resolve('out/main/relay.js')],
    env: { ...(process.env as Record<string, string>), ...env, ELECTRON_RUN_AS_NODE: '1' },
  })
  const c = new Client({ name: 'bench', version: '1.0.0' })
  await c.connect(transport)
  return c
}

const stopped = new Set<SceneKind>()
const resultsFile = join(RESULTS, 'results.json')
const save = (key: string, value: unknown) => {
  const all = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {}
  all[key] = value
  writeFileSync(resultsFile, JSON.stringify(all, null, 2))
}

/** Ouvre la scène et attend que tous les éléments soient dans le DOM et le cadrage appliqué. */
async function open(n: number, kind: SceneKind, extraEnv: Record<string, string> = {}) {
  const { file, count, depth } = sceneFile(n, kind)
  const t0 = Date.now()
  // Fenêtre recouverte ou en arrière-plan : Chromium ralentit rAF à 1 image/s et fausse tout. On l'interdit.
  const noThrottle = ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion']
  const { app, page } = await launch([...noThrottle, file], { MAQUETTE_FONTS_OFFLINE: '1', ...extraEnv })
  await page.waitForFunction((c) => document.querySelectorAll('.world [data-node-id]').length >= c, count, { timeout: 5 * 60_000, polling: 100 })
  const openMs = Date.now() - t0
  const rendererMs = Math.round(await page.evaluate(() => performance.now()))
  await installProbes(page)
  if (process.env.BENCH_CSS) await page.addStyleTag({ content: process.env.BENCH_CSS })
  await idle(page)
  return { app, page, count, depth, openMs, rendererMs }
}

test.describe.configure({ mode: 'serial' })

if (!process.env.BENCH_PROFILE) {
  for (const kind of KINDS) {
    for (const n of SIZES) {
      test(`${kind} ${n}`, async () => {
        test.skip(stopped.has(kind), `ouverture > ${OPEN_LIMIT_MS / 1000} s à une taille inférieure`)
        const pipe = `\\\\.\\pipe\\maquette-bench-${process.pid}-${kind}-${n}`
        const env = { MAQUETTE_PIPE: pipe, MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-bench-')) }
        const { app, page, count, depth, openMs, rendererMs } = await open(n, kind, env)
        const r: Record<string, unknown> = { kind, n, count, depth, openMs, rendererMs }
        try {
          r.memOpen = await memory(app, page)
          if (openMs > OPEN_LIMIT_MS) stopped.add(kind)

          // Déplacement et zoom continus, toute la scène à l'écran (cadrage « tout voir » du chargement).
          const c = await canvasCenter(page)
          await page.mouse.move(c.x, c.y)
          r.zoomFit = await page.evaluate(() => (window as any).__maquetteUi.getState().camera.zoom)
          r.panFit = await continuous(page, (i) => page.mouse.wheel(0, Math.floor(i / 15) % 2 ? -40 : 40))
          // Survol : la souris balaie le canevas (contour de survol + ligne survolée des calques).
          r.hover = await continuous(page, (i) => page.mouse.move(c.x - 300 + ((i * 37) % 600), c.y - 200 + ((i * 53) % 400)))
          await page.mouse.move(c.x, c.y)
          await page.keyboard.down('Control')
          r.zoom = await continuous(page, (i) => page.mouse.wheel(0, Math.floor(i / 10) % 2 ? 60 : -60))
          await page.keyboard.up('Control')

          // Au zoom 100 %, sur le premier héros.
          await page.evaluate(() => (window as any).__bench.centerOn('bShape', 1))
          await idle(page)
          r.pan100 = await continuous(page, (i) => page.mouse.wheel(0, Math.floor(i / 15) % 2 ? -40 : 40))
          await page.evaluate(() => { (window as any).__maquetteUi.getState().select([]); (window as any).__bench.centerOn('bShape', 1) })
          await idle(page)

          // Sélection (Ctrl+clic = élément le plus profond) → panneau Design à jour.
          const s = await centerOf(page, 'bShape')
          await arm(page, ['pointerdown'], 'selected', ['bShape'])
          await page.keyboard.down('Control')
          await page.mouse.click(s.x, s.y)
          await page.keyboard.up('Control')
          r.selectMs = await latency(page)
          await idle(page)

          // Glisser de 200 px (30 étapes) : images pendant le geste, puis relâcher → document validé.
          const x0 = await page.evaluate(() => (window as any).__bench.nodeX('bShape'))
          await page.evaluate(() => (window as any).__bench.startFrames())
          await page.keyboard.down('Control')
          await page.mouse.move(s.x, s.y)
          await page.mouse.down()
          const td = Date.now()
          await page.mouse.move(s.x + 200, s.y, { steps: 30 })
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
          const dragElapsed = Date.now() - td
          const dragFrames = (await page.evaluate(() => (window as any).__bench.stopFrames())) as number[]
          await arm(page, ['pointerup'], 'movedFrom', ['bShape', x0])
          await page.mouse.up()
          await page.keyboard.up('Control')
          r.drag = { ...frameStats(dragFrames, dragElapsed), totalMs: dragElapsed }
          r.dropMs = await latency(page)
          await idle(page)

          // Ctrl+Z → l'élément revient.
          await arm(page, ['keydown'], 'xIs', ['bShape', x0])
          await page.keyboard.press('Control+z')
          r.undoMs = await latency(page)
          await idle(page)

          // Texte : Entrée → édition, une lettre, Échap → validé dans le document.
          await page.evaluate(() => { const ui = (window as any).__maquetteUi.getState(); ui.select(['bText']); (window as any).__bench.centerOn('bText', 1) })
          await idle(page)
          await arm(page, ['keydown'], 'editing', ['bText'])
          await page.keyboard.press('Enter')
          r.editEnterMs = await latency(page)
          await idle(page)
          await arm(page, ['keydown'], 'editorIs', ['bText', 'Z'])
          await page.keyboard.press('Z')
          r.typeMs = await latency(page)
          await idle(page)
          await arm(page, ['keydown'], 'committed', ['bText', 'Z'])
          await page.keyboard.press('Escape')
          r.textCommitMs = await latency(page)
          await idle(page)

          // MCP : lire_document et appliquer, aller-retour complet depuis le client.
          try {
            const client = await mcpClient(app, env)
            const tr = Date.now()
            const lu = await client.callTool({ name: 'lire_document', arguments: {} })
            r.mcpReadMs = Date.now() - tr
            r.mcpReadKB = Math.round((lu.content as { text?: string }[]).reduce((a, c) => a + (c.text?.length ?? 0), 0) / 1024)
            const ta = Date.now()
            const ap = await client.callTool({ name: 'appliquer', arguments: { libelle: 'bench', operations: [{ op: 'update', id: 'bShape', set: { fills: ['#16A34A'] } }] } })
            r.mcpApplyMs = Date.now() - ta
            if (ap.isError) r.mcpApplyError = JSON.stringify(ap.content).slice(0, 200)
            await client.close()
          } catch (e) {
            r.mcpError = (e as Error).message
          }

          r.memEnd = await memory(app, page)
        } finally {
          r.hidden = await page.evaluate(() => document.visibilityState !== 'visible').catch(() => null)
          console.log(JSON.stringify(r))
          save(`${kind}-${n}${process.env.BENCH_CSS ? '+css' : ''}`, r)
          await app.close()
        }
      })
    }
  }
}

/**
 * Profil d'une scène : profil CPU échantillonné (CDP Profiler) et compteurs d'appels exacts
 * (couverture précise) pour chaque geste, écrits dans bench/.results/.
 */
if (process.env.BENCH_PROFILE) {
  const [kind, size] = process.env.BENCH_PROFILE.split(':') as [SceneKind, string]
  test(`profil ${kind} ${size}`, async () => {
    const { app, page } = await open(Number(size), kind)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    const out: Record<string, unknown> = {}

    /** Mesure un geste : profil échantillonné + nombre d'appels de chaque fonction. */
    const phase = async (name: string, run: () => Promise<void>) => {
      await idle(page)
      await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false })
      await cdp.send('Profiler.takePreciseCoverage') // remise à zéro
      await cdp.send('Profiler.start')
      await run()
      await idle(page)
      const { profile } = await cdp.send('Profiler.stop')
      const cov = await cdp.send('Profiler.takePreciseCoverage')
      await cdp.send('Profiler.stopPreciseCoverage')
      writeFileSync(join(RESULTS, `profil-${kind}-${size}-${name}.cpuprofile`), JSON.stringify(profile))
      const calls: { fn: string; url: string; offset: number; count: number }[] = []
      for (const s of cov.result) {
        if (!s.url.includes('renderer')) continue
        for (const f of s.functions) {
          const top = f.ranges[0]!
          if (top.count > 0 && f.functionName) calls.push({ fn: f.functionName, url: s.url, offset: top.startOffset, count: top.count })
        }
      }
      calls.sort((a, b) => b.count - a.count)
      out[name] = { calls: calls.slice(0, 60) }
    }

    const c = await canvasCenter(page)
    await page.mouse.move(c.x, c.y)
    await phase('pan', async () => { for (let i = 0; i < 40; i++) await page.mouse.wheel(0, i < 20 ? 40 : -40) })
    await phase('zoom', async () => {
      await page.keyboard.down('Control')
      for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -60 : 60)
      await page.keyboard.up('Control')
    })
    await page.evaluate(() => (window as any).__bench.centerOn('bShape', 1))
    await idle(page)
    const s = await centerOf(page, 'bShape')
    await phase('select', async () => {
      await page.keyboard.down('Control')
      await page.mouse.click(s.x, s.y)
      await page.keyboard.up('Control')
    })
    await phase('drag', async () => {
      await page.keyboard.down('Control')
      await page.mouse.move(s.x, s.y)
      await page.mouse.down()
      await page.mouse.move(s.x + 200, s.y, { steps: 30 })
      await page.mouse.up()
      await page.keyboard.up('Control')
    })
    await phase('undo', async () => { await page.keyboard.press('Control+z') })
    writeFileSync(join(RESULTS, `profil-${kind}-${size}-calls.json`), JSON.stringify(out, null, 2))
    expect(Object.keys(out).length).toBe(5)
    await app.close()
  })
}
