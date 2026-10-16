# Maquette — Plan 1 : Fondations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une app Electron qui ouvre, affiche et enregistre un document `.maquette`, avec un noyau document complet (modèle, règles de validité, opérations atomiques, annuler/rétablir, format, conversion en CSS) entièrement testé.

**Architecture:** Le noyau `src/core/` est du TypeScript pur (aucun import de React, d'Electron ni de modules Node) : types + schémas Zod, règles, opérations appliquées avec Immer (patchs pour l'historique), format JSON versionné, traduction élément → styles CSS. La fenêtre (React + Zustand) tient le document et l'affiche en vraies balises HTML ; le processus principal lit et écrit les fichiers (écriture atomique) et sert les images par un protocole `masset://`.

**Tech Stack:** Electron 44.8.0, electron-vite 6.0.0, Vite 8.3.4, React 19.3.1, TypeScript 7.0.2, Zustand 5.0.15, Immer 11.1.21, Zod 4.6.7, Vitest 5.0.5, Playwright 1.64.1.

**Spec:** `docs/superpowers/specs/2026-10-16-maquette-design.md` (sections 3, 4, 5, 6, 11 en partie, 13, 14). Les plans 2 à 6 couvriront : canevas interactif, panneaux, MCP + export PNG, taste-skill, robustesse des fichiers.

## Global Constraints

- Versions **exactes** (sans `^`) : celles de la ligne Tech Stack, plus `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `@types/node` 26.6.5, `@vitejs/plugin-react` 6.1.2.
- Windows 11 d'abord ; tout chemin de fichier peut contenir des espaces et des accents.
- `src/core/` n'importe ni `react`, ni `electron`, ni `node:*`. Il utilise `globalThis.crypto` (disponible partout).
- Fenêtre : `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. Le renderer ne parle au principal que par l'API exposée par le preload.
- Toutes les longueurs du document sont en **px** ; couleurs `#RRGGBB` ou `#RRGGBBAA`, ou `{ "style": "<id>" }`.
- Identifiants : 6 caractères aléatoires de l'alphabet `abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789`, jamais de `/`, jamais de `$` au début (le `$` désigne un identifiant temporaire dans un lot d'opérations).
- Code et identifiants en anglais ; **textes visibles et messages d'erreur en français**.
- Commits : messages en français, **un commit par changement**, **aucune ligne `Co-Authored-By`**.
- Ne jamais `git push` sans accord explicite de l'utilisateur.

## Review Focus

1. **Fichier invalide ouvert** (JSON cassé, autre format, version future) → message précis dans un bandeau d'alerte, aucune exception, rien d'écrasé. Tests : Task 6 (unitaires) et Task 8 (e2e bandeau).
2. **Enregistrement gêné par un antivirus** (renommage refusé `EBUSY`/`EPERM`) → nouvelles tentatives ; en cas d'échec définitif, le fichier d'origine est intact et le temporaire supprimé. Tests : Task 9.
3. **Lot d'opérations en partie invalide** (ex. la 3ᵉ opération sur 4 est fausse) → rien n'est appliqué, le document d'origine est inchangé, l'erreur cite `ops[2]`. Tests : Task 4.
4. **Lot refusé puis `Ctrl+Z`** → l'historique n'a pas reçu d'entrée fantôme ; l'annulation porte sur la dernière modification réussie. Tests : Task 8 (store).
5. **Texte et chemins non ASCII** (accents, guillemets « », emoji, retours à la ligne ; dossier `dossier é test`) → aller-retour octet pour octet. Tests : Task 6 (format) et Task 9 (e2e).

---

## Structure des fichiers

```
maquette/
├─ package.json · tsconfig.json · electron.vite.config.ts · vitest.config.ts · playwright.config.ts · .gitignore
├─ src/
│  ├─ core/                     noyau document (TS pur)
│  │  ├─ types.ts               types du document
│  │  ├─ schema.ts              schémas Zod (miroir des types)
│  │  ├─ ids.ts                 génération d'identifiants
│  │  ├─ defaults.ts            newDocument, createNode, autoLayoutDefaults
│  │  ├─ tree.ts                parcours, recherche, isHug/isFill
│  │  ├─ rules.ts               validateDocument (schéma + règles §6)
│  │  ├─ ops.ts                 applyOps (lot atomique, ids temporaires, corrections)
│  │  ├─ history.ts             History (annuler/rétablir par patchs)
│  │  ├─ format.ts              parseDocument / serializeDocument / migrations
│  │  └─ css.ts                 nodeCss : élément → styles CSS
│  ├─ shared/ipc.ts             types partagés principal ↔ preload ↔ fenêtre
│  ├─ main/
│  │  ├─ index.ts               fenêtre, menu, démarrage
│  │  ├─ state.ts               chemin du document courant
│  │  ├─ files.ts               writeFileAtomic
│  │  ├─ ipc.ts                 gestionnaires IPC fichiers
│  │  ├─ menu.ts                menu de l'app
│  │  └─ assets.ts              protocole masset:// + resolveAssetPath
│  ├─ preload/index.ts          API `window.maquette`
│  └─ renderer/
│     ├─ index.html · main.tsx · App.tsx · global.d.ts · app.css
│     ├─ state/store.ts         store Zustand du document
│     ├─ state/commands.ts      commandes du menu (nouveau, ouvrir, enregistrer…)
│     └─ canvas/ DocumentView.tsx · NodeView.tsx · measure.ts · assetUrl.ts
├─ tests/core/*.test.ts · tests/core/helpers.ts · tests/renderer/store.test.ts · tests/main/*.test.ts
└─ e2e/ launch.ts · app.spec.ts · document.spec.ts · save.spec.ts · assets.spec.ts · fixtures/
```

## Ordre et parallélisme

Task 1 → Task 2 → (Task 3 ∥ Task 7) → Task 4 → (Task 5 ∥ Task 6) → Task 8 → Task 9 → Task 10.
Les tâches marquées ∥ sont indépendantes et peuvent tourner en parallèle (worktrees partant de `main`).

---

### Task 1: Squelette Electron + outillage de test

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/app.css`
- Create: `tests/smoke.test.ts`, `e2e/launch.ts`, `e2e/app.spec.ts`

**Interfaces:**
- Produces: `npm run build` → `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` ; `launch(args?: string[]): Promise<{ app: ElectronApplication; page: Page }>` dans `e2e/launch.ts` ; élément racine `data-testid="app-root"`.

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "maquette",
  "version": "0.1.0",
  "private": true,
  "description": "Éditeur de maquettes de sites, style Figma, piloté par Claude Code",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "e2e": "electron-vite build && playwright test"
  },
  "dependencies": {
    "immer": "11.1.21",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "zod": "4.6.7",
    "zustand": "5.0.15"
  },
  "devDependencies": {
    "@playwright/test": "1.64.1",
    "@types/node": "26.6.5",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.2",
    "electron": "44.8.0",
    "electron-vite": "6.0.0",
    "typescript": "7.0.2",
    "vite": "8.3.4",
    "vitest": "5.0.5"
  }
}
```

- [ ] **Step 2: Créer les fichiers de configuration**

`tsconfig.json` :
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node", "vite/client"]
  },
  "include": ["src", "tests", "e2e", "electron.vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`electron.vite.config.ts` :
```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [react()] },
})
```

`vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
```

`playwright.config.ts` :
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({ testDir: 'e2e', timeout: 30_000, workers: 1 })
```

`.gitignore` :
```
node_modules/
out/
test-results/
playwright-report/
*.log
```

- [ ] **Step 3: Installer et vérifier le binaire Electron**

Run: `npm install` puis `npx electron --version`
Expected: `v44.8.0`. Si npm a signalé que les scripts d'installation d'`electron` (ou d'`esbuild`) ne sont pas autorisés, lancer `npm install-scripts approve electron` (et `esbuild` s'il est cité), puis `npm rebuild electron`, et revérifier `npx electron --version`.

- [ ] **Step 4: Écrire le test unitaire de fumée et le test e2e (qui échouent)**

`tests/smoke.test.ts` :
```ts
import { describe, it, expect } from 'vitest'

describe('outillage', () => {
  it('vitest tourne', () => {
    expect(1 + 1).toBe(2)
  })
})
```

`e2e/launch.ts` :
```ts
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export async function launch(args: string[] = []): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.', ...args], env: { ...process.env, MAQUETTE_E2E: '1' } })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}
```

`e2e/app.spec.ts` :
```ts
import { test, expect } from '@playwright/test'
import { launch } from './launch'

test('la fenêtre Maquette s’ouvre', async () => {
  const { app, page } = await launch()
  await expect(page.getByTestId('app-root')).toBeVisible()
  expect(await page.title()).toContain('Maquette')
  await app.close()
})
```

- [ ] **Step 5: Lancer les tests pour constater l'échec e2e**

Run: `npm test` → Expected: PASS (1 test).
Run: `npm run e2e` → Expected: FAIL (le build échoue : `src/main/index.ts` n'existe pas).

- [ ] **Step 6: Écrire le processus principal, le preload et la fenêtre minimale**

`src/main/index.ts` :
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Maquette',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts` :
```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('maquette', {})
```

`src/renderer/index.html` :
```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: masset:"
    />
    <title>Maquette</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/renderer/main.tsx` :
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/renderer/App.tsx` :
```tsx
export function App() {
  return <div data-testid="app-root" className="app">Maquette</div>
}
```

`src/renderer/app.css` :
```css
html, body, #root { margin: 0; height: 100%; }
body { font-family: system-ui, sans-serif; background: #e5e5e5; color: #111; }
.app { height: 100%; position: relative; overflow: hidden; }
```

- [ ] **Step 7: Construire et vérifier les sorties**

Run: `npm run build` puis `ls out/main out/preload out/renderer`
Expected: `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` existent. Si le preload sort sous un autre nom (ex. `index.mjs`), corriger le chemin `preload:` de `src/main/index.ts` pour qu'il corresponde, et le noter dans le message de commit.

- [ ] **Step 8: Lancer tous les tests**

Run: `npm run typecheck && npm test && npm run e2e`
Expected: typecheck sans erreur, Vitest PASS, Playwright 1 passed.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json electron.vite.config.ts vitest.config.ts playwright.config.ts .gitignore src tests e2e
git commit -m "Crée le squelette Electron + React + TypeScript avec Vitest et Playwright"
```

---

### Task 2: Types, schémas, identifiants, valeurs par défaut, parcours de l'arbre

**Files:**
- Create: `src/core/types.ts`, `src/core/schema.ts`, `src/core/ids.ts`, `src/core/defaults.ts`, `src/core/tree.ts`
- Create: `tests/core/helpers.ts`, `tests/core/model.test.ts`

**Interfaces:**
- Produces (types, `src/core/types.ts`) : `Id`, `Color`, `Size`, `Stroke`, `Shadow`, `Radius`, `Justify`, `Align`, `FreeLayout`, `AutoLayout`, `Layout`, `BaseNode`, `FrameNode`, `TextNode`, `ShapeNode`, `ImageNode`, `Node`, `NodeType`, `NodeInput`, `ColorStyle`, `TextStyle`, `DocStyles`, `Page`, `MaquetteDocument`, `Rect`, `Axis`.
- Produces (`schema.ts`) : `NodeSchema: z.ZodType<Node>`, `DocumentSchema: z.ZodType<MaquetteDocument>`, `HEX_COLOR: RegExp`.
- Produces (`ids.ts`) : `newId(taken?: ReadonlySet<string>): string`.
- Produces (`defaults.ts`) : `newDocument(): MaquetteDocument`, `createNode(input: NodeInput, id: string): Node`, `autoLayoutDefaults(): AutoLayout`.
- Produces (`tree.ts`) : `NodeLocation { node; parent: FrameNode | null; page: Page; index: number; path: string }`, `walk(doc, visit: (loc: NodeLocation) => void): void`, `findNode(doc, id): NodeLocation | null`, `collectIds(doc): Set<string>`, `containsId(node: Node, id: string): boolean`, `isHug(s: Size): boolean`, `isFill(s: Size): boolean`.
- Produces (`tests/core/helpers.ts`) : `docWith(children: Node[]): MaquetteDocument`, `frame(id, props?)`, `text(id, props?)`, `rect(id, props?)`.

- [ ] **Step 1: Écrire `src/core/types.ts`**

```ts
export type Id = string
export type Color = string | { style: Id }
export type Size = number | { mode: 'hug' } | { mode: 'fill' }
export type Axis = 'width' | 'height'

export interface Stroke { color: Color; width: number; align: 'inside' | 'outside' | 'center' }
export interface Shadow { x: number; y: number; blur: number; spread: number; color: Color; inset: boolean }
export type Radius = number | [number, number, number, number]

export type Justify = 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'
export type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline'

export interface FreeLayout { mode: 'free' }
export interface AutoLayout {
  mode: 'auto'
  direction: 'row' | 'column'
  gap: number | 'auto'
  padding: [number, number, number, number]
  justify: Justify
  align: Align
  wrap: boolean
  rowGap?: number
  reverseZ: boolean
}
export type Layout = FreeLayout | AutoLayout

export interface BaseNode {
  id: Id
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  width: Size
  height: Size
  x?: number
  y?: number
  position: 'flow' | 'absolute'
  alignSelf?: 'start' | 'center' | 'end' | 'stretch'
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
}

export interface FrameNode extends BaseNode {
  type: 'frame'
  children: Node[]
  layout: Layout
  fills: Color[]
  stroke?: Stroke
  radius: Radius
  shadows: Shadow[]
  clip: boolean
}

export interface TextNode extends BaseNode {
  type: 'text'
  content: string
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  fontSize: number
  lineHeight: number
  letterSpacing: number
  textAlign: 'left' | 'center' | 'right' | 'justify'
  color: Color
  textStyle?: Id
  textSizing: 'auto' | 'auto-height' | 'fixed'
}

export interface ShapeNode extends BaseNode {
  type: 'shape'
  shape: 'rectangle' | 'ellipse'
  fills: Color[]
  stroke?: Stroke
  radius: Radius
  shadows: Shadow[]
}

export interface ImageNode extends BaseNode {
  type: 'image'
  src: string
  fit: 'cover' | 'contain' | 'fill'
  radius: Radius
  stroke?: Stroke
  shadows: Shadow[]
}

export type Node = FrameNode | TextNode | ShapeNode | ImageNode
export type NodeType = Node['type']

type Without<T> = Omit<T, 'id' | 'type' | 'children' | 'layout'>
/** Ce qu'il faut fournir pour créer un élément : le type, le reste est facultatif. */
export type NodeInput =
  | ({ type: 'frame'; layout?: FreeLayout | (Partial<AutoLayout> & { mode: 'auto' }) } & Partial<Without<FrameNode>>)
  | ({ type: 'text' } & Partial<Without<TextNode>>)
  | ({ type: 'shape' } & Partial<Without<ShapeNode>>)
  | ({ type: 'image' } & Partial<Without<ImageNode>>)

export interface ColorStyle { id: Id; name: string; value: string }
export interface TextStyle {
  id: Id
  name: string
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  fontSize: number
  lineHeight: number
  letterSpacing: number
}
export interface DocStyles { colors: ColorStyle[]; text: TextStyle[] }

export interface Page { id: Id; name: string; children: Node[] }

export interface MaquetteDocument {
  format: 'maquette'
  version: 1
  styles: DocStyles
  pages: Page[]
}

/** Rectangle mesuré dans le rendu, en coordonnées du parent. */
export interface Rect { x: number; y: number; width: number; height: number }
```

- [ ] **Step 2: Écrire le test du modèle (qui échoue)**

`tests/core/helpers.ts` :
```ts
import { createNode, newDocument } from '../../src/core/defaults'
import type { MaquetteDocument, Node, NodeInput } from '../../src/core/types'

export function docWith(children: Node[]): MaquetteDocument {
  const doc = newDocument()
  doc.pages[0]!.children = children
  return doc
}

export const frame = (id: string, props: Partial<Extract<NodeInput, { type: 'frame' }>> = {}): Node =>
  createNode({ type: 'frame', ...props }, id)

export const text = (id: string, props: Partial<Extract<NodeInput, { type: 'text' }>> = {}): Node =>
  createNode({ type: 'text', ...props }, id)

export const rect = (id: string, props: Partial<Extract<NodeInput, { type: 'shape' }>> = {}): Node =>
  createNode({ type: 'shape', ...props }, id)
```

`tests/core/model.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { DocumentSchema, NodeSchema } from '../../src/core/schema'
import { newId } from '../../src/core/ids'
import { createNode, newDocument } from '../../src/core/defaults'
import { collectIds, containsId, findNode, isFill, isHug } from '../../src/core/tree'
import type { FrameNode } from '../../src/core/types'
import { docWith, frame, text } from './helpers'

describe('modèle', () => {
  it('un document neuf est valide et a une page « Page 1 »', () => {
    const doc = newDocument()
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
    expect(doc.pages).toHaveLength(1)
    expect(doc.pages[0]!.name).toBe('Page 1')
  })

  it('un texte reçoit un interligne de 1,2 × la taille par défaut', () => {
    const t = createNode({ type: 'text', fontSize: 20 }, 'abc123')
    expect(t).toMatchObject({ id: 'abc123', type: 'text', lineHeight: 24, width: { mode: 'hug' }, textSizing: 'auto' })
  })

  it('un interligne fourni est conservé', () => {
    const t = createNode({ type: 'text', fontSize: 20, lineHeight: 30 }, 'abc123')
    expect(t).toMatchObject({ lineHeight: 30 })
  })

  it('une mise en page automatique partielle est complétée', () => {
    const f = createNode({ type: 'frame', layout: { mode: 'auto', direction: 'row' } }, 'f00001') as FrameNode
    expect(f.layout).toEqual({
      mode: 'auto', direction: 'row', gap: 0, padding: [0, 0, 0, 0],
      justify: 'start', align: 'start', wrap: false, reverseZ: false,
    })
  })

  it('le schéma refuse une propriété inconnue', () => {
    const t = { ...text('t00001'), colour: 'red' }
    expect(NodeSchema.safeParse(t).success).toBe(false)
  })

  it('newId produit des identifiants de 6 caractères sans ambiguïté', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const id = newId(seen)
      expect(id).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{6}$/)
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
  })

  it('findNode trouve un élément imbriqué avec son parent et son chemin', () => {
    const inner = text('t00001')
    const outer = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    outer.children.push(inner)
    const doc = docWith([outer])
    const loc = findNode(doc, 't00001')
    expect(loc?.parent?.id).toBe('f00001')
    expect(loc?.index).toBe(0)
    expect(loc?.path).toBe('pages[0].children[0].children[0]')
    expect(findNode(doc, 'absent')).toBeNull()
  })

  it('collectIds rassemble pages, éléments et styles', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0 })])
    doc.styles.colors.push({ id: 'c00001', name: 'fond', value: '#FFFFFF' })
    const ids = collectIds(doc)
    expect(ids.has(doc.pages[0]!.id)).toBe(true)
    expect(ids.has('f00001')).toBe(true)
    expect(ids.has('c00001')).toBe(true)
  })

  it('containsId, isHug, isFill', () => {
    const outer = frame('f00001', { x: 0, y: 0 }) as FrameNode
    outer.children.push(text('t00001'))
    expect(containsId(outer, 't00001')).toBe(true)
    expect(containsId(outer, 'f00001')).toBe(true)
    expect(containsId(outer, 'zzzzzz')).toBe(false)
    expect(isHug({ mode: 'hug' })).toBe(true)
    expect(isFill({ mode: 'fill' })).toBe(true)
    expect(isHug(10)).toBe(false)
  })
})
```

- [ ] **Step 3: Lancer le test pour constater l'échec**

Run: `npx vitest run tests/core/model.test.ts`
Expected: FAIL — modules `src/core/schema`, `ids`, `defaults`, `tree` introuvables.

- [ ] **Step 4: Écrire `src/core/schema.ts`**

```ts
import { z } from 'zod'
import type { MaquetteDocument, Node } from './types'

export const HEX_COLOR = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/

const Id = z.string().regex(/^[^/$][^/]*$/, 'identifiant invalide (pas de « / », pas de « $ » au début)')
const Px = z.number().nonnegative()
const ColorSchema = z.union([z.string().regex(HEX_COLOR, 'couleur attendue : #RRGGBB ou #RRGGBBAA'), z.strictObject({ style: Id })])
const SizeSchema = z.union([Px, z.strictObject({ mode: z.literal('hug') }), z.strictObject({ mode: z.literal('fill') })])
const StrokeSchema = z.strictObject({ color: ColorSchema, width: z.number().positive(), align: z.enum(['inside', 'outside', 'center']) })
const ShadowSchema = z.strictObject({
  x: z.number(), y: z.number(), blur: Px, spread: z.number(), color: ColorSchema, inset: z.boolean(),
})
const RadiusSchema = z.union([Px, z.tuple([Px, Px, Px, Px])])

const LayoutSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('free') }),
  z.strictObject({
    mode: z.literal('auto'),
    direction: z.enum(['row', 'column']),
    gap: z.union([z.number(), z.literal('auto')]),
    padding: z.tuple([Px, Px, Px, Px]),
    justify: z.enum(['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly']),
    align: z.enum(['start', 'center', 'end', 'stretch', 'baseline']),
    wrap: z.boolean(),
    rowGap: z.number().optional(),
    reverseZ: z.boolean(),
  }),
])

const base = {
  id: Id,
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
  width: SizeSchema,
  height: SizeSchema,
  x: z.number().optional(),
  y: z.number().optional(),
  position: z.enum(['flow', 'absolute']),
  alignSelf: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  minWidth: Px.optional(),
  maxWidth: Px.optional(),
  minHeight: Px.optional(),
  maxHeight: Px.optional(),
}

const FrameSchema = z.strictObject({
  ...base,
  type: z.literal('frame'),
  children: z.array(z.lazy((): z.ZodType<Node> => NodeSchema)),
  layout: LayoutSchema,
  fills: z.array(ColorSchema),
  stroke: StrokeSchema.optional(),
  radius: RadiusSchema,
  shadows: z.array(ShadowSchema),
  clip: z.boolean(),
})

const TextSchema = z.strictObject({
  ...base,
  type: z.literal('text'),
  content: z.string(),
  fontFamily: z.string().min(1),
  fontWeight: z.number().int().min(1).max(1000),
  fontStyle: z.enum(['normal', 'italic']),
  fontSize: z.number().positive(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']),
  color: ColorSchema,
  textStyle: Id.optional(),
  textSizing: z.enum(['auto', 'auto-height', 'fixed']),
})

const ShapeSchema = z.strictObject({
  ...base,
  type: z.literal('shape'),
  shape: z.enum(['rectangle', 'ellipse']),
  fills: z.array(ColorSchema),
  stroke: StrokeSchema.optional(),
  radius: RadiusSchema,
  shadows: z.array(ShadowSchema),
})

const ImageSchema = z.strictObject({
  ...base,
  type: z.literal('image'),
  src: z.string(),
  fit: z.enum(['cover', 'contain', 'fill']),
  radius: RadiusSchema,
  stroke: StrokeSchema.optional(),
  shadows: z.array(ShadowSchema),
})

export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.discriminatedUnion('type', [FrameSchema, TextSchema, ShapeSchema, ImageSchema]),
)

const ColorStyleSchema = z.strictObject({ id: Id, name: z.string().min(1), value: z.string().regex(HEX_COLOR) })
const TextStyleSchema = z.strictObject({
  id: Id,
  name: z.string().min(1),
  fontFamily: z.string().min(1),
  fontWeight: z.number().int().min(1).max(1000),
  fontStyle: z.enum(['normal', 'italic']),
  fontSize: z.number().positive(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
})

const PageSchema = z.strictObject({ id: Id, name: z.string().min(1), children: z.array(NodeSchema) })

export const DocumentSchema: z.ZodType<MaquetteDocument> = z.strictObject({
  format: z.literal('maquette'),
  version: z.literal(1),
  styles: z.strictObject({ colors: z.array(ColorStyleSchema), text: z.array(TextStyleSchema) }),
  pages: z.array(PageSchema),
})
```

- [ ] **Step 5: Écrire `src/core/ids.ts`**

```ts
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 6

/** Identifiant court, aléatoire, absent de `taken`. */
export function newId(taken?: ReadonlySet<string>): string {
  for (;;) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(LENGTH))
    let id = ''
    for (const b of bytes) id += ALPHABET[b % ALPHABET.length]
    if (!taken?.has(id)) return id
  }
}
```

- [ ] **Step 6: Écrire `src/core/defaults.ts`**

```ts
import { newId } from './ids'
import type { AutoLayout, MaquetteDocument, Node, NodeInput } from './types'

export function autoLayoutDefaults(): AutoLayout {
  return {
    mode: 'auto', direction: 'column', gap: 0, padding: [0, 0, 0, 0],
    justify: 'start', align: 'start', wrap: false, reverseZ: false,
  }
}

export function newDocument(): MaquetteDocument {
  return {
    format: 'maquette',
    version: 1,
    styles: { colors: [], text: [] },
    pages: [{ id: newId(), name: 'Page 1', children: [] }],
  }
}

const common = { visible: true, locked: false, opacity: 1, position: 'flow' as const }

/** Crée un élément complet à partir d'une saisie partielle. `id` est imposé. */
export function createNode(input: NodeInput, id: string): Node {
  switch (input.type) {
    case 'frame': {
      const { layout, ...rest } = input
      return {
        ...common, name: 'Cadre', width: 400, height: 300,
        fills: ['#FFFFFF'], radius: 0, shadows: [], clip: false,
        ...rest,
        id, type: 'frame', children: [],
        layout: layout?.mode === 'auto' ? { ...autoLayoutDefaults(), ...layout } : { mode: 'free' },
      }
    }
    case 'text': {
      const fontSize = input.fontSize ?? 16
      return {
        ...common, name: 'Texte', width: { mode: 'hug' }, height: { mode: 'hug' },
        content: 'Texte', fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal',
        fontSize, lineHeight: Math.round(fontSize * 1.2), letterSpacing: 0,
        textAlign: 'left', color: '#111111', textSizing: 'auto',
        ...input, id, type: 'text',
      }
    }
    case 'shape':
      return {
        ...common, name: input.shape === 'ellipse' ? 'Ellipse' : 'Rectangle', width: 100, height: 100,
        shape: 'rectangle', fills: ['#D9D9D9'], radius: 0, shadows: [],
        ...input, id, type: 'shape',
      }
    case 'image':
      return {
        ...common, name: 'Image', width: 200, height: 150,
        src: '', fit: 'cover', radius: 0, shadows: [],
        ...input, id, type: 'image',
      }
  }
}
```

- [ ] **Step 7: Écrire `src/core/tree.ts`**

```ts
import type { FrameNode, MaquetteDocument, Node, Page, Size } from './types'

export interface NodeLocation {
  node: Node
  parent: FrameNode | null
  page: Page
  index: number
  path: string
}

export const isHug = (s: Size): boolean => typeof s === 'object' && s.mode === 'hug'
export const isFill = (s: Size): boolean => typeof s === 'object' && s.mode === 'fill'

export function walk(doc: MaquetteDocument, visit: (loc: NodeLocation) => void): void {
  const visitList = (list: Node[], parent: FrameNode | null, page: Page, basePath: string) => {
    list.forEach((node, index) => {
      const path = `${basePath}.children[${index}]`
      visit({ node, parent, page, index, path })
      if (node.type === 'frame') visitList(node.children, node, page, path)
    })
  }
  doc.pages.forEach((page, pi) => visitList(page.children, null, page, `pages[${pi}]`))
}

export function findNode(doc: MaquetteDocument, id: string): NodeLocation | null {
  let found: NodeLocation | null = null
  walk(doc, (loc) => {
    if (!found && loc.node.id === id) found = loc
  })
  return found
}

export function collectIds(doc: MaquetteDocument): Set<string> {
  const ids = new Set<string>()
  doc.pages.forEach((p) => ids.add(p.id))
  doc.styles.colors.forEach((s) => ids.add(s.id))
  doc.styles.text.forEach((s) => ids.add(s.id))
  walk(doc, ({ node }) => ids.add(node.id))
  return ids
}

export function containsId(node: Node, id: string): boolean {
  if (node.id === id) return true
  return node.type === 'frame' && node.children.some((c) => containsId(c, id))
}
```

- [ ] **Step 8: Lancer les tests et le typecheck**

Run: `npx vitest run tests/core/model.test.ts && npm run typecheck`
Expected: 9 tests PASS, typecheck sans erreur.

- [ ] **Step 9: Commit**

```bash
git add src/core tests/core
git commit -m "Ajoute le modèle de document : types, schémas Zod, identifiants, valeurs par défaut, parcours"
```

---

### Task 3: Règles de validité

**Files:**
- Create: `src/core/rules.ts`
- Test: `tests/core/rules.test.ts`

**Interfaces:**
- Consumes: `DocumentSchema` (schema.ts), `walk`, `isHug`, `isFill` (tree.ts), types.
- Produces: `interface Issue { path: string; message: string }`, `validateDocument(doc: MaquetteDocument): Issue[]`, `formatPath(segments: readonly PropertyKey[]): string`.

- [ ] **Step 1: Écrire les tests (qui échouent)**

`tests/core/rules.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { validateDocument, formatPath } from '../../src/core/rules'
import { newDocument } from '../../src/core/defaults'
import type { FrameNode, TextNode } from '../../src/core/types'
import { docWith, frame, rect, text } from './helpers'

const auto = (dir: 'row' | 'column' = 'column') => ({ mode: 'auto' as const, direction: dir })
const paths = (doc: Parameters<typeof validateDocument>[0]) => validateDocument(doc).map((i) => i.path)

describe('validateDocument', () => {
  it('formatPath écrit des chemins lisibles', () => {
    expect(formatPath(['pages', 0, 'children', 2, 'width'])).toBe('pages[0].children[2].width')
  })

  it('un document valide ne produit aucune erreur', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: auto() }) as FrameNode
    f.children.push(text('t00001'))
    expect(validateDocument(docWith([f]))).toEqual([])
  })

  it('erreur de schéma : opacité hors bornes, avec le chemin exact', () => {
    const f = frame('f00001', { x: 0, y: 0, opacity: 2 })
    expect(paths(docWith([f]))).toEqual(['pages[0].children[0].opacity'])
  })

  it('un document sans page est refusé', () => {
    const doc = newDocument()
    doc.pages = []
    expect(paths(doc)).toEqual(['pages'])
  })

  it('règle 1 : "hug" sur un rectangle est refusé', () => {
    expect(paths(docWith([rect('r00001', { x: 0, y: 0, width: { mode: 'hug' } })]))).toEqual(['pages[0].children[0].width'])
  })

  it('règle 1 : "hug" sur un cadre libre est refusé', () => {
    expect(paths(docWith([frame('f00001', { x: 0, y: 0, height: { mode: 'hug' } })]))).toEqual(['pages[0].children[0].height'])
  })

  it('règle 2 : "fill" sur un cadre de premier niveau est refusé', () => {
    const issues = validateDocument(docWith([frame('f00001', { x: 0, y: 0, width: { mode: 'fill' } })]))
    expect(issues.map((i) => i.path)).toEqual(['pages[0].children[0].width'])
    expect(issues[0]!.message).toContain('"fill"')
  })

  it('règle 2 : "fill" permis dans un cadre automatique, refusé dans un cadre libre', () => {
    const ok = frame('f00001', { x: 0, y: 0, layout: auto() }) as FrameNode
    ok.children.push(rect('r00001', { width: { mode: 'fill' } }))
    expect(validateDocument(docWith([ok]))).toEqual([])

    const ko = frame('f00002', { x: 0, y: 0 }) as FrameNode
    ko.children.push(rect('r00002', { x: 0, y: 0, width: { mode: 'fill' } }))
    expect(paths(docWith([ko]))).toEqual(['pages[0].children[0].children[0].width'])
  })

  it('règle 3 : parent "hug" avec un enfant "fill" sur le même axe est refusé', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: auto('row'), width: { mode: 'hug' } }) as FrameNode
    f.children.push(rect('r00001', { width: { mode: 'fill' } }))
    expect(paths(docWith([f]))).toEqual(['pages[0].children[0].width'])
  })

  it('règle 5 : rowGap sans retour à la ligne, baseline en colonne', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto', rowGap: 8, align: 'baseline' } })
    expect(paths(docWith([f]))).toEqual(['pages[0].children[0].layout.rowGap', 'pages[0].children[0].layout.align'])
  })

  it('règle 6 : x/y interdits sur un enfant en flux, obligatoires ailleurs', () => {
    const a = frame('f00001', { x: 0, y: 0, layout: auto() }) as FrameNode
    a.children.push(rect('r00001', { x: 5, y: 5 }))
    expect(paths(docWith([a]))).toEqual(['pages[0].children[0].children[0].x'])

    const b = frame('f00002', { x: 0, y: 0 }) as FrameNode
    b.children.push(rect('r00002'))
    expect(paths(docWith([b]))).toEqual(['pages[0].children[0].children[0].x'])
  })

  it('"absolute" et alignSelf seulement dans un cadre automatique', () => {
    const f = frame('f00001', { x: 0, y: 0 }) as FrameNode
    f.children.push(rect('r00001', { x: 0, y: 0, position: 'absolute', alignSelf: 'center' }))
    expect(paths(docWith([f]))).toEqual([
      'pages[0].children[0].children[0].position',
      'pages[0].children[0].children[0].alignSelf',
    ])
  })

  it('règle 7 : min/max hors contexte automatique et min > max', () => {
    expect(paths(docWith([rect('r00001', { x: 0, y: 0, minWidth: 10 })]))).toEqual(['pages[0].children[0].minWidth'])
    const f = frame('f00001', { x: 0, y: 0, layout: auto(), minWidth: 50, maxWidth: 40 })
    expect(paths(docWith([f]))).toEqual(['pages[0].children[0].minWidth'])
  })

  it('règle 8 : cohérence de textSizing', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: auto() }) as FrameNode
    f.children.push(text('t00001', { width: 200, textSizing: 'auto' }))
    f.children.push(text('t00002', { width: { mode: 'hug' }, textSizing: 'auto-height' }))
    f.children.push(text('t00003', { width: 200, height: { mode: 'hug' }, textSizing: 'fixed' }))
    expect(paths(docWith([f]))).toEqual([
      'pages[0].children[0].children[0].textSizing',
      'pages[0].children[0].children[1].textSizing',
      'pages[0].children[0].children[2].textSizing',
    ])
  })

  it('règle 11 : références inconnues et identifiants en double', () => {
    const f = frame('f00001', { x: 0, y: 0, layout: auto(), fills: [{ style: 'cZZZZZ' }] }) as FrameNode
    const t = text('t00001', { textStyle: 'tZZZZZ' }) as TextNode
    f.children.push(t, text('f00001'))
    expect(paths(docWith([f]))).toEqual([
      'pages[0].children[0].fills[0]',
      'pages[0].children[0].children[0].textStyle',
      'pages[0].children[0].children[1].id',
    ])
  })

  it('les références vers des styles existants sont acceptées', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0, fills: [{ style: 'c00001' }] })])
    doc.styles.colors.push({ id: 'c00001', name: 'fond', value: '#F4F1EA' })
    expect(validateDocument(doc)).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer pour constater l'échec**

Run: `npx vitest run tests/core/rules.test.ts`
Expected: FAIL — module `src/core/rules` introuvable.

- [ ] **Step 3: Écrire `src/core/rules.ts`**

```ts
import { DocumentSchema } from './schema'
import { isFill, isHug, walk } from './tree'
import type { Axis, Color, MaquetteDocument, Node } from './types'

export interface Issue { path: string; message: string }

export function formatPath(segments: readonly PropertyKey[]): string {
  return segments.reduce<string>((acc, s) => {
    if (typeof s === 'number') return `${acc}[${s}]`
    return acc ? `${acc}.${String(s)}` : String(s)
  }, '')
}

const AXES: Axis[] = ['width', 'height']

/** Vérifie le schéma puis les règles de la spec (§6). Renvoie [] si le document est valide. */
export function validateDocument(doc: MaquetteDocument): Issue[] {
  const parsed = DocumentSchema.safeParse(doc)
  if (!parsed.success) return parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message }))

  const issues: Issue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  if (doc.pages.length === 0) add('pages', 'le document doit avoir au moins une page')

  const colorIds = new Set(doc.styles.colors.map((s) => s.id))
  const textIds = new Set(doc.styles.text.map((s) => s.id))
  const seen = new Set<string>()
  const claim = (id: string, path: string) => {
    if (seen.has(id)) add(path, `identifiant en double : ${id}`)
    seen.add(id)
  }
  doc.styles.colors.forEach((s, i) => claim(s.id, `styles.colors[${i}].id`))
  doc.styles.text.forEach((s, i) => claim(s.id, `styles.text[${i}].id`))
  doc.pages.forEach((p, i) => claim(p.id, `pages[${i}].id`))

  const checkColor = (c: Color, path: string) => {
    if (typeof c === 'object' && !colorIds.has(c.style)) add(path, `couleur nommée inconnue : ${c.style}`)
  }

  walk(doc, ({ node, parent, path }) => {
    claim(node.id, `${path}.id`)
    const autoParent = parent?.layout.mode === 'auto'
    const inFlow = autoParent && node.position === 'flow'
    const autoSelf = node.type === 'frame' && node.layout.mode === 'auto'

    for (const axis of AXES) {
      const size = node[axis]
      if (isHug(size) && !(node.type === 'text' || autoSelf)) {
        add(`${path}.${axis}`, '"hug" n’est permis que pour un cadre en mise en page automatique ou un texte')
      }
      if (isFill(size) && !inFlow) {
        add(`${path}.${axis}`, '"fill" n’est permis que pour un enfant en flux d’un cadre en mise en page automatique')
      }
      if (node.type === 'frame' && autoSelf && isHug(size)) {
        const fillChild = node.children.some((c) => c.position === 'flow' && isFill(c[axis]))
        if (fillChild) add(`${path}.${axis}`, `un cadre en "hug" ne peut pas contenir un enfant en "fill" sur le même axe (${axis})`)
      }
    }

    if (node.position === 'absolute' && !autoParent) {
      add(`${path}.position`, '"absolute" n’a de sens que dans un cadre en mise en page automatique')
    }
    if (inFlow && (node.x !== undefined || node.y !== undefined)) {
      add(`${path}.x`, 'la position d’un enfant en flux est calculée par la mise en page automatique : x et y interdits')
    }
    if (!inFlow && (node.x === undefined || node.y === undefined)) {
      add(`${path}.x`, 'x et y sont obligatoires hors du flux d’un cadre automatique')
    }
    if (node.alignSelf !== undefined && !inFlow) {
      add(`${path}.alignSelf`, 'alignSelf n’a de sens que pour un enfant en flux d’un cadre automatique')
    }

    const hasMinMax = [node.minWidth, node.maxWidth, node.minHeight, node.maxHeight].some((v) => v !== undefined)
    if (hasMinMax && !(autoParent || autoSelf)) {
      add(`${path}.minWidth`, 'min/max ne s’appliquent qu’à un cadre automatique ou à ses enfants directs')
    } else {
      if (node.minWidth !== undefined && node.maxWidth !== undefined && node.minWidth > node.maxWidth) {
        add(`${path}.minWidth`, 'minWidth doit être inférieur ou égal à maxWidth')
      }
      if (node.minHeight !== undefined && node.maxHeight !== undefined && node.minHeight > node.maxHeight) {
        add(`${path}.minHeight`, 'minHeight doit être inférieur ou égal à maxHeight')
      }
    }

    checkPaint(node, path, checkColor)

    if (node.type === 'frame' && node.layout.mode === 'auto') {
      if (node.layout.rowGap !== undefined && !node.layout.wrap) {
        add(`${path}.layout.rowGap`, 'rowGap n’a de sens qu’avec le retour à la ligne (wrap)')
      }
      if (node.layout.align === 'baseline' && node.layout.direction !== 'row') {
        add(`${path}.layout.align`, '"baseline" n’existe qu’en direction "row"')
      }
    }

    if (node.type === 'text') {
      const wHug = isHug(node.width)
      const hHug = isHug(node.height)
      const ok =
        node.textSizing === 'auto' ? wHug && hHug : node.textSizing === 'auto-height' ? !wHug && hHug : !wHug && !hHug
      if (!ok) {
        const expected = {
          auto: 'width et height en "hug"',
          'auto-height': 'width fixe ou "fill", height en "hug"',
          fixed: 'width et height fixes ou "fill"',
        }[node.textSizing]
        add(`${path}.textSizing`, `"${node.textSizing}" exige ${expected}`)
      }
      if (node.textStyle !== undefined && !textIds.has(node.textStyle)) {
        add(`${path}.textStyle`, `style de texte inconnu : ${node.textStyle}`)
      }
    }
  })

  return issues
}

function checkPaint(node: Node, path: string, checkColor: (c: Color, path: string) => void): void {
  if (node.type === 'frame' || node.type === 'shape') node.fills.forEach((c, i) => checkColor(c, `${path}.fills[${i}]`))
  if (node.type === 'text') checkColor(node.color, `${path}.color`)
  if (node.type !== 'text') {
    if (node.stroke) checkColor(node.stroke.color, `${path}.stroke.color`)
    node.shadows.forEach((s, i) => checkColor(s.color, `${path}.shadows[${i}].color`))
  }
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/rules.test.ts && npm run typecheck`
Expected: 16 tests PASS, typecheck sans erreur. (Si un test d'ordre d'erreurs échoue, c'est l'ordre des vérifications dans `walk` qu'il faut aligner sur le test, pas l'inverse.)

- [ ] **Step 5: Commit**

```bash
git add src/core/rules.ts tests/core/rules.test.ts
git commit -m "Ajoute les règles de validité du document avec chemins d'erreur exacts"
```

---

### Task 4: Opérations atomiques

**Files:**
- Create: `src/core/ops.ts`
- Test: `tests/core/ops.test.ts`

**Interfaces:**
- Consumes: `createNode`, `autoLayoutDefaults` (defaults.ts), `findNode`, `walk`, `collectIds`, `containsId`, `isHug`, `isFill` (tree.ts), `newId` (ids.ts), `validateDocument`, `Issue` (rules.ts).
- Produces:
  - `type Measure = (id: string) => Rect | undefined`
  - `type Op` — union : `create`, `update`, `move`, `delete`, `page.create`, `page.update`, `page.delete`, `style.color.set`, `style.text.set`, `style.delete` (définition exacte ci-dessous)
  - `type ApplyResult = { ok: true; doc: MaquetteDocument; patches: Patch[]; inversePatches: Patch[]; ids: Record<string, string>; fixes: string[] } | { ok: false; errors: Issue[] }`
  - `applyOps(doc: MaquetteDocument, ops: Op[], opts?: { measure?: Measure }): ApplyResult`

- [ ] **Step 1: Écrire les tests (qui échouent)**

`tests/core/ops.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { applyPatches } from 'immer'
import { applyOps, type Measure } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode, MaquetteDocument, TextNode } from '../../src/core/types'
import { docWith, frame, rect, text } from './helpers'

const pageId = (doc: MaquetteDocument) => doc.pages[0]!.id
const ok = (r: ReturnType<typeof applyOps>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r
}

describe('applyOps', () => {
  it('crée un cadre puis un enfant via un identifiant temporaire', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'create', parent: pageId(doc), node: { id: '$hero', type: 'frame', layout: { mode: 'auto' } } },
      { op: 'create', parent: '$hero', node: { type: 'text', content: 'Bonjour' } },
    ]))
    const heroId = r.ids['$hero']!
    const hero = findNode(r.doc, heroId)!.node as FrameNode
    expect(hero).toMatchObject({ x: 0, y: 0 })
    expect(hero.children[0]).toMatchObject({ type: 'text', content: 'Bonjour' })
    expect(hero.children[0]!.x).toBeUndefined()
    expect(doc.pages[0]!.children).toHaveLength(0)
  })

  it('refuse un identifiant non temporaire à la création', () => {
    const doc = docWith([])
    const r = applyOps(doc, [{ op: 'create', parent: pageId(doc), node: { id: 'abc123', type: 'shape' } }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('ops[0].node.id')
  })

  it('un lot dont une opération est fausse n’applique rien', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const before = structuredClone(doc)
    const r = applyOps(doc, [
      { op: 'update', id: 'r00001', set: { name: 'Bloc' } },
      { op: 'update', id: 'r00001', set: { opacity: 0.5 } },
      { op: 'update', id: 'absent', set: { name: 'x' } },
      { op: 'update', id: 'r00001', set: { name: 'Autre' } },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatchObject({ path: 'ops[2].id' })
    expect(doc).toEqual(before)
  })

  it('une modification invalide est refusée avec le chemin de l’opération et de l’élément', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0 })])
    const r = applyOps(doc, [{ op: 'update', id: 'f00001', set: { width: { mode: 'fill' } } }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('ops[0] → pages[0].children[0].width')
  })

  it('les champs id, type et children ne sont pas modifiables', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { type: 'frame' } }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('ops[0].set.type')
  })

  it('null efface une propriété facultative', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0, stroke: { color: '#000000', width: 1, align: 'inside' } })])
    const r = ok(applyOps(doc, [{ op: 'update', id: 'r00001', set: { stroke: null } }]))
    expect(findNode(r.doc, 'r00001')!.node).not.toHaveProperty('stroke')
  })

  it('correction automatique : un parent "hug" passe en fixe quand un enfant devient "fill"', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto', direction: 'row' }, width: { mode: 'hug' } }) as FrameNode
    const measure: Measure = (id) => (id === 'f00001' ? { x: 0, y: 0, width: 321.4, height: 200 } : undefined)
    const r = ok(applyOps(docWith([p]), [{ op: 'create', parent: 'f00001', node: { type: 'shape', width: { mode: 'fill' } } }], { measure }))
    expect((findNode(r.doc, 'f00001')!.node as FrameNode).width).toBe(321)
    expect(r.fixes).toHaveLength(1)
    expect(r.fixes[0]).toContain('f00001')
  })

  it('passer un cadre en mise en page automatique retire x/y des enfants', () => {
    const p = frame('f00001', { x: 0, y: 0 }) as FrameNode
    p.children.push(rect('r00001', { x: 10, y: 20 }))
    const r = ok(applyOps(docWith([p]), [{ op: 'update', id: 'f00001', set: { layout: { mode: 'auto', direction: 'row' } } }]))
    const child = findNode(r.doc, 'r00001')!.node
    expect(child.x).toBeUndefined()
    expect((findNode(r.doc, 'f00001')!.node as FrameNode).layout).toMatchObject({ mode: 'auto', direction: 'row', gap: 0 })
  })

  it('repasser en libre fige les enfants à leur position et taille mesurées', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(rect('r00001', { width: { mode: 'fill' } }))
    const measure: Measure = (id) => (id === 'r00001' ? { x: 5.2, y: 6, width: 77, height: 30 } : undefined)
    const r = ok(applyOps(docWith([p]), [{ op: 'update', id: 'f00001', set: { layout: { mode: 'free' } } }], { measure }))
    expect(findNode(r.doc, 'r00001')!.node).toMatchObject({ x: 5, y: 6, width: 77 })
  })

  it('déplacer un élément dans son propre descendant est refusé', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(frame('f00002', { layout: { mode: 'auto' }, width: 100, height: 100 }))
    const r = applyOps(docWith([p]), [{ op: 'move', id: 'f00001', parent: 'f00002' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('ops[0].parent')
  })

  it('sortir un enfant "fill" d’un cadre automatique le fige et le place', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(rect('r00001', { width: { mode: 'fill' } }))
    const doc = docWith([p])
    const measure: Measure = () => ({ x: 0, y: 0, width: 250, height: 100 })
    const r = ok(applyOps(doc, [{ op: 'move', id: 'r00001', parent: pageId(doc), x: 500, y: 40 }], { measure }))
    expect(r.doc.pages[0]!.children[1]).toMatchObject({ id: 'r00001', x: 500, y: 40, width: 250 })
  })

  it('réordonner dans le même parent', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(rect('r00001'), rect('r00002'), rect('r00003'))
    const r = ok(applyOps(docWith([p]), [{ op: 'move', id: 'r00001', parent: 'f00001', index: 2 }]))
    expect((findNode(r.doc, 'f00001')!.node as FrameNode).children.map((c) => c.id)).toEqual(['r00002', 'r00003', 'r00001'])
  })

  it('supprimer un élément ; impossible de supprimer la dernière page', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = ok(applyOps(doc, [{ op: 'delete', id: 'r00001' }]))
    expect(r.doc.pages[0]!.children).toHaveLength(0)
    const r2 = applyOps(doc, [{ op: 'page.delete', id: pageId(doc) }])
    expect(r2.ok).toBe(false)
  })

  it('pages : créer, renommer', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'page.create', id: '$p', name: 'Contact' },
      { op: 'page.update', id: '$p', name: 'Nous joindre' },
    ]))
    expect(r.doc.pages.map((p) => p.name)).toEqual(['Page 1', 'Nous joindre'])
  })

  it('styles nommés : créer, référencer, refuser la suppression d’un style utilisé', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'style.color.set', id: '$fond', name: 'fond', value: '#F4F1EA' },
      { op: 'create', parent: pageId(doc), node: { type: 'shape', fills: [{ style: '$fond' }] } },
    ]))
    const styleId = r.ids['$fond']!
    expect(r.doc.styles.colors[0]).toEqual({ id: styleId, name: 'fond', value: '#F4F1EA' })
    const shape = r.doc.pages[0]!.children[0]!
    expect(shape.type === 'shape' && shape.fills[0]).toEqual({ style: styleId })
    const r2 = applyOps(r.doc, [{ op: 'style.delete', id: styleId }])
    expect(r2.ok).toBe(false)
  })

  it('modifier la police d’un texte détache son style de texte', () => {
    const doc = docWith([])
    doc.styles.text.push({ id: 's00001', name: 'titre', fontFamily: 'Inter', fontWeight: 700, fontStyle: 'normal', fontSize: 40, lineHeight: 48, letterSpacing: 0 })
    doc.pages[0]!.children.push(text('t00001', { x: 0, y: 0, textStyle: 's00001' }))
    const r = ok(applyOps(doc, [{ op: 'update', id: 't00001', set: { fontSize: 18 } }]))
    expect((findNode(r.doc, 't00001')!.node as TextNode).textStyle).toBeUndefined()
  })

  it('créer puis déplacer le même élément dans un seul lot', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } })])
    const r = ok(applyOps(doc, [
      { op: 'create', parent: pageId(doc), node: { id: '$r', type: 'shape' } },
      { op: 'move', id: '$r', parent: 'f00001' },
    ]))
    expect((findNode(r.doc, 'f00001')!.node as FrameNode).children[0]!.id).toBe(r.ids['$r'])
  })

  it('un identifiant temporaire de style de texte est résolu', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'style.text.set', id: '$t', name: 'titre', fontFamily: 'Inter', fontWeight: 700, fontStyle: 'normal', fontSize: 40, lineHeight: 48, letterSpacing: 0 },
      { op: 'create', parent: pageId(doc), node: { type: 'text', textStyle: '$t' } },
    ]))
    expect((r.doc.pages[0]!.children[0] as TextNode).textStyle).toBe(r.ids['$t'])
  })

  it('les patchs inverses restaurent exactement le document d’origine', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = ok(applyOps(doc, [
      { op: 'update', id: 'r00001', set: { name: 'Bloc', opacity: 0.4 } },
      { op: 'create', parent: pageId(doc), node: { type: 'text', content: 'Été « ok » 🌿' } },
    ]))
    expect(applyPatches(r.doc, r.inversePatches)).toEqual(doc)
  })
})
```

- [ ] **Step 2: Lancer pour constater l'échec**

Run: `npx vitest run tests/core/ops.test.ts`
Expected: FAIL — module `src/core/ops` introuvable.

- [ ] **Step 3: Écrire `src/core/ops.ts`**

```ts
import { current, enablePatches, isDraft, produceWithPatches, type Patch } from 'immer'
import { autoLayoutDefaults, createNode } from './defaults'
import { newId } from './ids'
import { validateDocument, type Issue } from './rules'
import { collectIds, containsId, findNode, isFill, isHug, walk } from './tree'
import type { AutoLayout, Axis, FrameNode, MaquetteDocument, Node, NodeInput, Page, Rect, TextNode, TextStyle } from './types'

enablePatches()

export type Measure = (id: string) => Rect | undefined

export type Op =
  | { op: 'create'; parent: string; index?: number; node: NodeInput & { id?: string } }
  | { op: 'update'; id: string; set: Record<string, unknown> }
  | { op: 'move'; id: string; parent: string; index?: number; x?: number; y?: number }
  | { op: 'delete'; id: string }
  | { op: 'page.create'; id?: string; name: string; index?: number }
  | { op: 'page.update'; id: string; name: string }
  | { op: 'page.delete'; id: string }
  | { op: 'style.color.set'; id?: string; name: string; value: string }
  | ({ op: 'style.text.set'; id?: string } & Omit<TextStyle, 'id'>)
  | { op: 'style.delete'; id: string }

export type ApplyResult =
  | { ok: true; doc: MaquetteDocument; patches: Patch[]; inversePatches: Patch[]; ids: Record<string, string>; fixes: string[] }
  | { ok: false; errors: Issue[] }

class OpError extends Error {
  constructor(public readonly issues: Issue[]) {
    super(issues[0]?.message ?? 'opération refusée')
  }
}

const fail = (i: number, field: string, message: string): never => {
  throw new OpError([{ path: `ops[${i}]${field ? `.${field}` : ''}`, message }])
}

interface Ctx {
  draft: MaquetteDocument
  taken: Set<string>
  ids: Record<string, string>
  fixes: string[]
  measure?: Measure
}

type Container = { kind: 'page'; page: Page } | { kind: 'frame'; node: FrameNode }

const AXES: Axis[] = ['width', 'height']
const LOCKED_KEYS = new Set(['id', 'type', 'children'])
const FONT_KEYS = ['fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeight', 'letterSpacing']

/** Applique un lot d'opérations d'un bloc : tout ou rien. */
export function applyOps(doc: MaquetteDocument, ops: Op[], opts: { measure?: Measure } = {}): ApplyResult {
  const ids: Record<string, string> = {}
  const fixes: string[] = []
  try {
    const [next, patches, inversePatches] = produceWithPatches(doc, (draft) => {
      const ctx: Ctx = { draft: draft as MaquetteDocument, taken: collectIds(draft as MaquetteDocument), ids, fixes, measure: opts.measure }
      ops.forEach((op, i) => {
        applyOne(ctx, op, i)
        normalizeHugFill(ctx)
        const issues = validateDocument(current(draft) as MaquetteDocument)
        if (issues.length) throw new OpError(issues.map((x) => ({ path: `ops[${i}] → ${x.path}`, message: x.message })))
      })
    })
    return { ok: true, doc: next, patches, inversePatches, ids, fixes }
  } catch (e) {
    if (e instanceof OpError) return { ok: false, errors: e.issues }
    throw e
  }
}

function resolve(ctx: Ctx, ref: string, i: number, field: string): string {
  if (!ref.startsWith('$')) return ref
  return ctx.ids[ref] ?? fail(i, field, `identifiant temporaire inconnu : ${ref}`)
}

/** Remplace les identifiants temporaires des références (`{ style: "$…" }`, `textStyle: "$…"`) par les vrais. */
function resolveRefs<T>(ctx: Ctx, value: T, i: number, field: string): T {
  if (Array.isArray(value)) return value.map((v, k) => resolveRefs(ctx, v, i, `${field}[${k}]`)) as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = (k === 'style' || k === 'textStyle') && typeof v === 'string'
        ? resolve(ctx, v, i, `${field}.${k}`)
        : resolveRefs(ctx, v, i, `${field}.${k}`)
    }
    return out as T
  }
  return value
}

function allocate(ctx: Ctx, requested: string | undefined, i: number, field: string): string {
  if (requested !== undefined && !requested.startsWith('$')) {
    fail(i, field, 'Maquette attribue elle-même les identifiants : utiliser un identifiant temporaire « $… »')
  }
  if (requested !== undefined && ctx.ids[requested]) fail(i, field, `identifiant temporaire déjà utilisé : ${requested}`)
  const id = newId(ctx.taken)
  ctx.taken.add(id)
  if (requested !== undefined) ctx.ids[requested] = id
  return id
}

function container(ctx: Ctx, ref: string, i: number, field: string): Container {
  const id = resolve(ctx, ref, i, field)
  const page = ctx.draft.pages.find((p) => p.id === id)
  if (page) return { kind: 'page', page }
  const loc = findNode(ctx.draft, id)
  if (!loc) return fail(i, field, `conteneur introuvable : ${ref}`)
  if (loc.node.type !== 'frame') return fail(i, field, `un élément de type "${loc.node.type}" ne peut pas avoir d’enfants`)
  return { kind: 'frame', node: loc.node }
}

const childrenOf = (c: Container): Node[] => (c.kind === 'page' ? c.page.children : c.node.children)
const isAutoContainer = (c: Container) => c.kind === 'frame' && c.node.layout.mode === 'auto'
const clampIndex = (index: number | undefined, length: number) =>
  index === undefined ? length : Math.max(0, Math.min(index, length))

function toFixed(ctx: Ctx, node: Node, axis: Axis, reason: string): void {
  const size = node[axis]
  if (typeof size === 'number') return
  const value = Math.round(ctx.measure?.(node.id)?.[axis] ?? 100)
  node[axis] = value
  ctx.fixes.push(`${node.name} (${node.id}) : ${axis} passe de "${size.mode}" à ${value} px — ${reason}`)
}

function place(ctx: Ctx, node: Node, x?: number, y?: number): void {
  const r = ctx.measure?.(node.id)
  node.x = Math.round(x ?? node.x ?? r?.x ?? 0)
  node.y = Math.round(y ?? node.y ?? r?.y ?? 0)
}

/** Adapte un élément qui arrive hors du flux d'un cadre automatique. */
function leaveFlow(ctx: Ctx, node: Node, x?: number, y?: number): void {
  for (const axis of AXES) if (isFill(node[axis])) toFixed(ctx, node, axis, '"fill" exige un parent en mise en page automatique')
  delete node.alignSelf
  place(ctx, node, x, y)
}

function applyOne(ctx: Ctx, op: Op, i: number): void {
  switch (op.op) {
    case 'create': {
      const c = container(ctx, op.parent, i, 'parent')
      if ('children' in op.node && op.node.children !== undefined) {
        fail(i, 'node.children', 'créer les enfants avec des opérations "create" séparées (parent: "$…")')
      }
      const { id: requested, ...input } = op.node
      const node = createNode(resolveRefs(ctx, input, i, 'node') as NodeInput, allocate(ctx, requested, i, 'node.id'))
      if (!(isAutoContainer(c) && node.position === 'flow')) {
        node.x ??= 0
        node.y ??= 0
      }
      const list = childrenOf(c)
      list.splice(clampIndex(op.index, list.length), 0, node)
      return
    }
    case 'update': {
      const loc = findNode(ctx.draft, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      const node = loc.node
      const bag = node as unknown as Record<string, unknown>
      for (const [key, value] of Object.entries(op.set)) {
        if (LOCKED_KEYS.has(key)) fail(i, `set.${key}`, `champ non modifiable : ${key}`)
        if (key === 'layout') {
          setLayout(ctx, node, value, i)
          continue
        }
        if (value === null) delete bag[key]
        else if (key === 'textStyle' && typeof value === 'string') bag[key] = resolve(ctx, value, i, 'set.textStyle')
        else bag[key] = structuredClone(resolveRefs(ctx, value, i, `set.${key}`))
      }
      if (node.type === 'text' && FONT_KEYS.some((k) => k in op.set) && !('textStyle' in op.set)) {
        delete (node as TextNode).textStyle
      }
      return
    }
    case 'move': {
      const loc = findNode(ctx.draft, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      const target = container(ctx, op.parent, i, 'parent')
      if (target.kind === 'frame' && containsId(loc.node, target.node.id)) {
        fail(i, 'parent', 'impossible de placer un élément dans lui-même ou dans un de ses descendants')
      }
      // Un élément créé plus tôt dans le même lot n'est pas un brouillon Immer : current() le refuserait.
      const node = (isDraft(loc.node) ? current(loc.node) : loc.node) as Node
      if (isAutoContainer(target) && node.position === 'flow') {
        delete node.x
        delete node.y
      } else {
        if (!isAutoContainer(target)) node.position = 'flow'
        leaveFlow(ctx, node, op.x, op.y)
      }
      ;(loc.parent ? loc.parent.children : loc.page.children).splice(loc.index, 1)
      const list = childrenOf(target)
      list.splice(clampIndex(op.index, list.length), 0, node)
      return
    }
    case 'delete': {
      const loc = findNode(ctx.draft, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      ;(loc.parent ? loc.parent.children : loc.page.children).splice(loc.index, 1)
      return
    }
    case 'page.create': {
      const id = allocate(ctx, op.id, i, 'id')
      ctx.draft.pages.splice(clampIndex(op.index, ctx.draft.pages.length), 0, { id, name: op.name, children: [] })
      return
    }
    case 'page.update': {
      const page = ctx.draft.pages.find((p) => p.id === resolve(ctx, op.id, i, 'id'))
      if (!page) return fail(i, 'id', `page introuvable : ${op.id}`)
      page.name = op.name
      return
    }
    case 'page.delete': {
      if (ctx.draft.pages.length <= 1) fail(i, 'id', 'impossible de supprimer la dernière page')
      const index = ctx.draft.pages.findIndex((p) => p.id === resolve(ctx, op.id, i, 'id'))
      if (index < 0) return fail(i, 'id', `page introuvable : ${op.id}`)
      ctx.draft.pages.splice(index, 1)
      return
    }
    case 'style.color.set': {
      const existing = findStyle(ctx, ctx.draft.styles.colors, op.id, i)
      if (existing) Object.assign(existing, { name: op.name, value: op.value })
      else ctx.draft.styles.colors.push({ id: allocate(ctx, op.id, i, 'id'), name: op.name, value: op.value })
      return
    }
    case 'style.text.set': {
      const { op: _op, id, ...props } = op
      const existing = findStyle(ctx, ctx.draft.styles.text, id, i)
      if (existing) Object.assign(existing, props)
      else ctx.draft.styles.text.push({ id: allocate(ctx, id, i, 'id'), ...props })
      return
    }
    case 'style.delete': {
      const id = resolve(ctx, op.id, i, 'id')
      for (const list of [ctx.draft.styles.colors, ctx.draft.styles.text] as { id: string }[][]) {
        const index = list.findIndex((s) => s.id === id)
        if (index >= 0) {
          list.splice(index, 1)
          return
        }
      }
      return fail(i, 'id', `style introuvable : ${op.id}`)
    }
    default:
      return fail(i, 'op', `opération inconnue : ${(op as { op: string }).op}`)
  }
}

/** Style existant visé par `id` (réel ou temporaire déjà attribué), ou undefined s'il faut le créer. */
function findStyle<T extends { id: string }>(ctx: Ctx, list: T[], id: string | undefined, i: number): T | undefined {
  if (id === undefined) return undefined
  if (id.startsWith('$')) {
    const real = ctx.ids[id]
    return real ? list.find((s) => s.id === real) : undefined
  }
  return list.find((s) => s.id === id) ?? fail(i, 'id', `style introuvable : ${id}`)
}

function setLayout(ctx: Ctx, node: Node, value: unknown, i: number): void {
  if (node.type !== 'frame') return fail(i, 'set.layout', 'seul un cadre a une mise en page')
  const next = value as ({ mode?: string } & Record<string, unknown>) | null
  if (next?.mode === 'free') {
    if (node.layout.mode === 'auto') {
      for (const child of node.children) {
        if (child.position === 'flow') leaveFlow(ctx, child)
        else child.position = 'flow'
      }
      for (const axis of AXES) if (isHug(node[axis])) toFixed(ctx, node, axis, 'un cadre libre ne peut pas s’adapter à son contenu')
    }
    node.layout = { mode: 'free' }
    return
  }
  if (next?.mode === 'auto') {
    const wasFree = node.layout.mode === 'free'
    const base = node.layout.mode === 'auto' ? node.layout : autoLayoutDefaults()
    node.layout = { ...base, ...structuredClone(next), mode: 'auto' } as AutoLayout
    if (wasFree) {
      for (const child of node.children) {
        delete child.x
        delete child.y
      }
    }
    return
  }
  fail(i, 'set.layout', 'layout.mode doit valoir "free" ou "auto"')
}

/** Règle 3 : un cadre "hug" dont un enfant en flux est "fill" sur le même axe passe en fixe. */
function normalizeHugFill(ctx: Ctx): void {
  walk(ctx.draft, ({ node }) => {
    if (node.type !== 'frame' || node.layout.mode !== 'auto') return
    for (const axis of AXES) {
      if (isHug(node[axis]) && node.children.some((c) => c.position === 'flow' && isFill(c[axis]))) {
        toFixed(ctx, node, axis, 'un enfant est en "fill" sur cet axe')
      }
    }
  })
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: tous les tests du dossier PASS (model, rules, ops), typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add src/core/ops.ts tests/core/ops.test.ts
git commit -m "Ajoute les opérations atomiques sur le document avec identifiants temporaires et corrections automatiques"
```

---

### Task 5: Historique annuler / rétablir

**Files:**
- Create: `src/core/history.ts`
- Test: `tests/core/history.test.ts`

**Interfaces:**
- Consumes: `applyOps` (pour les tests), `Patch` d'Immer.
- Produces: `interface HistoryEntry { label: string; patches: Patch[]; inversePatches: Patch[] }`, `class History` avec `push(entry)`, `undo(doc): { doc; label } | null`, `redo(doc): { doc; label } | null`, `canUndo(): boolean`, `canRedo(): boolean`, `clear(): void`, constructeur `new History(limit = 200)`.

- [ ] **Step 1: Écrire les tests (qui échouent)**

`tests/core/history.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { History } from '../../src/core/history'
import { applyOps } from '../../src/core/ops'
import type { MaquetteDocument } from '../../src/core/types'
import { docWith, rect } from './helpers'

function edit(doc: MaquetteDocument, name: string, history: History): MaquetteDocument {
  const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { name } }])
  if (!r.ok) throw new Error('échec')
  history.push({ label: `Renommer en ${name}`, patches: r.patches, inversePatches: r.inversePatches })
  return r.doc
}
const nameOf = (doc: MaquetteDocument) => doc.pages[0]!.children[0]!.name

describe('History', () => {
  it('annule puis rétablit avec les libellés', () => {
    const h = new History()
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = edit(doc, 'B', h)
    doc = edit(doc, 'C', h)
    const u = h.undo(doc)!
    expect(u.label).toBe('Renommer en C')
    expect(nameOf(u.doc)).toBe('B')
    const r = h.redo(u.doc)!
    expect(nameOf(r.doc)).toBe('C')
  })

  it('une nouvelle modification efface le futur', () => {
    const h = new History()
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = edit(doc, 'B', h)
    doc = h.undo(doc)!.doc
    expect(h.canRedo()).toBe(true)
    edit(doc, 'Z', h)
    expect(h.canRedo()).toBe(false)
  })

  it('ignore les entrées vides et renvoie null quand il n’y a rien à faire', () => {
    const h = new History()
    h.push({ label: 'rien', patches: [], inversePatches: [] })
    expect(h.canUndo()).toBe(false)
    expect(h.undo(docWith([]))).toBeNull()
    expect(h.redo(docWith([]))).toBeNull()
  })

  it('respecte la limite d’entrées', () => {
    const h = new History(2)
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = edit(doc, 'B', h)
    doc = edit(doc, 'C', h)
    doc = edit(doc, 'D', h)
    doc = h.undo(doc)!.doc
    doc = h.undo(doc)!.doc
    expect(nameOf(doc)).toBe('B')
    expect(h.canUndo()).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer pour constater l'échec**

Run: `npx vitest run tests/core/history.test.ts`
Expected: FAIL — module `src/core/history` introuvable.

- [ ] **Step 3: Écrire `src/core/history.ts`**

```ts
import { applyPatches, enablePatches, type Patch } from 'immer'
import type { MaquetteDocument } from './types'

enablePatches()

export interface HistoryEntry { label: string; patches: Patch[]; inversePatches: Patch[] }

export class History {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []

  constructor(private readonly limit = 200) {}

  push(entry: HistoryEntry): void {
    if (entry.patches.length === 0) return
    this.past.push(entry)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }

  undo(doc: MaquetteDocument): { doc: MaquetteDocument; label: string } | null {
    const entry = this.past.pop()
    if (!entry) return null
    this.future.push(entry)
    return { doc: applyPatches(doc, entry.inversePatches), label: entry.label }
  }

  redo(doc: MaquetteDocument): { doc: MaquetteDocument; label: string } | null {
    const entry = this.future.pop()
    if (!entry) return null
    this.past.push(entry)
    return { doc: applyPatches(doc, entry.patches), label: entry.label }
  }

  canUndo(): boolean { return this.past.length > 0 }
  canRedo(): boolean { return this.future.length > 0 }

  clear(): void {
    this.past = []
    this.future = []
  }
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/history.test.ts && npm run typecheck`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/history.ts tests/core/history.test.ts
git commit -m "Ajoute l'historique annuler/rétablir par patchs"
```

---

### Task 6: Format de fichier `.maquette`

**Files:**
- Create: `src/core/format.ts`
- Test: `tests/core/format.test.ts`

**Interfaces:**
- Consumes: `validateDocument`, `Issue` (rules.ts).
- Produces: `CURRENT_VERSION = 1`, `type ParseResult = { ok: true; doc: MaquetteDocument } | { ok: false; errors: Issue[] }`, `parseDocument(text: string): ParseResult`, `serializeDocument(doc: MaquetteDocument): string`.

- [ ] **Step 1: Écrire les tests (qui échouent)**

`tests/core/format.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { parseDocument, serializeDocument } from '../../src/core/format'
import { docWith, text } from './helpers'

describe('format .maquette', () => {
  it('aller-retour exact, y compris accents, guillemets, emoji et retours à la ligne', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0, content: 'Été « ok » 🌿\nligne 2' })])
    const textOut = serializeDocument(doc)
    const back = parseDocument(textOut)
    expect(back).toEqual({ ok: true, doc })
    expect(textOut.endsWith('\n')).toBe(true)
    expect(textOut).toContain('\n  "format": "maquette"')
    expect(textOut).toContain('Été « ok » 🌿')
  })

  it('JSON cassé : message clair', () => {
    const r = parseDocument('{ "format": ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/^JSON invalide/)
  })

  it('autre format : refusé', () => {
    const r = parseDocument('{"hello": 1}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toEqual({ path: 'format', message: 'ce fichier n’est pas un document Maquette' })
  })

  it('version future : refusée avec un message explicite', () => {
    const r = parseDocument(JSON.stringify({ format: 'maquette', version: 99, styles: { colors: [], text: [] }, pages: [] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.message).toContain('plus récente')
  })

  it('version absente : refusée', () => {
    const r = parseDocument(JSON.stringify({ format: 'maquette' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('version')
  })

  it('document invalide selon les règles : erreurs avec chemin', () => {
    const doc = docWith([text('t00001', { content: 'sans position' })])
    const r = parseDocument(JSON.stringify(doc))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('pages[0].children[0].x')
  })
})
```

- [ ] **Step 2: Lancer pour constater l'échec**

Run: `npx vitest run tests/core/format.test.ts`
Expected: FAIL — module `src/core/format` introuvable.

- [ ] **Step 3: Écrire `src/core/format.ts`**

```ts
import { validateDocument, type Issue } from './rules'
import type { MaquetteDocument } from './types'

export const CURRENT_VERSION = 1

/** migrations[n] transforme un document du format n en format n + 1. */
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {}

export type ParseResult = { ok: true; doc: MaquetteDocument } | { ok: false; errors: Issue[] }

const refuse = (path: string, message: string): ParseResult => ({ ok: false, errors: [{ path, message }] })

export function parseDocument(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return refuse('', `JSON invalide : ${(e as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== 'maquette') {
    return refuse('format', 'ce fichier n’est pas un document Maquette')
  }
  let data = raw as Record<string, unknown>
  const version = data.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return refuse('version', 'version du format absente ou invalide')
  }
  if (version > CURRENT_VERSION) {
    return refuse(
      'version',
      `fichier créé par une version plus récente de Maquette (format ${version} ; cette app lit jusqu’au format ${CURRENT_VERSION})`,
    )
  }
  for (let n = version; n < CURRENT_VERSION; n++) {
    const migrate = migrations[n]
    if (!migrate) return refuse('version', `aucune mise à niveau connue depuis le format ${n}`)
    data = migrate(data)
  }
  const issues = validateDocument(data as unknown as MaquetteDocument)
  if (issues.length) return { ok: false, errors: issues }
  return { ok: true, doc: data as unknown as MaquetteDocument }
}

export function serializeDocument(doc: MaquetteDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/format.test.ts && npm run typecheck`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/format.ts tests/core/format.test.ts
git commit -m "Ajoute la lecture et l'écriture du format .maquette avec versions et migrations"
```

---

### Task 7: Traduction élément → CSS

**Files:**
- Create: `src/core/css.ts`
- Test: `tests/core/css.test.ts`

**Interfaces:**
- Consumes: types (types.ts).
- Produces: `type CSS = Record<string, string | number>`, `MISSING_COLOR = '#FF00FF'`, `resolveColor(c: Color, styles: DocStyles): string`, `nodeCss(node: Node, parent: FrameNode | null, styles: DocStyles, index?: number): CSS` — clés en camelCase (compatibles avec l'attribut `style` de React), longueurs en chaînes `"Npx"`. `parent === null` signifie « posé directement sur la page ».

- [ ] **Step 1: Écrire les tests (qui échouent)**

`tests/core/css.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { nodeCss, resolveColor, MISSING_COLOR } from '../../src/core/css'
import type { DocStyles, FrameNode } from '../../src/core/types'
import { frame, rect, text } from './helpers'

const styles: DocStyles = {
  colors: [{ id: 'c00001', name: 'accent', value: '#C2410C' }],
  text: [{ id: 's00001', name: 'titre', fontFamily: 'Fraunces', fontWeight: 600, fontStyle: 'normal', fontSize: 64, lineHeight: 68, letterSpacing: -1.5 }],
}
const autoRow = (props = {}) =>
  frame('f00001', { x: 0, y: 0, layout: { mode: 'auto', direction: 'row', gap: 12, padding: [1, 2, 3, 4], justify: 'center', align: 'end', ...props } }) as FrameNode

describe('nodeCss', () => {
  it('cadre libre posé sur la page', () => {
    const css = nodeCss(frame('f00001', { x: 10, y: 20 }), null, styles)
    expect(css).toMatchObject({ position: 'absolute', left: '10px', top: '20px', width: '400px', height: '300px', boxSizing: 'border-box', backgroundColor: '#FFFFFF' })
    expect(css.display).toBeUndefined()
  })

  it('cadre automatique en ligne', () => {
    expect(nodeCss(autoRow(), null, styles)).toMatchObject({
      display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', padding: '1px 2px 3px 4px',
      justifyContent: 'center', alignItems: 'flex-end', columnGap: '12px', rowGap: '12px',
    })
  })

  it('espacement "auto" = space-between', () => {
    expect(nodeCss(autoRow({ gap: 'auto' }), null, styles)).toMatchObject({ justifyContent: 'space-between', columnGap: '0px' })
  })

  it('cadre automatique "hug" sur la page = fit-content', () => {
    const f = frame('f00001', { x: 0, y: 0, width: { mode: 'hug' }, layout: { mode: 'auto' } })
    expect(nodeCss(f, null, styles)).toMatchObject({ width: 'fit-content' })
  })

  it('enfants d’une ligne : fixe, fill et hug sur les deux axes', () => {
    const parent = autoRow()
    expect(nodeCss(rect('r00001', { width: 50, height: 20 }), parent, styles)).toMatchObject({ position: 'relative', width: '50px', flexShrink: 0, height: '20px' })
    const fill = nodeCss(rect('r00002', { width: { mode: 'fill' }, height: { mode: 'fill' } }), parent, styles)
    expect(fill).toMatchObject({ flex: '1 1 0', minWidth: '0px', alignSelf: 'stretch' })
    expect(fill.width).toBeUndefined()
    expect(fill.height).toBeUndefined()
    const hug = nodeCss(text('t00001'), parent, styles)
    expect(hug).toMatchObject({ flex: '0 0 auto' })
    expect(hug.width).toBeUndefined()
  })

  it('min/max et alignSelf explicite', () => {
    const css = nodeCss(rect('r00001', { width: { mode: 'fill' }, minWidth: 80, maxWidth: 400, alignSelf: 'center' }), autoRow(), styles)
    expect(css).toMatchObject({ minWidth: '80px', maxWidth: '400px', alignSelf: 'center' })
  })

  it('enfant absolu dans un cadre automatique, enfant d’un cadre libre', () => {
    expect(nodeCss(rect('r00001', { position: 'absolute', x: 5, y: 6 }), autoRow(), styles)).toMatchObject({ position: 'absolute', left: '5px', top: '6px' })
    const free = frame('f00002', { x: 0, y: 0 }) as FrameNode
    expect(nodeCss(rect('r00002', { x: 7, y: 8 }), free, styles)).toMatchObject({ position: 'absolute', left: '7px', top: '8px' })
  })

  it('texte : police, interligne et espacement en px, couleur nommée, pas de retour en "auto"', () => {
    const css = nodeCss(text('t00001', { x: 0, y: 0, fontSize: 20, lineHeight: 24, letterSpacing: -0.5, color: { style: 'c00001' } }), null, styles)
    expect(css).toMatchObject({ fontFamily: '"Inter"', fontSize: '20px', lineHeight: '24px', letterSpacing: '-0.5px', color: '#C2410C', whiteSpace: 'pre', margin: 0, fontOpticalSizing: 'auto' })
  })

  it('texte avec style nommé : le style l’emporte', () => {
    const css = nodeCss(text('t00001', { x: 0, y: 0, textStyle: 's00001', textSizing: 'auto' }), null, styles)
    expect(css).toMatchObject({ fontFamily: '"Fraunces"', fontWeight: 600, fontSize: '64px', lineHeight: '68px', letterSpacing: '-1.5px' })
  })

  it('texte à hauteur automatique : retour à la ligne', () => {
    const css = nodeCss(text('t00001', { x: 0, y: 0, width: 300, textSizing: 'auto-height' }), null, styles)
    expect(css).toMatchObject({ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: '300px' })
  })

  it('plusieurs remplissages : le premier est dessous', () => {
    const css = nodeCss(rect('r00001', { x: 0, y: 0, fills: ['#FFFFFF', '#000000'] }), null, styles)
    expect(css.backgroundImage).toBe('linear-gradient(#000000, #000000), linear-gradient(#FFFFFF, #FFFFFF)')
    expect(css.backgroundColor).toBeUndefined()
  })

  it('contour intérieur + ombre ; contour centré en outline', () => {
    const a = nodeCss(rect('r00001', { x: 0, y: 0, stroke: { color: '#FF0000', width: 2, align: 'inside' }, shadows: [{ x: 0, y: 4, blur: 8, spread: 0, color: '#00000040', inset: false }] }), null, styles)
    expect(a.boxShadow).toBe('inset 0 0 0 2px #FF0000, 0px 4px 8px 0px #00000040')
    const b = nodeCss(rect('r00002', { x: 0, y: 0, stroke: { color: '#FF0000', width: 2, align: 'center' } }), null, styles)
    expect(b).toMatchObject({ outline: '2px solid #FF0000', outlineOffset: '-1px' })
  })

  it('arrondis, ellipse, opacité, caché, rognage', () => {
    expect(nodeCss(rect('r00001', { x: 0, y: 0, radius: [1, 2, 3, 4] }), null, styles).borderRadius).toBe('1px 2px 3px 4px')
    expect(nodeCss(rect('r00002', { x: 0, y: 0, shape: 'ellipse' }), null, styles).borderRadius).toBe('50%')
    expect(nodeCss(rect('r00003', { x: 0, y: 0, opacity: 0.5 }), null, styles).opacity).toBe(0.5)
    const hidden = frame('f00002', { x: 0, y: 0, visible: false, clip: true, layout: { mode: 'auto' } })
    expect(nodeCss(hidden, null, styles)).toMatchObject({ display: 'none', overflow: 'hidden' })
  })

  it('premier enfant au-dessus (reverseZ)', () => {
    const parent = autoRow({ reverseZ: true })
    parent.children.push(rect('r00001'), rect('r00002'))
    expect(nodeCss(parent.children[0]!, parent, styles, 0).zIndex).toBe(2)
    expect(nodeCss(parent.children[1]!, parent, styles, 1).zIndex).toBe(1)
  })

  it('couleur nommée inconnue : magenta visible', () => {
    expect(resolveColor({ style: 'absent' }, styles)).toBe(MISSING_COLOR)
  })
})
```

- [ ] **Step 2: Lancer pour constater l'échec**

Run: `npx vitest run tests/core/css.test.ts`
Expected: FAIL — module `src/core/css` introuvable.

- [ ] **Step 3: Écrire `src/core/css.ts`**

```ts
import type { Axis, Color, DocStyles, FrameNode, Node, Radius, Shadow, Stroke } from './types'

export type CSS = Record<string, string | number>

export const MISSING_COLOR = '#FF00FF'

const px = (n: number) => `${n}px`
const FLEX_ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' } as const
const FLEX_JUSTIFY = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  'space-between': 'space-between', 'space-around': 'space-around', 'space-evenly': 'space-evenly',
} as const

export function resolveColor(c: Color, styles: DocStyles): string {
  if (typeof c === 'string') return c
  return styles.colors.find((s) => s.id === c.style)?.value ?? MISSING_COLOR
}

const radiusCss = (r: Radius) => (typeof r === 'number' ? px(r) : r.map(px).join(' '))

const shadowCss = (s: Shadow, styles: DocStyles) =>
  `${s.inset ? 'inset ' : ''}${px(s.x)} ${px(s.y)} ${px(s.blur)} ${px(s.spread)} ${resolveColor(s.color, styles)}`

/** Styles CSS d'un élément. `parent === null` : élément posé directement sur la page. */
export function nodeCss(node: Node, parent: FrameNode | null, styles: DocStyles, index = 0): CSS {
  const css: CSS = { boxSizing: 'border-box' }
  const parentAuto = parent?.layout.mode === 'auto' ? parent.layout : null
  const inFlow = parentAuto !== null && node.position === 'flow'

  if (inFlow) css.position = 'relative'
  else {
    css.position = 'absolute'
    css.left = px(node.x ?? 0)
    css.top = px(node.y ?? 0)
  }

  for (const axis of ['width', 'height'] as Axis[]) {
    const size = node[axis]
    const isMain = parentAuto !== null && inFlow && (parentAuto.direction === 'row') === (axis === 'width')
    if (typeof size === 'number') {
      css[axis] = px(size)
      if (isMain) css.flexShrink = 0
    } else if (size.mode === 'hug') {
      if (isMain) css.flex = '0 0 auto'
      else if (!inFlow) css[axis] = 'fit-content'
    } else if (isMain) {
      css.flex = '1 1 0'
      css[axis === 'width' ? 'minWidth' : 'minHeight'] = '0px'
    } else {
      css.alignSelf = 'stretch'
    }
  }
  if (node.minWidth !== undefined) css.minWidth = px(node.minWidth)
  if (node.maxWidth !== undefined) css.maxWidth = px(node.maxWidth)
  if (node.minHeight !== undefined) css.minHeight = px(node.minHeight)
  if (node.maxHeight !== undefined) css.maxHeight = px(node.maxHeight)
  if (node.alignSelf !== undefined) css.alignSelf = FLEX_ALIGN[node.alignSelf]
  if (parentAuto?.reverseZ && parent) css.zIndex = parent.children.length - index

  if (node.opacity !== 1) css.opacity = node.opacity

  switch (node.type) {
    case 'frame': {
      if (node.layout.mode === 'auto') {
        const l = node.layout
        const main = l.gap === 'auto' ? 0 : l.gap
        const cross = l.rowGap ?? main
        Object.assign(css, {
          display: 'flex',
          flexDirection: l.direction,
          flexWrap: l.wrap ? 'wrap' : 'nowrap',
          padding: l.padding.map(px).join(' '),
          justifyContent: l.gap === 'auto' ? 'space-between' : FLEX_JUSTIFY[l.justify],
          alignItems: FLEX_ALIGN[l.align],
          columnGap: px(l.direction === 'row' ? main : cross),
          rowGap: px(l.direction === 'row' ? cross : main),
        })
      }
      if (node.clip) css.overflow = 'hidden'
      paint(css, node.fills, node.stroke, node.shadows, styles)
      css.borderRadius = radiusCss(node.radius)
      break
    }
    case 'shape':
      paint(css, node.fills, node.stroke, node.shadows, styles)
      css.borderRadius = node.shape === 'ellipse' ? '50%' : radiusCss(node.radius)
      break
    case 'image':
      paint(css, [], node.stroke, node.shadows, styles)
      css.borderRadius = radiusCss(node.radius)
      css.objectFit = node.fit
      css.display = 'block'
      break
    case 'text': {
      const ts = node.textStyle ? styles.text.find((s) => s.id === node.textStyle) : undefined
      const f = ts ?? node
      Object.assign(css, {
        fontFamily: `"${f.fontFamily}"`,
        fontWeight: f.fontWeight,
        fontStyle: f.fontStyle,
        fontSize: px(f.fontSize),
        lineHeight: px(f.lineHeight),
        letterSpacing: px(f.letterSpacing),
        fontOpticalSizing: 'auto',
        textAlign: node.textAlign,
        color: resolveColor(node.color, styles),
        whiteSpace: node.textSizing === 'auto' ? 'pre' : 'pre-wrap',
        margin: 0,
      })
      if (node.textSizing !== 'auto') css.overflowWrap = 'break-word'
      break
    }
  }

  if (!node.visible) css.display = 'none'
  return css
}

function paint(css: CSS, fills: Color[], stroke: Stroke | undefined, shadows: Shadow[], styles: DocStyles): void {
  const colors = fills.map((c) => resolveColor(c, styles))
  if (colors.length === 1) css.backgroundColor = colors[0]!
  else if (colors.length > 1) css.backgroundImage = [...colors].reverse().map((c) => `linear-gradient(${c}, ${c})`).join(', ')

  const layers: string[] = []
  if (stroke) {
    const c = resolveColor(stroke.color, styles)
    if (stroke.align === 'inside') layers.push(`inset 0 0 0 ${px(stroke.width)} ${c}`)
    else if (stroke.align === 'outside') layers.push(`0 0 0 ${px(stroke.width)} ${c}`)
    else {
      css.outline = `${px(stroke.width)} solid ${c}`
      css.outlineOffset = px(-stroke.width / 2)
    }
  }
  for (const s of shadows) layers.push(shadowCss(s, styles))
  if (layers.length) css.boxShadow = layers.join(', ')
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/css.test.ts && npm run typecheck`
Expected: 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/css.ts tests/core/css.test.ts
git commit -m "Ajoute la traduction des éléments en styles CSS (tailles fixe/hug/fill, flexbox, peinture)"
```

---

### Task 8: Store du document et affichage dans la fenêtre

**Files:**
- Create: `src/shared/ipc.ts`, `src/renderer/global.d.ts`, `src/renderer/state/store.ts`, `src/renderer/canvas/DocumentView.tsx`, `src/renderer/canvas/NodeView.tsx`, `src/renderer/canvas/measure.ts`
- Modify: `src/main/index.ts` (fichier passé en argument + `doc:initial`), `src/preload/index.ts`, `src/renderer/App.tsx`, `src/renderer/main.tsx`, `src/renderer/app.css`
- Test: `tests/renderer/store.test.ts`, `e2e/document.spec.ts`, `e2e/fixtures/demo.maquette`, `e2e/fixtures/pas-une-maquette.maquette`

**Interfaces:**
- Consumes: `applyOps`, `Op`, `ApplyResult`, `Measure` (ops.ts), `History` (history.ts), `parseDocument` (format.ts), `newDocument` (defaults.ts), `nodeCss` (css.ts).
- Produces:
  - `src/shared/ipc.ts` : `interface OpenedFile { path: string; text: string }`, `type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo'`, `interface MaquetteApi { getInitialDocument(): Promise<OpenedFile | null> }` (étendue en Task 9).
  - `docStore` (Zustand vanilla) avec l'état `DocState` : `doc`, `filePath: string | null`, `dirty: boolean`, `pageId: string`, `notice: string | null`, `canUndo: boolean`, `canRedo: boolean` et les actions `load(doc, path)`, `showError(message)`, `dispatch(ops: Op[], label: string): ApplyResult`, `undo()`, `redo()`, `markSaved(path)`, `setMeasure(fn: Measure)`. Hook `useDoc(selector)`.
  - `domMeasure: Measure` (measure.ts). Attributs DOM : `data-node-id` sur chaque élément, `data-testid="world"` sur la page affichée, `role="alert"` sur le bandeau d'erreur.
  - Lancement : `Maquette.exe <chemin.maquette>` ouvre ce fichier au démarrage.

- [ ] **Step 1: Écrire le test du store (qui échoue)**

`tests/renderer/store.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { docStore } from '../../src/renderer/state/store'
import { docWith, rect } from '../core/helpers'

beforeEach(() => {
  docStore.getState().load(docWith([rect('r00001', { x: 0, y: 0, name: 'A' })]), 'C:/x/demo.maquette')
})

describe('docStore', () => {
  it('charger remet l’état à zéro', () => {
    const s = docStore.getState()
    expect(s).toMatchObject({ dirty: false, canUndo: false, canRedo: false, filePath: 'C:/x/demo.maquette', notice: null })
    expect(s.pageId).toBe(s.doc.pages[0]!.id)
  })

  it('une modification réussie marque le document modifié et annulable', () => {
    const r = docStore.getState().dispatch([{ op: 'update', id: 'r00001', set: { name: 'B' } }], 'Renommer')
    expect(r.ok).toBe(true)
    expect(docStore.getState()).toMatchObject({ dirty: true, canUndo: true })
  })

  it('un lot refusé ne change rien et ne pollue pas l’historique', () => {
    const before = docStore.getState().doc
    const r = docStore.getState().dispatch([{ op: 'update', id: 'absent', set: { name: 'B' } }], 'Raté')
    expect(r.ok).toBe(false)
    expect(docStore.getState().doc).toBe(before)
    expect(docStore.getState()).toMatchObject({ dirty: false, canUndo: false })
  })

  it('annuler après un lot refusé porte sur la dernière modification réussie', () => {
    const s = docStore.getState()
    s.dispatch([{ op: 'update', id: 'r00001', set: { name: 'B' } }], 'Renommer')
    s.dispatch([{ op: 'update', id: 'absent', set: { name: 'C' } }], 'Raté')
    docStore.getState().undo()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('A')
    expect(docStore.getState().canRedo).toBe(true)
    docStore.getState().redo()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('B')
  })

  it('enregistrer efface l’indicateur de modification', () => {
    docStore.getState().dispatch([{ op: 'update', id: 'r00001', set: { name: 'B' } }], 'Renommer')
    docStore.getState().markSaved('C:/x/autre.maquette')
    expect(docStore.getState()).toMatchObject({ dirty: false, filePath: 'C:/x/autre.maquette' })
  })
})
```

- [ ] **Step 2: Lancer pour constater l'échec**

Run: `npx vitest run tests/renderer/store.test.ts`
Expected: FAIL — module `src/renderer/state/store` introuvable.

- [ ] **Step 3: Écrire les types partagés et le store**

`src/shared/ipc.ts` :
```ts
export interface OpenedFile { path: string; text: string }
export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo'

export interface MaquetteApi {
  getInitialDocument(): Promise<OpenedFile | null>
}
```

`src/renderer/global.d.ts` :
```ts
import type { MaquetteApi } from '../shared/ipc'

declare global {
  interface Window {
    maquette: MaquetteApi
  }
}

export {}
```

`src/renderer/state/store.ts` :
```ts
import { createStore, useStore } from 'zustand'
import { History } from '../../core/history'
import { applyOps, type ApplyResult, type Measure, type Op } from '../../core/ops'
import type { MaquetteDocument } from '../../core/types'
import { newDocument } from '../../core/defaults'

export interface DocState {
  doc: MaquetteDocument
  filePath: string | null
  dirty: boolean
  pageId: string
  notice: string | null
  canUndo: boolean
  canRedo: boolean
  load(doc: MaquetteDocument, path: string | null): void
  showError(message: string): void
  dispatch(ops: Op[], label: string): ApplyResult
  undo(): void
  redo(): void
  markSaved(path: string): void
  setMeasure(fn: Measure): void
}

const history = new History()
let measure: Measure | undefined

const initial = newDocument()

export const docStore = createStore<DocState>()((set, get) => ({
  doc: initial,
  filePath: null,
  dirty: false,
  pageId: initial.pages[0]!.id,
  notice: null,
  canUndo: false,
  canRedo: false,

  load(doc, path) {
    history.clear()
    set({ doc, filePath: path, dirty: false, pageId: doc.pages[0]!.id, notice: null, canUndo: false, canRedo: false })
  },

  showError(message) {
    set({ notice: message })
  },

  dispatch(ops, label) {
    const result = applyOps(get().doc, ops, { measure })
    if (result.ok) {
      history.push({ label, patches: result.patches, inversePatches: result.inversePatches })
      set({ doc: result.doc, dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
    }
    return result
  },

  undo() {
    const r = history.undo(get().doc)
    if (r) set({ doc: r.doc, dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
  },

  redo() {
    const r = history.redo(get().doc)
    if (r) set({ doc: r.doc, dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
  },

  markSaved(path) {
    set({ filePath: path, dirty: false })
  },

  setMeasure(fn) {
    measure = fn
  },
}))

export function useDoc<T>(selector: (s: DocState) => T): T {
  return useStore(docStore, selector)
}
```

- [ ] **Step 4: Lancer le test du store**

Run: `npx vitest run tests/renderer/store.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Écrire les fixtures et le test e2e d'affichage (qui échoue)**

`e2e/fixtures/demo.maquette` :
```json
{
  "format": "maquette",
  "version": 1,
  "styles": { "colors": [{ "id": "cAccnt", "name": "accent", "value": "#C2410C" }], "text": [] },
  "pages": [
    {
      "id": "pAccue",
      "name": "Accueil",
      "children": [
        {
          "id": "fHero1", "type": "frame", "name": "Hero", "visible": true, "locked": false, "opacity": 1,
          "width": 600, "height": { "mode": "hug" }, "x": 40, "y": 40, "position": "flow",
          "children": [
            {
              "id": "tTitre", "type": "text", "name": "Titre", "visible": true, "locked": false, "opacity": 1,
              "width": { "mode": "hug" }, "height": { "mode": "hug" }, "position": "flow",
              "content": "Bonjour Maquette", "fontFamily": "Arial", "fontWeight": 700, "fontStyle": "normal",
              "fontSize": 40, "lineHeight": 48, "letterSpacing": 0, "textAlign": "left",
              "color": { "style": "cAccnt" }, "textSizing": "auto"
            },
            {
              "id": "tSuite", "type": "text", "name": "Suite", "visible": true, "locked": false, "opacity": 1,
              "width": { "mode": "hug" }, "height": { "mode": "hug" }, "position": "flow",
              "content": "Été « deuxième » ligne", "fontFamily": "Arial", "fontWeight": 400, "fontStyle": "normal",
              "fontSize": 18, "lineHeight": 22, "letterSpacing": 0, "textAlign": "left",
              "color": "#111111", "textSizing": "auto"
            }
          ],
          "layout": { "mode": "auto", "direction": "column", "gap": 16, "padding": [24, 24, 24, 24], "justify": "start", "align": "start", "wrap": false, "reverseZ": false },
          "fills": ["#FFFFFF"], "radius": 12, "shadows": [], "clip": false
        }
      ]
    }
  ]
}
```

`e2e/fixtures/pas-une-maquette.maquette` :
```json
{ "hello": 1 }
```

`e2e/document.spec.ts` :
```ts
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { launch } from './launch'

const fixture = (name: string) => join(__dirname, 'fixtures', name)

test('un document passé en argument est affiché avec sa mise en page automatique', async () => {
  const { app, page } = await launch([fixture('demo.maquette')])
  const titre = page.locator('[data-node-id="tTitre"]')
  const suite = page.locator('[data-node-id="tSuite"]')
  await expect(titre).toHaveText('Bonjour Maquette')
  await expect(suite).toHaveText('Été « deuxième » ligne')
  await expect(titre).toHaveCSS('color', 'rgb(194, 65, 12)')
  await expect(page.locator('[data-node-id="fHero1"]')).toHaveCSS('display', 'flex')
  const a = (await titre.boundingBox())!
  const b = (await suite.boundingBox())!
  expect(Math.round(b.y - a.y)).toBe(48 + 16)
  await app.close()
})

test('un fichier qui n’est pas une maquette affiche une alerte au lieu de planter', async () => {
  const { app, page } = await launch([fixture('pas-une-maquette.maquette')])
  await expect(page.getByRole('alert')).toContainText('n’est pas un document Maquette')
  await expect(page.getByTestId('world')).toBeVisible()
  await app.close()
})
```

- [ ] **Step 6: Lancer pour constater l'échec**

Run: `npm run e2e -- e2e/document.spec.ts`
Expected: FAIL — aucun élément `[data-node-id="tTitre"]`.

- [ ] **Step 7: Passer le fichier d'argument du principal à la fenêtre**

`src/main/index.ts` (remplace le fichier) :
```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenedFile } from '../shared/ipc'

const fileArg = process.argv.slice(1).find((a) => a.toLowerCase().endsWith('.maquette'))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Maquette',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  const e2e = process.env.MAQUETTE_E2E === '1'
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL + (e2e ? '?e2e=1' : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), e2e ? { query: { e2e: '1' } } : undefined)
  }
  return win
}

ipcMain.handle('doc:initial', async (): Promise<OpenedFile | null> => {
  if (!fileArg) return null
  return { path: fileArg, text: await readFile(fileArg, 'utf8') }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts` (remplace le fichier) :
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { MaquetteApi, OpenedFile } from '../shared/ipc'

const api: MaquetteApi = {
  getInitialDocument: () => ipcRenderer.invoke('doc:initial') as Promise<OpenedFile | null>,
}

contextBridge.exposeInMainWorld('maquette', api)
```

- [ ] **Step 8: Écrire la mesure, l'affichage et l'app**

`src/renderer/canvas/measure.ts` :
```ts
import type { Measure } from '../../core/ops'

/** Le zoom de la caméra arrive au plan 2 ; jusque-là le monde est affiché à l'échelle 1. */
const ZOOM = 1

export const domMeasure: Measure = (id) => {
  const el = document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)
  if (!el) return undefined
  const origin = el.parentElement?.closest('[data-node-id]') ?? document.querySelector('[data-testid="world"]')
  if (!origin) return undefined
  const r = el.getBoundingClientRect()
  const o = origin.getBoundingClientRect()
  return { x: (r.left - o.left) / ZOOM, y: (r.top - o.top) / ZOOM, width: r.width / ZOOM, height: r.height / ZOOM }
}
```

`src/renderer/canvas/NodeView.tsx` :
```tsx
import type { CSSProperties } from 'react'
import { nodeCss } from '../../core/css'
import type { FrameNode, Node } from '../../core/types'
import { useDoc } from '../state/store'

export function NodeView({ node, parent, index }: { node: Node; parent: FrameNode | null; index: number }) {
  const styles = useDoc((s) => s.doc.styles)
  const style = nodeCss(node, parent, styles, index) as CSSProperties
  switch (node.type) {
    case 'frame':
      return (
        <div data-node-id={node.id} style={style}>
          {node.children.map((child, i) => (
            <NodeView key={child.id} node={child} parent={node} index={i} />
          ))}
        </div>
      )
    case 'text':
      return <div data-node-id={node.id} style={style}>{node.content}</div>
    case 'shape':
      return <div data-node-id={node.id} style={style} />
    case 'image':
      return <img data-node-id={node.id} style={style} src={node.src} alt="" draggable={false} />
  }
}
```

`src/renderer/canvas/DocumentView.tsx` :
```tsx
import { useDoc } from '../state/store'
import { NodeView } from './NodeView'

export function DocumentView() {
  const page = useDoc((s) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]!)
  return (
    <div className="canvas">
      <div className="world" data-testid="world">
        {page.children.map((node, i) => (
          <NodeView key={node.id} node={node} parent={null} index={i} />
        ))}
      </div>
    </div>
  )
}
```

`src/renderer/App.tsx` (remplace le fichier) :
```tsx
import { useEffect } from 'react'
import { parseDocument } from '../core/format'
import { DocumentView } from './canvas/DocumentView'
import { domMeasure } from './canvas/measure'
import { docStore, useDoc } from './state/store'

const fileName = (path: string | null) => (path ? (path.split(/[\\/]/).pop() ?? path) : 'Sans titre')

export function App() {
  const notice = useDoc((s) => s.notice)
  const filePath = useDoc((s) => s.filePath)
  const dirty = useDoc((s) => s.dirty)

  useEffect(() => {
    docStore.getState().setMeasure(domMeasure)
    void window.maquette.getInitialDocument().then((file) => {
      if (!file) return
      const parsed = parseDocument(file.text)
      if (parsed.ok) docStore.getState().load(parsed.doc, file.path)
      else docStore.getState().showError(`Impossible d’ouvrir ${fileName(file.path)} : ${parsed.errors[0]!.message}`)
    })
  }, [])

  useEffect(() => {
    document.title = `${fileName(filePath)}${dirty ? ' •' : ''} — Maquette`
  }, [filePath, dirty])

  return (
    <div data-testid="app-root" className="app">
      {notice && (
        <div role="alert" className="notice">
          {notice}
          <button type="button" onClick={() => docStore.setState({ notice: null })}>Fermer</button>
        </div>
      )}
      <DocumentView />
    </div>
  )
}
```

`src/renderer/main.tsx` (remplace le fichier) :
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { docStore } from './state/store'
import './app.css'

if (new URLSearchParams(location.search).has('e2e')) {
  ;(window as unknown as { __maquetteStore: typeof docStore }).__maquetteStore = docStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/renderer/app.css` (remplace le fichier) :
```css
html, body, #root { margin: 0; height: 100%; }
body { font-family: system-ui, sans-serif; background: #e5e5e5; color: #111; }
.app { height: 100%; position: relative; overflow: hidden; }
.canvas { position: absolute; inset: 0; overflow: hidden; }
.world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
.notice {
  position: absolute; z-index: 10; top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 12px; align-items: center;
  background: #7f1d1d; color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 14px;
}
.notice button { background: transparent; color: inherit; border: 1px solid #fff8; border-radius: 6px; padding: 2px 8px; cursor: pointer; }
```

- [ ] **Step 9: Lancer tous les tests**

Run: `npm run typecheck && npm test && npm run e2e`
Expected: typecheck OK ; Vitest PASS (core + store) ; Playwright 3 passed (app, 2 × document).

- [ ] **Step 10: Commit**

```bash
git add src e2e tests/renderer
git commit -m "Affiche le document dans la fenêtre avec un store Zustand et ouvre le fichier passé en argument"
```

---

### Task 9: Ouvrir et enregistrer (écriture atomique, menu)

**Files:**
- Create: `src/main/files.ts`, `src/main/state.ts`, `src/main/ipc.ts`, `src/main/menu.ts`, `src/renderer/state/commands.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts`, `src/renderer/App.tsx`
- Test: `tests/main/files.test.ts`, `e2e/save.spec.ts`

**Interfaces:**
- Consumes: `docStore` (store.ts), `parseDocument`, `serializeDocument` (format.ts), `newDocument` (defaults.ts).
- Produces:
  - `writeFileAtomic(target: string, data: string, opts?: { retries?: number; delayMs?: number; fs?: FsLike }): Promise<void>` et `interface FsLike { writeFile; rename; rm }` (files.ts).
  - `setCurrentPath(path: string | null): void`, `getCurrentDir(): string | null` (state.ts).
  - `MaquetteApi` complète : `getInitialDocument()`, `openFile(): Promise<OpenedFile | null>`, `saveFile(path: string | null, text: string): Promise<string | null>`, `onMenu(cb: (cmd: MenuCommand) => void): () => void`.
  - `runCommand(cmd: MenuCommand): Promise<void>` (commands.ts).
  - Canal `menu` (principal → fenêtre) qui porte une `MenuCommand`.

- [ ] **Step 1: Écrire les tests unitaires de l'écriture atomique (qui échouent)**

`tests/main/files.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, readdir, writeFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic, type FsLike } from '../../src/main/files'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'maquette dossier é '))
})

const busy = () => Object.assign(new Error('occupé'), { code: 'EBUSY' })

describe('writeFileAtomic', () => {
  it('écrit le fichier sans laisser de temporaire, même avec espaces et accents', async () => {
    const target = join(dir, 'démo test.maquette')
    await writeFileAtomic(target, 'Été 🌿\n')
    expect(await readFile(target, 'utf8')).toBe('Été 🌿\n')
    expect(await readdir(dir)).toEqual(['démo test.maquette'])
  })

  it('réessaie quand le renommage est bloqué (antivirus)', async () => {
    const target = join(dir, 'a.maquette')
    let failures = 2
    const fs: FsLike = {
      writeFile, rm,
      rename: async (from, to) => {
        if (failures-- > 0) throw busy()
        await rename(from, to)
      },
    }
    await writeFileAtomic(target, 'ok', { fs, delayMs: 1 })
    expect(await readFile(target, 'utf8')).toBe('ok')
  })

  it('abandonne après les nouvelles tentatives : l’original reste intact, le temporaire est supprimé', async () => {
    const target = join(dir, 'a.maquette')
    await writeFile(target, 'original', 'utf8')
    const fs: FsLike = { writeFile, rm, rename: async () => { throw busy() } }
    await expect(writeFileAtomic(target, 'nouveau', { fs, retries: 3, delayMs: 1 })).rejects.toThrow('occupé')
    expect(await readFile(target, 'utf8')).toBe('original')
    expect(await readdir(dir)).toEqual(['a.maquette'])
  })

  it('une autre erreur n’est pas réessayée', async () => {
    let calls = 0
    const fs: FsLike = {
      writeFile, rm,
      rename: async () => {
        calls++
        throw Object.assign(new Error('disque plein'), { code: 'ENOSPC' })
      },
    }
    await expect(writeFileAtomic(join(dir, 'a.maquette'), 'x', { fs, delayMs: 1 })).rejects.toThrow('disque plein')
    expect(calls).toBe(1)
  })
})
```

- [ ] **Step 2: Lancer pour constater l'échec**

Run: `npx vitest run tests/main/files.test.ts`
Expected: FAIL — module `src/main/files` introuvable.

- [ ] **Step 3: Écrire `src/main/files.ts`**

```ts
import * as nodeFs from 'node:fs/promises'

export interface FsLike {
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
  rename(from: string, to: string): Promise<void>
  rm(path: string, opts: { force: boolean }): Promise<void>
}

const RETRYABLE = new Set(['EBUSY', 'EPERM', 'EACCES'])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Écrit dans un temporaire puis renomme : le fichier cible n'est jamais à moitié écrit. */
export async function writeFileAtomic(
  target: string,
  data: string,
  opts: { retries?: number; delayMs?: number; fs?: FsLike } = {},
): Promise<void> {
  const fs = opts.fs ?? (nodeFs as unknown as FsLike)
  const retries = opts.retries ?? 5
  const delayMs = opts.delayMs ?? 50
  const tmp = `${target}.tmp-${process.pid}-${Date.now().toString(36)}`
  await fs.writeFile(tmp, data, 'utf8')
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, target)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? ''
      if (attempt < retries && RETRYABLE.has(code)) {
        await sleep(delayMs * (attempt + 1))
        continue
      }
      await fs.rm(tmp, { force: true })
      throw e
    }
  }
}
```

- [ ] **Step 4: Lancer les tests unitaires**

Run: `npx vitest run tests/main/files.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Écrire le test e2e d'enregistrement (qui échoue)**

`e2e/save.spec.ts` :
```ts
import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

test('modifier, enregistrer puis annuler, dans un dossier avec espaces et accents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dossier é test '))
  const file = join(dir, 'démo.maquette')
  await copyFile(join(__dirname, 'fixtures', 'demo.maquette'), file)

  const { app, page } = await launch([file])
  await expect(page.locator('[data-node-id="tTitre"]')).toHaveText('Bonjour Maquette')

  await page.evaluate(() => {
    const store = (window as unknown as { __maquetteStore: { getState(): { dispatch(ops: unknown[], label: string): unknown } } }).__maquetteStore
    store.getState().dispatch([{ op: 'update', id: 'tTitre', set: { content: 'Modifié ✓' } }], 'test')
  })
  await expect(page.locator('[data-node-id="tTitre"]')).toHaveText('Modifié ✓')
  await expect(page).toHaveTitle('démo.maquette • — Maquette')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu', 'save'))
  await expect(page).toHaveTitle('démo.maquette — Maquette')
  expect(await readFile(file, 'utf8')).toContain('"content": "Modifié ✓"')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu', 'undo'))
  await expect(page.locator('[data-node-id="tTitre"]')).toHaveText('Bonjour Maquette')
  await expect(page).toHaveTitle('démo.maquette • — Maquette')
  await app.close()
})
```

- [ ] **Step 6: Lancer pour constater l'échec**

Run: `npm run e2e -- e2e/save.spec.ts`
Expected: FAIL — le titre ne repasse jamais sans « • » (aucun gestionnaire `menu`).

- [ ] **Step 7: Écrire l'état, l'IPC et le menu du principal**

`src/main/state.ts` :
```ts
import { dirname } from 'node:path'

let currentPath: string | null = null

export function setCurrentPath(path: string | null): void {
  currentPath = path
}

export function getCurrentDir(): string | null {
  return currentPath ? dirname(currentPath) : null
}
```

`src/main/ipc.ts` :
```ts
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import type { OpenedFile } from '../shared/ipc'
import { writeFileAtomic } from './files'
import { setCurrentPath } from './state'

const FILTERS = [{ name: 'Maquette', extensions: ['maquette'] }]

export function registerFileIpc(fileArg: string | undefined): void {
  if (fileArg) setCurrentPath(fileArg)

  ipcMain.handle('doc:initial', async (): Promise<OpenedFile | null> => {
    if (!fileArg) return null
    return { path: fileArg, text: await readFile(fileArg, 'utf8') }
  })

  ipcMain.handle('file:open', async (event): Promise<OpenedFile | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = win
      ? await dialog.showOpenDialog(win, { filters: FILTERS, properties: ['openFile'] })
      : await dialog.showOpenDialog({ filters: FILTERS, properties: ['openFile'] })
    const path = res.filePaths[0]
    if (res.canceled || !path) return null
    setCurrentPath(path)
    return { path, text: await readFile(path, 'utf8') }
  })

  ipcMain.handle('file:save', async (event, args: { path: string | null; text: string }): Promise<string | null> => {
    let target = args.path
    if (!target) {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = { filters: FILTERS, defaultPath: 'Sans titre.maquette' }
      const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (res.canceled || !res.filePath) return null
      target = res.filePath.toLowerCase().endsWith('.maquette') ? res.filePath : `${res.filePath}.maquette`
    }
    await writeFileAtomic(target, args.text)
    setCurrentPath(target)
    return target
  })
}
```

`src/main/menu.ts` :
```ts
import { BrowserWindow, Menu } from 'electron'
import type { MenuCommand } from '../shared/ipc'

const send = (cmd: MenuCommand) => () => BrowserWindow.getFocusedWindow()?.webContents.send('menu', cmd)

export function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Fichier',
        submenu: [
          { label: 'Nouveau', accelerator: 'CmdOrCtrl+N', click: send('new') },
          { label: 'Ouvrir…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          { type: 'separator' },
          { label: 'Enregistrer', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { label: 'Enregistrer sous…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
          { type: 'separator' },
          { label: 'Quitter', role: 'quit' },
        ],
      },
      {
        label: 'Édition',
        submenu: [
          { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
          { label: 'Rétablir', accelerator: 'CmdOrCtrl+Y', click: send('redo') },
        ],
      },
      { label: 'Affichage', submenu: [{ role: 'toggleDevTools', label: 'Outils de développement' }] },
    ]),
  )
}
```

`src/main/index.ts` (remplace le fichier) :
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerFileIpc } from './ipc'
import { buildMenu } from './menu'

const fileArg = process.argv.slice(1).find((a) => a.toLowerCase().endsWith('.maquette'))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Maquette',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  const e2e = process.env.MAQUETTE_E2E === '1'
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL + (e2e ? '?e2e=1' : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), e2e ? { query: { e2e: '1' } } : undefined)
  }
  return win
}

registerFileIpc(fileArg)

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 8: Étendre l'API partagée et le preload**

`src/shared/ipc.ts` (remplace le fichier) :
```ts
export interface OpenedFile { path: string; text: string }
export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo'

export interface MaquetteApi {
  getInitialDocument(): Promise<OpenedFile | null>
  openFile(): Promise<OpenedFile | null>
  saveFile(path: string | null, text: string): Promise<string | null>
  onMenu(cb: (cmd: MenuCommand) => void): () => void
}
```

`src/preload/index.ts` (remplace le fichier) :
```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MaquetteApi, MenuCommand, OpenedFile } from '../shared/ipc'

const api: MaquetteApi = {
  getInitialDocument: () => ipcRenderer.invoke('doc:initial') as Promise<OpenedFile | null>,
  openFile: () => ipcRenderer.invoke('file:open') as Promise<OpenedFile | null>,
  saveFile: (path, text) => ipcRenderer.invoke('file:save', { path, text }) as Promise<string | null>,
  onMenu: (cb) => {
    const handler = (_e: IpcRendererEvent, cmd: MenuCommand) => cb(cmd)
    ipcRenderer.on('menu', handler)
    return () => ipcRenderer.removeListener('menu', handler)
  },
}

contextBridge.exposeInMainWorld('maquette', api)
```

- [ ] **Step 9: Écrire les commandes de la fenêtre et les brancher**

`src/renderer/state/commands.ts` :
```ts
import { newDocument } from '../../core/defaults'
import { parseDocument, serializeDocument } from '../../core/format'
import type { MenuCommand } from '../../shared/ipc'
import { docStore } from './store'

const confirmDiscard = () =>
  !docStore.getState().dirty || window.confirm('Abandonner les modifications non enregistrées ?')

async function save(asNew: boolean): Promise<void> {
  const { doc, filePath } = docStore.getState()
  try {
    const path = await window.maquette.saveFile(asNew ? null : filePath, serializeDocument(doc))
    if (path) docStore.getState().markSaved(path)
  } catch (e) {
    docStore.getState().showError(`Enregistrement impossible : ${(e as Error).message}`)
  }
}

export async function runCommand(cmd: MenuCommand): Promise<void> {
  const store = docStore.getState()
  switch (cmd) {
    case 'new':
      if (confirmDiscard()) store.load(newDocument(), null)
      return
    case 'open': {
      if (!confirmDiscard()) return
      const file = await window.maquette.openFile()
      if (!file) return
      const parsed = parseDocument(file.text)
      if (parsed.ok) store.load(parsed.doc, file.path)
      else store.showError(`Impossible d’ouvrir ce fichier : ${parsed.errors[0]!.message}`)
      return
    }
    case 'save':
      return save(false)
    case 'save-as':
      return save(true)
    case 'undo':
      store.undo()
      return
    case 'redo':
      store.redo()
      return
  }
}
```

Dans `src/renderer/App.tsx`, ajouter l'import `import { runCommand } from './state/commands'` et, dans le premier `useEffect`, brancher le menu et le débrancher au démontage. Le premier `useEffect` devient :
```tsx
  useEffect(() => {
    docStore.getState().setMeasure(domMeasure)
    void window.maquette.getInitialDocument().then((file) => {
      if (!file) return
      const parsed = parseDocument(file.text)
      if (parsed.ok) docStore.getState().load(parsed.doc, file.path)
      else docStore.getState().showError(`Impossible d’ouvrir ${fileName(file.path)} : ${parsed.errors[0]!.message}`)
    })
    return window.maquette.onMenu((cmd) => void runCommand(cmd))
  }, [])
```

- [ ] **Step 10: Lancer tous les tests**

Run: `npm run typecheck && npm test && npm run e2e`
Expected: typecheck OK ; Vitest PASS (dont 4 tests `files`) ; Playwright 4 passed.

- [ ] **Step 11: Commit**

```bash
git add src tests/main e2e/save.spec.ts
git commit -m "Ajoute ouvrir, enregistrer et annuler depuis le menu, avec écriture atomique"
```

---

### Task 10: Images locales (protocole `masset://`)

**Files:**
- Create: `src/main/assetPath.ts` (sans import d'Electron, testable sous Vitest), `src/main/assets.ts`, `src/renderer/canvas/assetUrl.ts`
- Modify: `src/main/index.ts` (enregistrer le protocole), `src/renderer/canvas/NodeView.tsx` (URL + image introuvable), `src/renderer/app.css`
- Test: `tests/main/assets.test.ts`, `e2e/assets.spec.ts`

**Interfaces:**
- Consumes: `getCurrentDir()` (state.ts).
- Produces: `resolveAssetPath(baseDir: string, urlPath: string): string | null` dans `src/main/assetPath.ts` ; `registerAssetScheme(): void` (à appeler avant `app.whenReady`) et `handleAssets(): void` (à appeler après) dans `src/main/assets.ts` ; `assetUrl(src: string): string` dans `src/renderer/canvas/assetUrl.ts` ; classe `.missing-image` avec le texte « Image introuvable ».

- [ ] **Step 1: Écrire le test unitaire de résolution (qui échoue)**

`tests/main/assets.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { join, resolve } from 'node:path'
import { resolveAssetPath } from '../../src/main/assetPath'

const base = resolve('C:/projets/client é')

describe('resolveAssetPath', () => {
  it('résout un chemin relatif au dossier du document', () => {
    expect(resolveAssetPath(base, '/assets/photo%20%C3%A9t%C3%A9.png')).toBe(join(base, 'assets', 'photo été.png'))
  })

  it('refuse de sortir du dossier du document', () => {
    expect(resolveAssetPath(base, '/../secret.txt')).toBeNull()
    expect(resolveAssetPath(base, '/assets/../../secret.txt')).toBeNull()
  })

  it('refuse un chemin vide', () => {
    expect(resolveAssetPath(base, '/')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer pour constater l'échec**

Run: `npx vitest run tests/main/assets.test.ts`
Expected: FAIL — module `src/main/assetPath` introuvable.

- [ ] **Step 3: Écrire `src/main/assetPath.ts` et `src/main/assets.ts`**

`src/main/assetPath.ts` :
```ts
import { resolve, sep } from 'node:path'

/** Chemin absolu d'une image du document, ou null si l'URL sort du dossier du document. */
export function resolveAssetPath(baseDir: string, urlPath: string): string | null {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, '')
  if (!relative) return null
  const root = resolve(baseDir)
  const absolute = resolve(root, relative)
  return absolute.startsWith(root + sep) ? absolute : null
}
```

`src/main/assets.ts` :
```ts
import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveAssetPath } from './assetPath'
import { getCurrentDir } from './state'

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'masset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

/** masset://doc/<chemin relatif au document> → fichier local. */
export function handleAssets(): void {
  protocol.handle('masset', (request) => {
    const base = getCurrentDir()
    const path = base ? resolveAssetPath(base, new URL(request.url).pathname) : null
    if (!path) return new Response('introuvable', { status: 404 })
    return net.fetch(pathToFileURL(path).toString())
  })
}
```

- [ ] **Step 4: Lancer le test unitaire**

Run: `npx vitest run tests/main/assets.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Écrire le test e2e (qui échoue)**

`e2e/assets.spec.ts` :
```ts
import { test, expect } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const image = (id: string, src: string, x: number) => ({
  id, type: 'image', name: id, visible: true, locked: false, opacity: 1,
  width: 40, height: 40, x, y: 10, position: 'flow', src, fit: 'cover', radius: 0, shadows: [],
})

test('une image du dossier assets s’affiche ; une image absente est signalée', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'images é '))
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'assets', 'point é.png'), Buffer.from(PNG_1x1, 'base64'))
  const doc = {
    format: 'maquette', version: 1, styles: { colors: [], text: [] },
    pages: [{ id: 'pImage', name: 'Images', children: [image('iPoint', 'assets/point é.png', 10), image('iAbsen', 'assets/absente.png', 80)] }],
  }
  const file = join(dir, 'images.maquette')
  await writeFile(file, JSON.stringify(doc), 'utf8')

  const { app, page } = await launch([file])
  const img = page.locator('img[data-node-id="iPoint"]')
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1)
  await expect(page.locator('[data-node-id="iAbsen"]')).toHaveText('Image introuvable')
  await app.close()
})
```

- [ ] **Step 6: Lancer pour constater l'échec**

Run: `npm run e2e -- e2e/assets.spec.ts`
Expected: FAIL — `naturalWidth` reste à 0 (le `src` relatif n'est pas résolu).

- [ ] **Step 7: Brancher le protocole et l'affichage des images**

Dans `src/main/index.ts` : ajouter `import { handleAssets, registerAssetScheme } from './assets'`, appeler `registerAssetScheme()` juste après `registerFileIpc(fileArg)` (avant `app.whenReady`), et appeler `handleAssets()` en première ligne du `then` de `app.whenReady()`. Le bloc devient :
```ts
registerFileIpc(fileArg)
registerAssetScheme()

app.whenReady().then(() => {
  handleAssets()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
```

`src/renderer/canvas/assetUrl.ts` :
```ts
/** URL servie par le principal pour une image du dossier du document. */
export function assetUrl(src: string): string {
  return `masset://doc/${src.split('/').map(encodeURIComponent).join('/')}`
}
```

`src/renderer/canvas/NodeView.tsx` (remplace le fichier) :
```tsx
import { useState, type CSSProperties } from 'react'
import { nodeCss } from '../../core/css'
import type { FrameNode, ImageNode, Node } from '../../core/types'
import { useDoc } from '../state/store'
import { assetUrl } from './assetUrl'

export function NodeView({ node, parent, index }: { node: Node; parent: FrameNode | null; index: number }) {
  const styles = useDoc((s) => s.doc.styles)
  const style = nodeCss(node, parent, styles, index) as CSSProperties
  switch (node.type) {
    case 'frame':
      return (
        <div data-node-id={node.id} style={style}>
          {node.children.map((child, i) => (
            <NodeView key={child.id} node={child} parent={node} index={i} />
          ))}
        </div>
      )
    case 'text':
      return <div data-node-id={node.id} style={style}>{node.content}</div>
    case 'shape':
      return <div data-node-id={node.id} style={style} />
    case 'image':
      return <ImageView node={node} style={style} />
  }
}

function ImageView({ node, style }: { node: ImageNode; style: CSSProperties }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!node.src || failedSrc === node.src) {
    return (
      <div data-node-id={node.id} style={style} className="missing-image" role="img" aria-label="Image introuvable">
        Image introuvable
      </div>
    )
  }
  return (
    <img
      data-node-id={node.id}
      style={style}
      src={assetUrl(node.src)}
      alt=""
      draggable={false}
      onError={() => setFailedSrc(node.src)}
    />
  )
}
```

Ajouter à la fin de `src/renderer/app.css` :
```css
.missing-image {
  display: flex; align-items: center; justify-content: center; text-align: center;
  background: repeating-linear-gradient(45deg, #fde68a, #fde68a 6px, #fcd34d 6px, #fcd34d 12px);
  color: #78350f; font: 600 11px/1.2 system-ui, sans-serif; overflow: hidden;
}
```

- [ ] **Step 8: Lancer tous les tests**

Run: `npm run typecheck && npm test && npm run e2e`
Expected: typecheck OK ; Vitest PASS ; Playwright 5 passed.

- [ ] **Step 9: Essai manuel rapide**

Run: `npm run dev -- -- e2e/fixtures/demo.maquette` (si electron-vite ne transmet pas l'argument, lancer `npm run build` puis `npx electron . e2e/fixtures/demo.maquette`).
Expected: la fenêtre affiche la carte « Bonjour Maquette » ; Fichier → Enregistrer sous… propose une boîte de dialogue ; Ctrl+Z annule. Fermer l'app.

- [ ] **Step 10: Commit**

```bash
git add src tests/main/assets.test.ts e2e/assets.spec.ts
git commit -m "Affiche les images du dossier assets via le protocole masset:// et signale les images absentes"
```

---

## Couverture de la spec par ce plan

| Spec | Couvert ici | Reporté |
|---|---|---|
| §3 choix techniques | Task 1 | — |
| §4 architecture, principe des opérations | Tasks 2-8 | relais MCP (plan 4) |
| §5 modèle, tailles, texte, styles nommés | Tasks 2, 4, 7 | polices Google en cache (plan 3) |
| §6 règles de validité | Task 3 (+ correction 3 en Task 4) | bascules d'interface (plan 2) |
| §7 canevas et interactions | affichage (Task 8) | tout le reste (plan 2) |
| §8 panneaux | — | plan 3 |
| §9 MCP | — | plan 4 |
| §10 taste-skill | — | plan 5 |
| §11 fichiers | écriture atomique, ouvrir, enregistrer (Task 9), images (Task 10) | secours, récupération, surveillance, association, récents (plan 6) |
| §12 export PNG | — | plan 4 |
| §13 erreurs | fichier invalide, image introuvable, lot refusé (Tasks 4, 8, 10) | police de secours visible (plan 3), plantage (plan 6) |
| §14 tests | Vitest + Playwright en place | client de test MCP (plan 4) |

---

## Amendement A (2026-10-17) — « jamais de refus à la souris »

Spec §6 (principe), §6.1 (corrections automatiques) et §6.2 (ouverture tolérante). Ces changements
**remplacent** les passages contraires des tâches ci-dessus. Les tests listés ici s'ajoutent aux tests
des tâches concernées.

### Exécution (remplace « Ordre et parallélisme »)

1. Séquentiel, session principale : Task 1, Task 2, Task 3, puis **Task A0** (ci-dessous). Commit sur `main`.
2. En parallèle, chacun dans un worktree partant de `main` :
   - **Agent ops** : Task 4 + amendement A1, puis Task 5.
   - **Agent format** : Task 6 + amendement A2.
   - **Agent css** : Task 7.
   - Session principale pendant ce temps : parties unitaires des Tasks 9 et 10 (`files.ts`, `assetPath.ts` et leurs tests).
3. Fusion dans `main`, puis Tasks 8, 9, 10 (intégration), puis une relecture finale par un agent neuf.

### Task A0 : couleurs et réalignement du texte (partagés par les agents ops et format)

**Files:** Create `src/core/color.ts`, `src/core/fixes.ts` ; Test `tests/core/color.test.ts`, `tests/core/fixes.test.ts`.

**Produces:**
- `normalizeColor(input: string): string | null` — `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `rgb(r, g, b)`, `rgba(r, g, b, a)` (virgules ou espaces, `a` entre 0 et 1 ou en %), les 148 noms CSS et `transparent` → `#RRGGBB` (ou `#RRGGBBAA` si alpha < 1) en majuscules ; sinon `null`.
- `normalizeColorValue(c: unknown): Color | null` — chaîne → `normalizeColor` ; `{ style: string }` gardé tel quel ; autre → `null`.
- `alignTextSizing(t: TextNode): boolean` — `width` hug → `textSizing: 'auto'` et `height` forcé à hug ; sinon `height` hug → `'auto-height'` ; sinon `'fixed'`. Renvoie `true` si quelque chose a changé.

Tests (`tests/core/color.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { normalizeColor, normalizeColorValue } from '../../src/core/color'

describe('normalizeColor', () => {
  it.each([
    ['#fff', '#FFFFFF'], ['#ffff', '#FFFFFF'], ['#FFF8', '#FFFFFF88'], ['#c2410c', '#C2410C'],
    ['#C2410C80', '#C2410C80'], ['white', '#FFFFFF'], ['RebeccaPurple', '#663399'],
    ['transparent', '#00000000'], ['rgb(194, 65, 12)', '#C2410C'], ['rgb(194 65 12)', '#C2410C'],
    ['rgba(0, 0, 0, 0.25)', '#00000040'], ['rgba(0,0,0,25%)', '#00000040'], ['rgba(255,255,255,1)', '#FFFFFF'],
  ])('%s → %s', (input, expected) => expect(normalizeColor(input)).toBe(expected))

  it.each(['', 'bleu', '#12', 'rgb(300, 0, 0)', 'rgba(0,0,0,2)', 'hsl(0, 0%, 0%)'])('%s → null', (input) =>
    expect(normalizeColor(input)).toBeNull())

  it('normalizeColorValue garde les références de style', () => {
    expect(normalizeColorValue({ style: 'c00001' })).toEqual({ style: 'c00001' })
    expect(normalizeColorValue('navy')).toBe('#000080')
    expect(normalizeColorValue(42)).toBeNull()
  })
})
```

Tests (`tests/core/fixes.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { alignTextSizing } from '../../src/core/fixes'
import type { TextNode } from '../../src/core/types'
import { text } from './helpers'

describe('alignTextSizing', () => {
  it('largeur fixe + hauteur hug → auto-height', () => {
    const t = text('t00001', { width: 300 }) as TextNode
    expect(alignTextSizing(t)).toBe(true)
    expect(t.textSizing).toBe('auto-height')
  })
  it('largeur et hauteur fixes → fixed', () => {
    const t = text('t00001', { width: 300, height: 80 }) as TextNode
    alignTextSizing(t)
    expect(t.textSizing).toBe('fixed')
  })
  it('largeur hug → auto, hauteur ramenée à hug', () => {
    const t = text('t00001', { height: 80, textSizing: 'fixed' }) as TextNode
    alignTextSizing(t)
    expect(t).toMatchObject({ textSizing: 'auto', height: { mode: 'hug' } })
  })
  it('déjà cohérent → false', () => {
    expect(alignTextSizing(text('t00001') as TextNode)).toBe(false)
  })
})
```

Commit : `Ajoute la normalisation des couleurs et le réalignement automatique du texte`.

### A1 : corrections automatiques dans `applyOps` (agent ops, avec Task 4)

Dans `src/core/ops.ts` :
- Toute couleur reçue (`create` : `fills[]`, `stroke.color`, `shadows[].color`, `color` ; `update` : les mêmes clés de `set` ; `style.color.set` : `value`) passe par `normalizeColorValue`. Valeur non lisible → refus avec le chemin (`ops[i].set.fills[0]` : `couleur illisible : "bleu"`).
- `update` d'un texte qui change `width` ou `height` **sans** `textSizing` dans `set` → `alignTextSizing` ; si changement, ajouter à `fixes` : `<nom> (<id>) : textSizing passe à "<valeur>"`.
- `create`/`update` qui donne `x`/`y` à un enfant en flux d'un cadre automatique → `x`/`y` retirés, note dans `fixes` : `<nom> (<id>) : x/y ignorés, la position est calculée par la mise en page automatique`.
- `style.delete` d'un style utilisé → avant de le retirer, chaque référence `{ style: id }` est remplacée par la valeur de la couleur ; chaque `textStyle: id` est retiré après avoir recopié ses propriétés de police dans le texte. Note dans `fixes` : `<n> élément(s) détaché(s) du style « <nom> »`.

Tests à ajouter dans `tests/core/ops.test.ts`. Dans le test « styles nommés : créer, référencer, refuser la suppression d'un style utilisé », **retirer** les deux dernières lignes (`r2` et son `expect`) et renommer le test « styles nommés : créer et référencer ».
```ts
  it('supprimer un style utilisé détache les éléments', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'style.color.set', id: '$fond', name: 'fond', value: '#F4F1EA' },
      { op: 'style.text.set', id: '$t', name: 'titre', fontFamily: 'Fraunces', fontWeight: 600, fontStyle: 'normal', fontSize: 64, lineHeight: 68, letterSpacing: -1 },
      { op: 'create', parent: pageId(doc), node: { id: '$s', type: 'shape', fills: [{ style: '$fond' }] } },
      { op: 'create', parent: pageId(doc), node: { id: '$x', type: 'text', textStyle: '$t' } },
    ]))
    const r2 = ok(applyOps(r.doc, [{ op: 'style.delete', id: r.ids['$fond']! }, { op: 'style.delete', id: r.ids['$t']! }]))
    const shape = findNode(r2.doc, r.ids['$s']!)!.node
    expect(shape.type === 'shape' && shape.fills).toEqual(['#F4F1EA'])
    const t = findNode(r2.doc, r.ids['$x']!)!.node as TextNode
    expect(t.textStyle).toBeUndefined()
    expect(t).toMatchObject({ fontFamily: 'Fraunces', fontWeight: 600, fontSize: 64, lineHeight: 68, letterSpacing: -1 })
    expect(r2.fixes).toHaveLength(2)
  })

  it('couleurs CSS converties, couleur illisible refusée avec son chemin', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = ok(applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: ['white', 'rgba(0,0,0,0.25)'] } }]))
    const shape = findNode(r.doc, 'r00001')!.node
    expect(shape.type === 'shape' && shape.fills).toEqual(['#FFFFFF', '#00000040'])
    const r2 = applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: ['bleu'] } }])
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.errors[0]!.path).toBe('ops[0].set.fills[0]')
  })

  it('redimensionner un texte en largeur réaligne textSizing au lieu de refuser', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0 })])
    const r = ok(applyOps(doc, [{ op: 'update', id: 't00001', set: { width: 300 } }]))
    expect(findNode(r.doc, 't00001')!.node).toMatchObject({ width: 300, textSizing: 'auto-height' })
    expect(r.fixes).toHaveLength(1)
  })

  it('x/y donnés à un enfant en flux sont ignorés, pas refusés', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(rect('r00001'))
    const r = ok(applyOps(docWith([p]), [{ op: 'update', id: 'r00001', set: { x: 40, y: 50 } }]))
    expect(findNode(r.doc, 'r00001')!.node.x).toBeUndefined()
    expect(r.fixes[0]).toContain('x/y ignorés')
  })
```

### A2 : ouverture tolérante (agent format, avec Task 6)

**Files:** Create `src/core/repair.ts` ; Modify `src/core/format.ts` ; Test `tests/core/repair.test.ts` et `tests/core/format.test.ts`.

**Produces:**
- `repairDocument(raw: Record<string, unknown>): { doc: unknown; warnings: Issue[] }` — appelée par `parseDocument` après les contrôles format/version et les migrations ; ne modifie pas `raw`.
- `ParseResult` devient `{ ok: true; doc: MaquetteDocument; warnings: Issue[] } | { ok: false; errors: Issue[] }`.

Comportement de `repairDocument` (chaque réparation ajoute un avertissement `{ path, message }`, chemin au format de `formatPath`) :
1. `styles` absent ou mal formé → `{ colors: [], text: [] }` ; couleur nommée à valeur illisible → `#FF00FF` ; style de texte incomplet → complété (`Inter`, 400, `normal`, 16, 19, 0).
2. `pages` absent ou vide → une page `Page 1` vide ; page sans `id` → nouvel id ; sans `name` → `Page <n>`.
3. Élément qui n'est pas un objet ou dont le `type` n'est pas `frame`/`text`/`shape`/`image` → retiré.
4. Élément lisible : les valeurs par défaut de `createNode(type)` complètent les propriétés manquantes ; propriétés inconnues retirées ; `layout` d'un cadre complété par `autoLayoutDefaults()` en mode `auto` ; couleurs passées par `normalizeColorValue` (illisible → `#FF00FF`).
5. Identifiant absent, invalide ou en double → nouvel id.
6. Références de style inconnues : couleur → `#FF00FF` ; `textStyle` → retiré.
7. Règles du §6 ramenées à l'état valide le plus proche : `x`/`y` retirés d'un enfant en flux, mis à 0 s'ils manquent ailleurs ; `absolute` hors cadre automatique → `flow` ; `alignSelf` hors flux → retiré ; `hug`/`fill` impossibles → 100 px ; parent `hug` avec enfant `fill` sur le même axe → 100 px ; `min*`/`max*` hors contexte → retirés, `max` < `min` → `max` retiré ; `rowGap` sans `wrap` → retiré ; `baseline` hors `row` → `start` ; `alignTextSizing` sur chaque texte.
8. Une valeur de mauvais type qu'aucune règle ci-dessus ne répare (ex. `opacity: "abc"`) n'est **pas** devinée : `parseDocument` refuse alors le fichier avec les erreurs de `validateDocument`.

Tests à **remplacer** dans `tests/core/format.test.ts` (le premier remplace le test d'aller-retour, le deuxième remplace « document invalide selon les règles ») et un test à ajouter :
```ts
  it('aller-retour exact, y compris accents, guillemets, emoji et retours à la ligne', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0, content: 'Été « ok » 🌿\nligne 2' })])
    const textOut = serializeDocument(doc)
    expect(parseDocument(textOut)).toEqual({ ok: true, doc, warnings: [] })
    expect(textOut.endsWith('\n')).toBe(true)
    expect(textOut).toContain('\n  "format": "maquette"')
    expect(textOut).toContain('Été « ok » 🌿')
  })

  it('un document qui enfreint une règle est ouvert et réparé, avec un avertissement', () => {
    const doc = docWith([text('t00001', { content: 'sans position' })])
    const r = parseDocument(JSON.stringify(doc))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc.pages[0]!.children[0]).toMatchObject({ x: 0, y: 0 })
      expect(r.warnings.map((w) => w.path)).toEqual(['pages[0].children[0].x'])
    }
  })

  it('une valeur de mauvais type non réparable : refus', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0 })]) as unknown as { pages: { children: Record<string, unknown>[] }[] }
    doc.pages[0]!.children[0]!.opacity = 'abc'
    const r = parseDocument(JSON.stringify(doc))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('pages[0].children[0].opacity')
  })
```

Tests (`tests/core/repair.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { repairDocument } from '../../src/core/repair'
import { validateDocument } from '../../src/core/rules'
import type { MaquetteDocument } from '../../src/core/types'

const raw = (pages: unknown, styles: unknown = { colors: [], text: [] }) => ({ format: 'maquette', version: 1, styles, pages })
const fix = (r: Record<string, unknown>) => {
  const { doc, warnings } = repairDocument(r)
  expect(validateDocument(doc as MaquetteDocument)).toEqual([])
  return { doc: doc as MaquetteDocument, paths: warnings.map((w) => w.path) }
}

describe('repairDocument', () => {
  it('ne touche pas un document valide', () => {
    const r = raw([{ id: 'pAccue', name: 'Accueil', children: [] }])
    expect(repairDocument(r)).toEqual({ doc: r, warnings: [] })
  })

  it('document sans page → une page vide', () => {
    const { doc, paths } = fix(raw([]))
    expect(doc.pages).toHaveLength(1)
    expect(paths).toEqual(['pages'])
  })

  it('élément minimal écrit à la main : complété sans avertissement', () => {
    const { doc, paths } = fix(raw([{ id: 'p1', name: 'P', children: [{ id: 'r1', type: 'shape', x: 10, y: 10 }] }]))
    expect(doc.pages[0]!.children[0]).toMatchObject({ id: 'r1', type: 'shape', width: 100, fills: ['#D9D9D9'], visible: true })
    expect(paths).toEqual([])
  })

  it('propriété inconnue retirée, type inconnu retiré, couleur convertie', () => {
    const { doc, paths } = fix(raw([{ id: 'p1', name: 'P', children: [
      { id: 'r1', type: 'shape', x: 0, y: 0, colour: 'red', fills: ['white'] },
      { id: 'z1', type: 'video' },
    ] }]))
    expect(doc.pages[0]!.children).toHaveLength(1)
    expect(doc.pages[0]!.children[0]).not.toHaveProperty('colour')
    expect(doc.pages[0]!.children[0]).toMatchObject({ fills: ['#FFFFFF'] })
    expect(paths).toEqual(['pages[0].children[0].colour', 'pages[0].children[0].fills[0]', 'pages[0].children[1]'])
  })

  it('identifiants en double renouvelés, références inconnues détachées', () => {
    const { doc, paths } = fix(raw([{ id: 'p1', name: 'P', children: [
      { id: 'r1', type: 'shape', x: 0, y: 0, fills: [{ style: 'absent' }] },
      { id: 'r1', type: 'text', x: 0, y: 0, textStyle: 'absent' },
    ] }]))
    const [a, b] = doc.pages[0]!.children
    expect(a!.type === 'shape' && a.fills).toEqual(['#FF00FF'])
    expect(b!.id).not.toBe('r1')
    expect(b).not.toHaveProperty('textStyle')
    expect(paths).toEqual(['pages[0].children[0].fills[0]', 'pages[0].children[1].id', 'pages[0].children[1].textStyle'])
  })

  it('règles ramenées à l’état valide le plus proche', () => {
    const { doc } = fix(raw([{ id: 'p1', name: 'P', children: [
      { id: 'f1', type: 'frame', x: 0, y: 0, width: { mode: 'hug' }, layout: { mode: 'auto', rowGap: 4, align: 'baseline' }, children: [
        { id: 'r1', type: 'shape', x: 5, y: 5, width: { mode: 'fill' } },
        { id: 't1', type: 'text', width: 200, textSizing: 'auto' },
      ] },
      { id: 'r2', type: 'shape', x: 0, y: 0, width: { mode: 'hug' }, position: 'absolute', minWidth: 10 },
    ] }]))
    const f = doc.pages[0]!.children[0]!
    expect(f).toMatchObject({ width: 100 })
    expect(f.type === 'frame' && f.layout).toMatchObject({ align: 'start' })
    expect(f.type === 'frame' && f.layout).not.toHaveProperty('rowGap')
    expect(f.type === 'frame' && f.children[0]!.x).toBeUndefined()
    expect(f.type === 'frame' && f.children[1]).toMatchObject({ textSizing: 'auto-height' })
    expect(doc.pages[0]!.children[1]).toMatchObject({ width: 100, position: 'flow' })
    expect(doc.pages[0]!.children[1]).not.toHaveProperty('minWidth')
  })
})
```

Dans les Tasks 8 et 9 (`App.tsx` et `commands.ts`) : quand `parsed.ok` et que `parsed.warnings` n'est pas vide,
charger le document **et** appeler `showError` avec le message
`<nom du fichier> ouvert avec <n> réparation(s) : <message du 1er avertissement>` (le bandeau sert aussi
d'information). Le titre de la fenêtre porte alors « • » : le document réparé diffère du fichier.
