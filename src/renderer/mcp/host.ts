import type { Op } from '../../core/ops'
import type { DesignHost } from '../../mcp/design'
import type { FullSheet } from '../../mcp/design/direction'
import type { TasteDraw } from '../../shared/ipc'
import type { McpOrigin } from '../../mcp/pipe'
import { runTool, type ToolHost, type ToolResult } from '../../mcp/tools'
import { agentStore, CLAUDE } from '../agents/agentStore'
import { chatStore } from '../chat/chatStore'
import { beforeClaudeName, replyGroup, replyLabel } from '../chat/replies'
import { serializeDocument } from '../../core/format'
import { revealCreated } from '../agents/reveal'
import { ensureFont } from '../fonts/fontLoader'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { tasteStore } from '../taste/tasteStore'
import { fileHost } from './fileHost'
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

/** Groupe des modifications d'un Claude Code extérieur : il dure tant qu'il reste au sommet de l'historique. */
let externalGroup: string | null = null
let externalSeq = 0

/**
 * Groupe d'historique d'une modification de Claude. Chat intégré pendant une réponse : le groupe de
 * cette réponse. Claude Code extérieur (pas de tours) : ses modifications successives forment un groupe,
 * fermé dès qu'autre chose (l'utilisateur, une réponse du chat, un undo) passe au sommet.
 */
function groupFor(origin: McpOrigin): { group: string; label?: string; turn?: { id: string; text: string } } {
  const turn = origin === 'chat' ? chatStore.getState().turn : null
  if (turn) return { group: replyGroup(turn.id), label: replyLabel(turn.text), turn }
  if (!externalGroup || docStore.getState().topGroup() !== externalGroup) externalGroup = `mcp:${++externalSeq}`
  return { group: externalGroup }
}

function apply(ops: Op[], toolLabel: string, origin: McpOrigin) {
  // Un geste en cours (glisser, redimensionner) n'est jamais interrompu : Claude réessaie.
  if (docStore.getState().inGesture) {
    return { ok: false as const, errors: [{ path: 'operations', message: 'l’utilisateur déplace un élément en ce moment : réessayez dans quelques secondes' }] }
  }
  const { group, label = toolLabel, turn } = groupFor(origin)
  const before = docStore.getState()
  const result = before.dispatch(ops, label, group)
  if (result.ok) {
    if (turn && !chatStore.getState().edited.includes(turn.id)) {
      // Première modification de la réponse : version automatique du document d'avant (fichier enregistré seulement).
      chatStore.getState().markEdited(turn.id)
      if (before.filePath) void window.maquette.versions?.save(serializeDocument(before.doc), beforeClaudeName(turn.text), true).catch(() => null)
    }
    const touched = ops.flatMap((op) => ('id' in op && typeof op.id === 'string' ? [result.ids[op.id] ?? op.id] : []))
    // Éléments créés (avec ou sans identifiant temporaire) : les patchs d'ajout, au plus haut niveau.
    const added = result.patches.flatMap((p) => {
      const v = p.op === 'add' ? (p.value as { id?: unknown } | undefined) : undefined
      return typeof v?.id === 'string' ? [v.id] : []
    })
    // Ce qu'il crée apparaît pièce par pièce, son curseur passant de l'une à l'autre ; sinon le curseur va à ce qu'il modifie.
    if (added.length) revealCreated(added, CLAUDE.id)
    else agentStore.getState().activity(CLAUDE.id, [...new Set([...Object.values(result.ids), ...touched])])
  }
  return result
}

/** Outils d'un appel : les modifications partent dans le groupe de son origine. */
const hostFor = (origin: McpOrigin): ToolHost => ({
  doc: () => docStore.getState().doc,
  pageId: () => docStore.getState().pageId,
  selection: () => uiStore.getState().selection,
  apply: (ops, label) => apply(ops, label, origin),
  async capture(id, width) {
    const image = await window.maquette.renderNode(docStore.getState().doc, id, { scale: 1, format: 'jpeg', maxWidth: width })
    return image && { data: image.data, mimeType: image.mimeType }
  },
  // Mêmes règles ignorées que dans le panneau : Claude et l'utilisateur voient le même résultat.
  check: (id, allow = []) => window.maquette.taste.check(docStore.getState().doc, id, [...tasteStore.getState().allow, ...allow]),
  images: imageHost,
  design,
  files: fileHost,
})

/** Exécute dans la fenêtre les outils appelés par Claude Code. */
export function serveMcp(): () => void {
  window.maquette.mcpReady(false)
  return window.maquette.onMcpCall((tool, args, origin): Promise<ToolResult> => {
    agentStore.getState().activity(CLAUDE.id, readTargets(tool, args))
    return runTool(hostFor(origin), tool, args).catch((e: unknown) => ({ text: `Erreur : ${(e as Error).message}`, isError: true }))
  })
}
