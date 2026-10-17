import { app, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { MaquetteDocument } from '../core/types'
import type { TasteCheck, TasteDraw } from '../shared/ipc'
import { parseOptions, type DirectionOption, type DirectionSheet } from '../taste/direction'
import { evaluateInNode } from './exportPng'

const DRAW_TIMEOUT_MS = 20_000
/** Hauteur d'écran simulée pour le contrôle : la règle du hero regarde le premier écran. */
const VIEWPORT_HEIGHT = 900
/** Règles pensées pour un site vivant (vidéo, défilement) : sans objet sur une maquette fixe. */
export const STATIC_ALLOW = ['still-page', 'no-footage', 'long-pin', 'pinned-over-picture', 'empty-screens', 'side-scroll']
/** Règles qui n'ont de sens que pour une page entière (premier écran, nombre d'images…). */
export const PAGE_RULES = ['no-hero', 'first-action', 'focal-point', 'hero-words', 'few-pictures', 'no-real-pictures', 'font-count', 'size-count']

/** Copie de taste-skill : à la racine du projet en dev, dans les ressources une fois installé. */
export function tasteRoot(): string {
  return join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'vendor', 'taste-skill')
}

export interface DrawInput { sector: string; brief: string; tone?: string }

/** Lance draw.mjs avec l'exécutable d'Electron en mode Node : aucun Node installé n'est requis. */
function draw(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [join(tasteRoot(), 'scripts', 'draw.mjs'), ...args],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: DRAW_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error((stderr || error.message).trim().split('\n')[0] || 'tirage impossible'))
        else resolve(stdout)
      },
    )
  })
}

const baseArgs = (input: DrawInput) => ['--sector', input.sector, '--brief', input.brief.trim() || 'site', ...(input.tone ? ['--tone', input.tone] : [])]

export async function drawOptions(input: DrawInput): Promise<DirectionOption[]> {
  const out = await mkdtemp(join(tmpdir(), 'maquette-taste-'))
  try {
    const options = parseOptions(await draw([...baseArgs(input), '--options', '3', '--out', out]))
    if (!options.length) throw new Error('aucune direction ne correspond à ce brief')
    return options
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}

export async function drawDirection(input: DrawInput & { direction: string }): Promise<DirectionSheet & { direction: { name: string; idea: string }; hero?: { name: string; blueprint: string } }> {
  const out = await mkdtemp(join(tmpdir(), 'maquette-taste-'))
  try {
    await draw([...baseArgs(input), '--direction', input.direction, '--out', out])
    return JSON.parse(await readFile(join(out, 'direction.json'), 'utf8'))
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}

interface TasteModules {
  probe: () => unknown
  judge: (m: unknown, opts?: { width?: number; allow?: string[] }) => { level: 'FAIL' | 'WARN'; id: string; message: string; fix: string }[]
}
let modules: Promise<TasteModules> | null = null

/** probe.mjs et rules.mjs tels quels (modules ES chargés à l'exécution, pas embarqués au build). */
function tasteModules(): Promise<TasteModules> {
  modules ??= Promise.all([
    import(pathToFileURL(join(tasteRoot(), 'scripts', 'lib', 'probe.mjs')).href),
    import(pathToFileURL(join(tasteRoot(), 'scripts', 'lib', 'rules.mjs')).href),
  ]).then(([p, r]) => ({ probe: p.probe, judge: r.judge }))
  modules.catch(() => (modules = null))
  return modules
}

/**
 * Contrôle qualité d'un cadre : rendu seul à sa largeur, sonde de taste-skill exécutée dans la page,
 * puis ses règles. `allow` = règles ignorées en plus de celles d'une maquette fixe.
 */
export async function checkFrame(doc: MaquetteDocument, nodeId: string, allow: string[] = []): Promise<TasteCheck | null> {
  const { probe, judge } = await tasteModules()
  // probe() est autonome (aucune fermeture sur son module) : son texte s'exécute tel quel dans la page.
  const shown = await evaluateInNode<unknown>(doc, nodeId, `(${probe.toString()})()`, VIEWPORT_HEIGHT)
  if (!shown) return null
  const isPage = shown.width >= 900 && shown.height >= 600
  const findings = judge(shown.result, { width: shown.width, allow: [...STATIC_ALLOW, ...allow] })
  return { findings, isPage, width: shown.width, height: shown.height }
}

export function registerTasteIpc(): void {
  ipcMain.handle('taste:options', async (_e, input: DrawInput): Promise<TasteDraw<DirectionOption[]>> => {
    try {
      return { ok: true, value: await drawOptions(input) }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })
  ipcMain.handle('taste:direction', async (_e, input: DrawInput & { direction: string }): Promise<TasteDraw<DirectionSheet>> => {
    try {
      return { ok: true, value: await drawDirection(input) }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })
  ipcMain.handle('taste:check', (_e, args: { doc: MaquetteDocument; nodeId: string; allow?: string[] }) =>
    checkFrame(args.doc, args.nodeId, args.allow ?? []),
  )
}
