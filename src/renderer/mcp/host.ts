import type { Op } from '../../core/ops'
import type { DesignHost } from '../../mcp/design'
import type { FullSheet } from '../../mcp/design/direction'
import type { TasteDraw } from '../../shared/ipc'
import { runTool, type ToolHost, type ToolResult } from '../../mcp/tools'
import { nodeElement } from '../canvas/rects'
import { ensureFont } from '../fonts/fontLoader'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { tasteStore } from '../taste/tasteStore'

const FLASH_MS = 1200
/** Au-delà, une police encore en téléchargement est signalée « non chargée » (l'appel MCP ne patiente pas plus). */
const FONT_WAIT_MS = 8000

/** Les éléments touchés par Claude clignotent d'un contour orange : on voit où il a travaillé. */
function flash(ids: string[]): void {
  requestAnimationFrame(() => {
    for (const id of ids) {
      const el = nodeElement(id)
      if (!el) continue
      el.setAttribute('data-claude-flash', '')
      setTimeout(() => el.removeAttribute('data-claude-flash'), FLASH_MS)
    }
  })
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
      flash([...new Set([...Object.values(result.ids), ...touched])])
    }
    return result
  },
  async capture(id, width) {
    const image = await window.maquette.renderNode(docStore.getState().doc, id, { scale: 1, format: 'jpeg', maxWidth: width })
    return image && { data: image.data, mimeType: image.mimeType }
  },
  // Mêmes règles ignorées que dans le panneau : Claude et l'utilisateur voient le même résultat.
  check: (id) => window.maquette.taste.check(docStore.getState().doc, id, tasteStore.getState().allow),
  design,
}

/** Exécute dans la fenêtre les outils appelés par Claude Code. */
export function serveMcp(): () => void {
  window.maquette.mcpReady(false)
  return window.maquette.onMcpCall((tool, args): Promise<ToolResult> =>
    runTool(host, tool, args).catch((e: unknown) => ({ text: `Erreur : ${(e as Error).message}`, isError: true })),
  )
}
