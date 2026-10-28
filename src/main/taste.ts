import { app, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { MaquetteDocument } from '../core/types'
import type { TasteCheck, TasteDraw } from '../shared/ipc'
import { parseOptions, type DirectionOption, type DirectionSheet } from '../taste/direction'
import { buttonLikeIds, navLikeIds, STATIC_ALLOW } from '../taste/rules'
import { findNode } from '../core/tree'
import { evaluateInNode } from './exportPng'

const DRAW_TIMEOUT_MS = 20_000
/** Hauteur d'écran simulée pour le contrôle : la règle du hero regarde le premier écran. */
const VIEWPORT_HEIGHT = 900
/** Copie de taste-skill : à la racine du projet en dev, dans les ressources une fois installé. */
export function tasteRoot(): string {
  return join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'vendor', 'taste-skill')
}

export interface DrawInput { sector: string; brief: string; tone?: string; sections?: string[] }

/** Lance draw.mjs avec l'exécutable d'Electron en mode Node : aucun Node installé n'est requis. */
function draw(args: string[]): Promise<string> {
  const script = join(tasteRoot(), 'scripts', 'draw.mjs')
  if (!existsSync(script)) return Promise.reject(new Error('the taste-skill copy is missing (reinstall Maquette)'))
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [script, ...args],
      {
        // Historique des tirages propre à Maquette : celui du skill de Claude Code n'est pas touché.
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TASTE_SKILL_HISTORY: process.env.TASTE_SKILL_HISTORY || join(app.getPath('userData'), 'taste-history.json') },
        timeout: DRAW_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout)
        // Jamais la ligne de commande dans le message : seulement ce que draw.mjs a dit.
        if (error.killed) return reject(new Error('the draw took too long'))
        reject(new Error(stderr.trim().split('\n')[0] || 'draw failed'))
      },
    )
  })
}

const baseArgs = (input: DrawInput) => [
  '--sector', input.sector,
  '--brief', input.brief.trim() || 'site',
  ...(input.tone ? ['--tone', input.tone] : []),
  // Rôles des sections dans l'ordre de l'argumentaire (outil MCP `direction`) ; sinon ceux du secteur.
  ...(input.sections?.length ? ['--sections', input.sections.join(',')] : []),
]

export async function drawOptions(input: DrawInput): Promise<DirectionOption[]> {
  const out = await mkdtemp(join(tmpdir(), 'maquette-taste-'))
  try {
    const options = parseOptions(await draw([...baseArgs(input), '--options', '3', '--out', out]))
    if (!options.length) throw new Error('no direction matches this brief')
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
  try {
    return await check(doc, nodeId, allow)
  } catch (e) {
    console.error(`Contrôle taste-skill impossible : ${(e as Error).message}`)
    return null
  }
}

async function check(doc: MaquetteDocument, nodeId: string, allow: string[]): Promise<TasteCheck | null> {
  const { probe, judge } = await tasteModules()
  // Les cadres qui font office de bouton deviennent des boutons pour la sonde (une maquette n'a pas de <button>).
  const node = findNode(doc, nodeId)?.node
  const roles = node ? [...buttonLikeIds(node).map((id) => [id, 'button']), ...navLikeIds(node).map((id) => [id, 'navigation'])] : []
  const mark = `for (const [id, role] of ${JSON.stringify(roles)}) document.querySelector('[data-node-id="' + CSS.escape(id) + '"]')?.setAttribute('role', role);`
  // probe() est autonome (aucune fermeture sur son module) : son texte s'exécute tel quel dans la page.
  const shown = await evaluateInNode<unknown>(doc, nodeId, `(() => { ${mark} return (${probe.toString()})() })()`, VIEWPORT_HEIGHT)
  if (!shown) return null
  const isPage = shown.width >= 900 && shown.height >= 600
  // Les fautes bloquantes d'abord : une liste tronquée (outil MCP) les garde.
  const findings = judge(shown.result, { width: shown.width, allow: [...STATIC_ALLOW, ...allow] })
    .sort((a, b) => Number(b.level === 'FAIL') - Number(a.level === 'FAIL'))
    // Les corrections citent le script de taste-skill ; dans Maquette, c'est l'outil images.
    .map((f) => ({ ...f, fix: f.fix.replace(/scripts\/assets\.mjs(?: --video)?/g, 'the images tool').replace(/download them to assets\/ and /g, '') }))
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
