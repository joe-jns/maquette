import type { Op } from '../../core/ops'
import { runTool, type ToolHost, type ToolResult } from '../../mcp/tools'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'

const FLASH_MS = 1200

/** Les éléments touchés par Claude clignotent d'un contour orange : on voit où il a travaillé. */
function flash(ids: string[]): void {
  requestAnimationFrame(() => {
    for (const id of ids) {
      const el = document.querySelector<HTMLElement>(`.canvas [data-node-id="${CSS.escape(id)}"]`)
      if (!el) continue
      el.setAttribute('data-claude-flash', '')
      setTimeout(() => el.removeAttribute('data-claude-flash'), FLASH_MS)
    }
  })
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
}

/** Exécute dans la fenêtre les outils appelés par Claude Code. */
export function serveMcp(): () => void {
  window.maquette.mcpReady(false)
  return window.maquette.onMcpCall((tool, args): Promise<ToolResult> =>
    runTool(host, tool, args).catch((e: unknown) => ({ text: `Erreur : ${(e as Error).message}`, isError: true })),
  )
}
