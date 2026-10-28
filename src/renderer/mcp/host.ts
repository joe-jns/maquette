import type { Op } from '../../core/ops'
import type { DesignHost } from '../../mcp/design'
import type { FullSheet } from '../../mcp/design/direction'
import type { TasteDraw } from '../../shared/ipc'
import { runTool, type ToolHost, type ToolResult } from '../../mcp/tools'
import { agentStore, CLAUDE } from '../agents/agentStore'
import { ensureFont } from '../fonts/fontLoader'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { tasteStore } from '../taste/tasteStore'
import { imageHost } from './imageHost'

/** Au-delà, une police encore en téléchargement est signalée « non chargée » (l'appel MCP ne patiente pas plus). */
const FONT_WAIT_MS = 8000

/** Éléments visés par un appel d'outil en lecture (lire_elements, capture, verifier_gout) : le curseur de Claude y va. */
function readTargets(tool: string, args: unknown): string[] {
  const a = (args ?? {}) as { id?: unknown; ids?: unknown }
  if (tool !== 'lire_elements' && tool !== 'capture' && tool !== 'verifier_gout') return []
  const ids = Array.isArray(a.ids) ? a.ids : typeof a.id === 'string' ? [a.id] : []
  return ids.filter((x): x is string => typeof x === 'string')
}

/** Guides, styles et tirages taste-skill pour les outils guide, style et direction. */
const design: DesignHost = {
  read: (path) => window.maquette.design.read(path),
  tasteOptions: (input) => window.maquette.taste.options(input),
  tasteDirection: (input) => window.maquette.taste.direction(input) as Promise<TasteDraw<FullSheet>>,
  async loadFonts(families) {
    const done = new Set<string>()
    const loads = families.map((f) => ensureFont(f).then((ok) => void (ok && done.add(f)), () => undefined))
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, FONT_WAIT_MS))])
    return families.filter((f) => !done.has(f))
  },
}

const host: ToolHost = {
  doc: () => docStore.getState().doc,
  pageId: () => docStore.getState().pageId,
  selection: () => uiStore.getState().selection,
  apply(ops: Op[], label: string) {
    // Un geste en cours (glisser, redimensionner) n'est jamais interrompu : Claude réessaie.
    if (docStore.getState().inGesture) {
      return { ok: false, errors: [{ path: 'operations', message: 'l’utilisateur déplace un élément en ce moment : réessayez dans quelques secondes' }] }
    }
    const result = docStore.getState().dispatch(ops, label)
    if (result.ok) {
      const touched = ops.flatMap((op) => ('id' in op && typeof op.id === 'string' ? [result.ids[op.id] ?? op.id] : []))
      // Éléments créés sans identifiant temporaire : on les retrouve dans les patchs d'ajout.
      const added = result.patches.flatMap((p) => {
        const v = p.op === 'add' ? (p.value as { id?: unknown } | undefined) : undefined
        return typeof v?.id === 'string' ? [v.id] : []
      })
      // Le curseur de Claude glisse vers ce qu'il vient de créer ou de modifier.
      agentStore.getState().activity(CLAUDE.id, [...new Set([...Object.values(result.ids), ...touched, ...added])])
    }
    return result
  },
  async capture(id, width) {
    const image = await window.maquette.renderNode(docStore.getState().doc, id, { scale: 1, format: 'jpeg', maxWidth: width })
    return image && { data: image.data, mimeType: image.mimeType }
  },
  // Mêmes règles ignorées que dans le panneau : Claude et l'utilisateur voient le même résultat.
  check: (id, allow = []) => window.maquette.taste.check(docStore.getState().doc, id, [...tasteStore.getState().allow, ...allow]),
  images: imageHost,
  design,
}

/** Exécute dans la fenêtre les outils appelés par Claude Code. */
export function serveMcp(): () => void {
  window.maquette.mcpReady(false)
  return window.maquette.onMcpCall((tool, args): Promise<ToolResult> => {
    agentStore.getState().activity(CLAUDE.id, readTargets(tool, args))
    return runTool(host, tool, args).catch((e: unknown) => ({ text: `Erreur : ${(e as Error).message}`, isError: true }))
  })
}
