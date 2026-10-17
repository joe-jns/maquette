# Maquette — Plan 4 : Serveur MCP (Claude Code) et export PNG

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code pilote Maquette par MCP (lire, chercher, appliquer des lots d'opérations, capturer, sélection), avec des réponses compactes ; export PNG d'un élément en 1×/2×/3×.

**Architecture:** Les outils sont du code **pur** (`src/mcp/tools.ts`) qui travaille sur une interface `ToolHost` ; la fenêtre en fournit l'implémentation (le document vit dans la fenêtre). Claude Code lance un **relais** stdio (`out/main/relay.js`, exécuté par Electron en mode Node) qui rejoint l'app par un **pipe nommé** protégé par un **jeton** (`src/main/mcpBridge.ts` côté app, `src/mcp/pipeClient.ts` côté relais). Le principal relaie chaque appel à la fenêtre par IPC. Les captures et l'export PNG passent par un **rendu hors écran** (fenêtre cachée qui n'affiche que l'élément).

**Spec:** §9 (MCP, économie de tokens), §12 (export PNG), §4.

## Global Constraints

- Contraintes des plans précédents (versions exactes, textes en français, commits sans `Co-Authored-By`, un commit par changement, pas de push).
- Nouvelle dépendance unique : `@modelcontextprotocol/sdk` 1.32.1 (déjà installée).
- **Économie de tokens (spec §9)** : réponses JSON minifiées, valeurs par défaut omises, jamais le document entier, captures seulement sur demande (800 px de large par défaut, JPEG), descriptions d'outils courtes.
- **Sécurité** : pipe nommé local seulement (pas de port réseau), jeton de 32 octets aléatoires dans `<userData>/mcp-token`, comparaison à temps constant ; aucun outil n'exécute de code arbitraire.
- L'app n'écrit jamais d'elle-même dans la configuration de Claude Code : l'inscription se fait par l'action explicite « Connecter à Claude Code », qui lance `claude mcp add`.

## Review Focus

1. **App fermée** → chaque outil répond une erreur claire « Maquette n'est pas ouverte », jamais un plantage du relais. Test : A2 + B3.
2. **Mauvais jeton** → connexion refusée, aucun outil exécuté. Test : A2.
3. **Lot d'opérations invalide envoyé par Claude** → rien n'est appliqué, erreurs avec chemins renvoyées (au plus 5), document intact. Test : A1.
4. **Capture d'un élément avec images et polices** → l'image attend leur chargement (pas de capture vide). Test : A3.
5. **Taille des réponses** → `lire_document` d'une scène type < 1 200 caractères, `appliquer` < 300. Test : A1.

---

## Phase A (agents en parallèle)

### Task A1: Outils MCP purs

**Files:** Create `src/mcp/tools.ts` ; Test `tests/mcp/tools.test.ts`.

**Produces:**
```ts
export interface ToolHost {
  doc(): MaquetteDocument
  pageId(): string
  selection(): string[]
  apply(ops: Op[], label: string): ApplyResult
  capture(id: string, width: number): Promise<{ data: string; mimeType: string } | null>
}
export interface ToolResult { text: string; image?: { data: string; mimeType: string }; isError?: boolean }
export interface ToolDef { name: string; description: string; input: z.ZodRawShape }
export const TOOLS: ToolDef[]
export async function runTool(host: ToolHost, name: string, args: unknown): Promise<ToolResult>
```
Outils (descriptions en français, une à trois phrases ; la doc détaillée ira dans le skill) :
- `lire_document` `{}` → `{"page_active":id,"total":N,"pages":[{"id","nom","elements":[{"id","type","nom","l","h","x","y","enfants"}]}],"couleurs":{nom:"#hex"},"textes":{nom:"Famille poids taille/interligne"}}` — premier niveau seulement ; `l`/`h` = nombre ou `"hug"`/`"fill"` ; `x`/`y`/`enfants` omis quand absents ou nuls.
- `lire_elements` `{ ids: string[] (1..20), profondeur?: 0..5 = 1 }` → `{"elements":[...]}` : chaque élément avec `id`, `type`, `name` toujours, et seulement les propriétés **différentes des valeurs par défaut** (`createNode` du même type) ; au-delà de la profondeur, `children` est remplacé par `"enfants":N` ; id inconnu → `{"id":…, "erreur":"introuvable"}`.
- `chercher` `{ nom?, type?, texte?, limite?: 1..100 = 30 }` → `{"resultats":[[id,type,nom,parentId|null],…],"plus":K}` (recherche sans casse, sous-chaîne ; `texte` porte sur le contenu des textes ; toutes les pages).
- `appliquer` `{ operations: object[] (1..500), libelle?: string }` → succès : `{"ok":true,"ids":{"$a":"x1"},"corrections":[…]}` (clés vides omises) ; échec : `isError`, `{"ok":false,"erreurs":[{"chemin","message"}]}` (au plus 5). Libellé d'historique : `Claude : <libelle>` (défaut « Claude : modification »).
- `capture` `{ id, largeur?: 100..1600 = 800 }` → image + texte `capture de <nom> (L×H)` ; élément inconnu ou capture impossible → `isError`.
- `selection` `{}` → `{"ids":[…],"elements":[{"id","type","nom"}]}`.
- Outil inconnu ou arguments invalides → `isError` avec le message de validation (chemins).

Tests (`tests/mcp/tools.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { applyOps } from '../../src/core/ops'
import type { FrameNode, MaquetteDocument } from '../../src/core/types'
import { TOOLS, runTool, type ToolHost } from '../../src/mcp/tools'
import { docWith, frame, rect, text } from '../core/helpers'

function host(start: MaquetteDocument, selection: string[] = []): ToolHost & { current(): MaquetteDocument; labels: string[] } {
  let doc = start
  const labels: string[] = []
  return {
    doc: () => doc,
    current: () => doc,
    labels,
    pageId: () => doc.pages[0]!.id,
    selection: () => selection,
    apply(ops, label) {
      const r = applyOps(doc, ops)
      if (r.ok) {
        doc = r.doc
        labels.push(label)
      }
      return r
    },
    capture: async (id, width) => (id === 'F1' ? { data: `img-${width}`, mimeType: 'image/jpeg' } : null),
  }
}

function scene() {
  const f = frame('F1', { x: 40, y: 40, name: 'Hero', width: 600, height: { mode: 'hug' }, layout: { mode: 'auto', gap: 16, padding: [24, 24, 24, 24] } }) as FrameNode
  f.children.push(text('T1', { content: 'Bonjour Maquette', fontSize: 40 }), text('T2', { content: 'Deuxième ligne' }))
  const d = docWith([f, rect('R1', { x: 700, y: 40, name: 'Bleu' })])
  d.styles.colors.push({ id: 'C1', name: 'accent', value: '#C2410C' })
  return d
}

describe('outils MCP', () => {
  it('la liste des outils a des descriptions courtes', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['lire_document', 'lire_elements', 'chercher', 'appliquer', 'capture', 'selection'])
    for (const t of TOOLS) expect(t.description.length).toBeLessThan(400)
  })

  it('lire_document : résumé compact du premier niveau', async () => {
    const r = await runTool(host(scene()), 'lire_document', {})
    const data = JSON.parse(r.text)
    expect(data.total).toBe(4)
    expect(data.pages[0].elements).toEqual([
      { id: 'F1', type: 'frame', nom: 'Hero', l: 600, h: 'hug', x: 40, y: 40, enfants: 2 },
      { id: 'R1', type: 'shape', nom: 'Bleu', l: 100, h: 100, x: 700, y: 40 },
    ])
    expect(data.couleurs).toEqual({ accent: '#C2410C' })
    expect(r.text.length).toBeLessThan(1200)
  })

  it('lire_elements : seulement ce qui diffère des valeurs par défaut, profondeur', async () => {
    const r = await runTool(host(scene()), 'lire_elements', { ids: ['F1', 'zz'], profondeur: 0 })
    const [f, missing] = JSON.parse(r.text).elements
    expect(f).toMatchObject({ id: 'F1', type: 'frame', name: 'Hero', width: 600, enfants: 2 })
    expect(f).not.toHaveProperty('visible')
    expect(f).not.toHaveProperty('children')
    expect(missing).toEqual({ id: 'zz', erreur: 'introuvable' })
    const deep = JSON.parse((await runTool(host(scene()), 'lire_elements', { ids: ['F1'] })).text).elements[0]
    expect(deep.children[0]).toMatchObject({ id: 'T1', type: 'text', content: 'Bonjour Maquette', fontSize: 40 })
    expect(deep.children[0]).not.toHaveProperty('fontFamily')
  })

  it('chercher par nom, type, texte', async () => {
    const h = host(scene())
    expect(JSON.parse((await runTool(h, 'chercher', { nom: 'her' })).text).resultats).toEqual([['F1', 'frame', 'Hero', null]])
    expect(JSON.parse((await runTool(h, 'chercher', { texte: 'deuxième' })).text).resultats).toEqual([['T2', 'text', 'Texte', 'F1']])
    expect(JSON.parse((await runTool(h, 'chercher', { type: 'text', limite: 1 })).text)).toMatchObject({ resultats: [['T1', 'text', 'Texte', 'F1']], plus: 1 })
  })

  it('appliquer : lot valide, réponse courte, libellé d’historique', async () => {
    const h = host(scene())
    const r = await runTool(h, 'appliquer', {
      libelle: 'ajouter un bouton',
      operations: [
        { op: 'create', parent: 'F1', node: { id: '$btn', type: 'frame', name: 'Bouton', fills: ['#0D99FF'], layout: { mode: 'auto' } } },
        { op: 'create', parent: '$btn', node: { type: 'text', content: 'Réserver', color: 'white' } },
      ],
    })
    const data = JSON.parse(r.text)
    expect(r.isError).toBeFalsy()
    expect(data).toEqual({ ok: true, ids: { $btn: expect.any(String) } })
    expect(r.text.length).toBeLessThan(300)
    expect(h.labels).toEqual(['Claude : ajouter un bouton'])
  })

  it('appliquer : lot invalide, rien n’est appliqué, au plus 5 erreurs', async () => {
    const h = host(scene())
    const before = h.current()
    const r = await runTool(h, 'appliquer', { operations: [{ op: 'update', id: 'R1', set: { colour: 'red' } }] })
    expect(r.isError).toBe(true)
    const data = JSON.parse(r.text)
    expect(data.ok).toBe(false)
    expect(data.erreurs.length).toBeGreaterThan(0)
    expect(data.erreurs.length).toBeLessThanOrEqual(5)
    expect(h.current()).toBe(before)
  })

  it('arguments invalides ou outil inconnu : erreur explicite', async () => {
    const h = host(scene())
    expect((await runTool(h, 'appliquer', { operations: [] })).isError).toBe(true)
    expect((await runTool(h, 'lire_elements', { ids: 'F1' })).isError).toBe(true)
    expect((await runTool(h, 'inconnu', {})).isError).toBe(true)
  })

  it('capture et sélection', async () => {
    const h = host(scene(), ['R1'])
    const c = await runTool(h, 'capture', { id: 'F1' })
    expect(c.image).toEqual({ data: 'img-800', mimeType: 'image/jpeg' })
    expect(c.text).toContain('Hero')
    expect((await runTool(h, 'capture', { id: 'R1' })).isError).toBe(true)
    expect(JSON.parse((await runTool(h, 'selection', {})).text)).toEqual({ ids: ['R1'], elements: [{ id: 'R1', type: 'shape', nom: 'Bleu' }] })
  })
})
```

Commit : `Ajoute les outils MCP purs avec des réponses compactes`.

### Task A2: Canal app ↔ relais (pipe nommé + jeton)

**Files:** Create `src/mcp/pipe.ts` (partagé, sans Electron), `src/mcp/pipeClient.ts`, `src/main/mcpBridge.ts` ; Test `tests/mcp/pipe.test.ts`.

**Produces:**
- `pipe.ts` : `pipePath(user?: string): string` — `process.env.MAQUETTE_PIPE` s'il est défini, sinon `\\.\pipe\maquette-<user nettoyé>` sous Windows (`<tmpdir>/maquette-<user>.sock` ailleurs) ; `userDataDir(): string` — `process.env.MAQUETTE_USER_DATA`, sinon `%APPDATA%/maquette` (Windows) ou `~/.config/maquette` ; `tokenPath(dir)`, `readToken(dir): Promise<string | null>`, `ensureToken(dir): Promise<string>` (64 hex aléatoires, créé si absent).
- `mcpBridge.ts` : `startBridge({ path, token, handle(tool, args): Promise<ToolResult> }): Promise<{ close(): Promise<void> }>` — serveur `net` ; protocole en lignes JSON ; première ligne `{"hello":"<jeton>"}` vérifiée à temps constant (sinon `{"error":"jeton invalide"}` puis fermeture) ; ensuite `{"id","tool","args"}` → `{"id","result"}` ou `{"id","error"}`.
- `pipeClient.ts` : `connectBridge({ path, token, timeoutMs = 30000 }): Promise<{ call(tool, args): Promise<ToolResult>; close(): void }>` — rejette avec une erreur `code: 'APP_FERMEE'` si le pipe n'existe pas ou refuse, `code: 'JETON_REFUSE'` si le jeton est refusé ; appels concurrents appariés par `id` ; délai dépassé → erreur `code: 'DELAI'`.

Tests (`tests/mcp/pipe.test.ts`) — pipes de test uniques par test (`\\.\pipe\maquette-test-<aléatoire>`) :
```ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureToken, readToken, tokenPath } from '../../src/mcp/pipe'
import { connectBridge } from '../../src/mcp/pipeClient'
import { startBridge } from '../../src/main/mcpBridge'

const testPipe = () => (process.platform === 'win32' ? `\\\\.\\pipe\\maquette-test-${Math.random().toString(36).slice(2)}` : join(tmpdir(), `mq-${Math.random().toString(36).slice(2)}.sock`))

describe('canal MCP', () => {
  it('jeton créé une fois, relu ensuite', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jeton '))
    expect(await readToken(dir)).toBeNull()
    const t = await ensureToken(dir)
    expect(t).toMatch(/^[0-9a-f]{64}$/)
    expect(await ensureToken(dir)).toBe(t)
    expect((await readFile(tokenPath(dir), 'utf8')).trim()).toBe(t)
  })

  it('appel aller-retour, appels concurrents', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: 'a'.repeat(64), handle: async (tool, args) => ({ text: `${tool}:${JSON.stringify(args)}` }) })
    const client = await connectBridge({ path, token: 'a'.repeat(64) })
    const [r1, r2] = await Promise.all([client.call('un', { a: 1 }), client.call('deux', {})])
    expect(r1.text).toBe('un:{"a":1}')
    expect(r2.text).toBe('deux:{}')
    client.close()
    await bridge.close()
  })

  it('mauvais jeton refusé, aucun outil exécuté', async () => {
    const path = testPipe()
    let calls = 0
    const bridge = await startBridge({ path, token: 'a'.repeat(64), handle: async () => { calls++; return { text: '' } } })
    await expect(connectBridge({ path, token: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'JETON_REFUSE' })
    expect(calls).toBe(0)
    await bridge.close()
  })

  it('app fermée : erreur APP_FERMEE', async () => {
    await expect(connectBridge({ path: testPipe(), token: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'APP_FERMEE' })
  })

  it('une erreur de l’outil est renvoyée, la connexion reste utilisable', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: 'a'.repeat(64), handle: async (tool) => { if (tool === 'boum') throw new Error('raté'); return { text: 'ok' } } })
    const client = await connectBridge({ path, token: 'a'.repeat(64) })
    await expect(client.call('boum', {})).rejects.toThrow('raté')
    expect((await client.call('autre', {})).text).toBe('ok')
    client.close()
    await bridge.close()
  })
})
```

Commit : `Ajoute le canal sécurisé entre le relais MCP et l'app (pipe nommé et jeton)`.

### Task A3: Rendu hors écran, captures et export PNG

**Files:** Create `src/main/exportPng.ts`, `src/renderer/export/ExportView.tsx` ; Modify `src/renderer/main.tsx` (mode export selon l'URL), `src/main/index.ts`, `src/main/menu.ts`, `src/main/ipc.ts`, `src/shared/ipc.ts`, `src/preload/index.ts` ; Test `e2e/export.spec.ts`.

**Produces:**
- `renderNode(doc: MaquetteDocument, nodeId: string, opts: { scale: number; format: 'png' | 'jpeg'; maxWidth?: number }): Promise<{ buffer: Buffer; width: number; height: number } | null>` (principal) — fenêtre `BrowserWindow` cachée, `offscreen: true`, même session (donc `masset://` et `mfont://`), chargée en mode `?export=1` ; la fenêtre reçoit le document et l'élément par IPC, n'affiche **que** cet élément à l'origine (style CSS calculé comme dans le canevas, `nodeCss` avec `parent = null` mais sans `left/top`), attend `document.fonts.ready` + le chargement de toutes les `<img>`, puis signale ses dimensions ; le principal fixe la taille de la fenêtre (`width × scale`, `height × scale`, avec `setZoomFactor(scale)`) et appelle `capturePage` ; `maxWidth` réduit l'échelle pour ne pas dépasser cette largeur (captures MCP) ; la fenêtre est réutilisée (une seule à la fois, file d'attente) et fermée à la fin de l'app.
- IPC `export:node` (fenêtre → principal) `{ doc, nodeId, scale, format, maxWidth? }` → `{ data: string (base64), mimeType, width, height } | null` — utilisé par l'outil MCP `capture`.
- Menu « Fichier → Exporter la sélection en PNG » avec sous-menu 1× / 2× / 3× (`Ctrl+Maj+E` = 2×) : la fenêtre renvoie l'élément sélectionné (premier) ; boîte d'enregistrement (`<nom>@2x.png`) ; écriture atomique ; rien de sélectionné → message dans le bandeau.
- Si `MAQUETTE_E2E=1`, le principal expose `globalThis.__maquetteRenderNode = renderNode` pour les tests.

e2e (`e2e/export.spec.ts`) : ouvrir `scene.maquette` ; via `app.evaluate`, rendre `fHero1` à 2× → PNG de largeur `2 × 600` et hauteur `2 × hauteur affichée` (± 1 px) ; le pixel au centre du titre n'est pas blanc (le texte est dessiné) ; rendre une image d'un document avec `assets/` → largeur attendue et pixel de la bonne couleur (PNG rouge 1×1 agrandi) ; rendu en JPEG avec `maxWidth: 300` → largeur ≤ 300.

Commits : `Ajoute le rendu hors écran d'un élément (captures et export)`, `Ajoute l'export PNG de la sélection en 1×, 2× et 3×`.

---

## Phase B (séquentielle)

- **B1 Relais** : `src/mcp-relay/relay.ts` (2ᵉ entrée de build du principal → `out/main/relay.js`) : `McpServer` (nom `maquette`, version du package) + `StdioServerTransport` ; chaque outil de `TOOLS` est déclaré avec sa description et son schéma ; à chaque appel : `connectBridge` (réutilisé tant que la connexion vit), `call`, conversion `ToolResult` → contenu MCP (`text`, et `image` si présent) ; `APP_FERMEE` → `isError` « Maquette n'est pas ouverte : lancez l'app puis réessayez. » ; `JETON_REFUSE` → « Jeton refusé : reconnectez Maquette à Claude Code (menu Fichier). ».
- **B2 Côté app** : au démarrage, `ensureToken(userDataDir())` puis `startBridge` sur `pipePath()` ; chaque appel est relayé à la fenêtre (`mcp:call` → réponse `mcp:result` avec un identifiant d'appel, délai 30 s) ; la fenêtre exécute `runTool` avec un `ToolHost` branché sur les stores (`apply` = `dispatch` ; `capture` = `export:node` en JPEG, `maxWidth` = largeur demandée) ; les éléments touchés par un lot de Claude clignotent d'un contour orange 1,2 s (`data-claude-flash`).
- **B3 Connexion à Claude Code** : menu « Fichier → Connecter à Claude Code… » : confirmation (montre la commande), puis `claude mcp add --scope user maquette -e ELECTRON_RUN_AS_NODE=1 -- "<exe>" "<relay.js>"` (via `cmd /c` sous Windows) ; résultat affiché ; si l'entrée existe déjà, propose de la remplacer (`claude mcp remove` puis `add`).
- **B4 e2e MCP de bout en bout** (`e2e/mcp.spec.ts`) : app lancée avec `MAQUETTE_PIPE` et `MAQUETTE_USER_DATA` de test ; un client `@modelcontextprotocol/sdk` lance le relais (`electron out/main/relay.js`, `ELECTRON_RUN_AS_NODE=1`, mêmes variables) ; `listTools` = 6 outils ; `lire_document` ; `appliquer` crée un rectangle → visible dans la fenêtre et annulable par `Ctrl+Z` en une fois ; `capture` renvoie une image ; app fermée → l'outil répond « Maquette n'est pas ouverte ».
- **B5 Banc d'essai tokens** : test qui mesure la somme des caractères échangés pour le scénario « créer une section hero de 15 éléments puis la corriger deux fois » (lire_document, appliquer ×3, lire_elements ×2) et vérifie qu'elle reste sous 6 000 caractères (≈ 1 500 tokens), hors capture.

### Fin du plan

Suites vertes, relecture finale par un agent neuf, correctifs avec tests.
