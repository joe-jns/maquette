# Maquette — Plan 2 : Canevas interactif

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le canevas utilisable à la souris et au clavier avec le ressenti de Figma : caméra (zoom, déplacement), sélection, poignées, déplacement avec magnétisme, redimensionnement, réordonnancement dans les cadres automatiques, outils de création, édition de texte sur place, raccourcis, import d'images — une entrée d'historique par geste.

**Architecture:** Deux couches. **Phase A** : des modules **purs** dans `src/renderer/canvas/` (aucun accès au DOM ni à React), chacun avec ses tests Vitest complets ci-dessous ; ils calculent (caméra, magnétisme, point d'insertion, règles de sélection, lots d'opérations des commandes, presse-papiers, raccourcis). **Phase B** : l'intégration React/DOM — un store d'interface (caméra, sélection, outil, surcouche), le composant `Canvas` (monde transformé + surcouche SVG), une machine à états d'interaction, l'édition de texte, l'import d'images par le principal — validée par des tests Playwright qui pilotent la vraie fenêtre.

**Tech Stack:** inchangé (plan 1). Aucune nouvelle dépendance.

**Spec:** `docs/superpowers/specs/2026-10-16-maquette-design.md` §6 (bascules d'interface, §6.1), §7 (canevas et interactions), §11 (images dans `assets/`), §13.

**Note de forme :** pour la phase A, les tests sont donnés en entier (ils fixent le comportement) avec les signatures ; l'implémentation est laissée à l'exécutant (TDD). Pour la phase B, chaque tâche donne le comportement attendu, les fichiers, et les scénarios e2e à écrire d'abord.

## Global Constraints

- Toutes les contraintes du plan 1 (versions exactes, `src/core` pur, textes en français, commits en français sans `Co-Authored-By`, un commit par changement, jamais de push sans accord).
- **Aucune nouvelle dépendance npm.**
- Les modules de `src/renderer/canvas/*.ts` listés en phase A n'importent ni `react` ni le DOM (`document`, `window`) : ils sont testés sous Vitest en environnement `node`.
- **Principe « jamais de refus à la souris »** (spec §6) : une interaction ne produit jamais d'erreur visible ; si `applyOps` refuse un lot issu d'une interaction, c'est un bug à corriger, pas un message à afficher.
- **Une entrée d'historique par geste** (un glisser complet, un redimensionnement, une session de texte, une commande clavier).
- Valeurs de la spec §7 : zoom 2 %–25 600 % ; molette ×1,5 bornée à 120 px ; ±36 % de zoom max par événement ; démarrage d'un glisser à 4 px écran ; double-clic 300 ms / 4 px ; magnétisme 5 px écran ; poignées 8 px visibles / 15 px cliquables, masquées sous 10 px ; grille de pixels dès 400 % ; marge « tout voir » 40 px ; flèches 1 px / Maj 10 px.

## Review Focus

1. **Glisser puis `Ctrl+Z`** → le document revient exactement à l'état d'avant le glisser, en **une** annulation (pas une par mouvement de souris). Test : Task A4 (store) + Task B4 (e2e).
2. **Fenêtre qui perd le focus en plein glisser** (Alt+Tab, notification) → le geste est validé ou annulé proprement, jamais « collé » à la souris. Test : Task B3 (`lostpointercapture` / `blur` → fin du geste).
3. **Clavier AZERTY** → les raccourcis lettres (`Ctrl+D`, `R`, `T`…) suivent la lettre tapée, les chiffres (`Ctrl+0`, `Maj+1`) suivent la touche physique. Test : Task A4 (shortcuts).
4. **Pincement du pavé tactile** → zoome le canevas, jamais toute la fenêtre Electron. Test : Task B1 (Ctrl+molette synthétique → zoom du canevas, `webFrame` à 1).
5. **Taper dans un texte en cours d'édition** (`Suppr`, `R`, `Ctrl+D`…) → modifie le texte, ne déclenche aucun raccourci. Test : Task B7.

---

## Structure des fichiers

```
src/renderer/canvas/
  camera.ts        A1  caméra : conversions écran↔monde, zoom vers un point, molette, pas de zoom, cadrage
  geometry.ts      A1  rectangles : union, intersection, normalisation, lignes de distance
  clicks.ts        A1  détection maison du double-clic (300 ms / 4 px)
  snapping.ts      A2  magnétisme : bords, centres, espacements égaux
  reorder.ts       A2  point d'insertion dans un cadre automatique (+ trait d'insertion)
  selection.ts     A3  règles de sélection : clic, profond, descendre/remonter, frère suivant, lasso
  canvasOps.ts     A3  lots d'opérations des commandes : supprimer, dupliquer, encadrer, auto-layout, ordre, flèches
  clipboard.ts     A3  copier/coller (format JSON propre à Maquette)
  shortcuts.ts     A4  table des raccourcis + reconnaissance d'une touche
  rects.ts         B   lecture des rectangles dans le DOM (en coordonnées du monde ou du parent)
  Canvas.tsx       B   conteneur : monde transformé + surcouche + écouteurs
  Overlay.tsx      B   surcouche SVG : survol, sélection, poignées, guides, lasso, insertion, grille
  interaction.ts   B   machine à états des gestes (pointeur + clavier)
  TextEditor.tsx   B   édition de texte sur place
  HelpOverlay.tsx  B   fenêtre d'aide « ? » générée depuis shortcuts.ts
src/renderer/state/
  ui.ts            B   store d'interface : caméra, outil, sélection, contexte, survol, surcouche
  store.ts         A4  + gestes : beginGesture / previewGesture / commitGesture / cancelGesture
src/core/css.ts    A4  contour d'un cadre dessiné au-dessus de ses enfants (frameStrokeCss)
src/main/images.ts B   import d'une image dans assets/ (empreinte SHA-256)
```

## Exécution

1. **Phase A en parallèle**, quatre worktrees partant de `main` : A1, A2, A3, A4 (fichiers disjoints). Fusion dans `main`.
2. **Phase B en séquence** (session principale) : B1 → B9, puis une relecture finale par un agent neuf, puis des captures envoyées à l'utilisateur.

---

## Phase A — modules purs

### Task A1: Caméra, géométrie, double-clic

**Files:** Create `src/renderer/canvas/camera.ts`, `src/renderer/canvas/geometry.ts`, `src/renderer/canvas/clicks.ts` ; Test `tests/canvas/camera.test.ts`, `tests/canvas/geometry.test.ts`, `tests/canvas/clicks.test.ts`.

**Produces:**
- `camera.ts` : `interface Camera { x: number; y: number; zoom: number }` (point écran = point monde × zoom + (x, y)) ; `MIN_ZOOM = 0.02`, `MAX_ZOOM = 256` ; `clampZoom(z: number): number` ; `screenToWorld(c: Camera, p: Point): Point` ; `worldToScreen(c: Camera, p: Point): Point` ; `zoomAt(c: Camera, factor: number, screen: Point): Camera` (le point du monde sous `screen` ne bouge pas ; zoom borné) ; `wheelZoomFactor(deltaY: number): number` (= `exp(-deltaY × 0,0025)` borné à [1/1,36 ; 1,36]) ; `wheelPan(deltaX: number, deltaY: number): { dx: number; dy: number }` (déplacement de caméra = −delta × 1,5, chaque composante bornée à ±120) ; `stepZoom(zoom: number, direction: 1 | -1): number` (puissance de 2 strictement suivante/précédente, bornée) ; `fitRect(bounds: Rect, viewport: { width: number; height: number }, margin = 40, maxZoom = 1): Camera`.
- `geometry.ts` : `interface Point { x: number; y: number }` ; `union(rects: Rect[]): Rect | null` ; `intersects(a: Rect, b: Rect): boolean` (bords qui se touchent = non) ; `contains(outer: Rect, inner: Rect, tolerance = 0): boolean` ; `normalizeRect(a: Point, b: Point): Rect` ; `center(r: Rect): Point` ; `interface DistanceLine { x1: number; y1: number; x2: number; y2: number; length: number }` ; `distanceLines(a: Rect, b: Rect): DistanceLine[]` (si `b` contient `a` : les 4 distances aux bords de `b`, ordre gauche, droite, haut, bas ; sinon l'écart horizontal et/ou vertical entre les deux, tracé au milieu de leur recouvrement ou au centre de `a`).
- `clicks.ts` : `createClickTracker(opts = { intervalMs: 300, radius: 4 }): { track(time: number, x: number, y: number): 1 | 2 }` — renvoie 2 si le clic suit le précédent de moins de `intervalMs` et à moins de `radius` px ; après un 2, la séquence repart à 1.

`Rect` est celui de `src/core/types.ts`.

Tests (`tests/canvas/camera.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import {
  MAX_ZOOM, MIN_ZOOM, clampZoom, fitRect, screenToWorld, stepZoom, wheelPan, wheelZoomFactor, worldToScreen, zoomAt,
} from '../../src/renderer/canvas/camera'

describe('caméra', () => {
  it('conversions écran ↔ monde', () => {
    const c = { x: 100, y: 50, zoom: 2 }
    expect(worldToScreen(c, { x: 10, y: 20 })).toEqual({ x: 120, y: 90 })
    expect(screenToWorld(c, { x: 120, y: 90 })).toEqual({ x: 10, y: 20 })
  })

  it('zoomer garde le point sous le curseur immobile', () => {
    const c = { x: 30, y: -20, zoom: 1 }
    const p = { x: 200, y: 100 }
    const world = screenToWorld(c, p)
    const c2 = zoomAt(c, 2, p)
    expect(c2.zoom).toBe(2)
    const back = worldToScreen(c2, world)
    expect(back.x).toBeCloseTo(200)
    expect(back.y).toBeCloseTo(100)
  })

  it('le zoom est borné à 2 % et 25 600 %', () => {
    const c = { x: 0, y: 0, zoom: 1 }
    expect(zoomAt(c, 1e6, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(c, 1e-6, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM)
    expect(clampZoom(0.001)).toBe(0.02)
    expect(clampZoom(1000)).toBe(256)
  })

  it('un cran de molette zoome d’au plus 36 %', () => {
    expect(wheelZoomFactor(0)).toBe(1)
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(-100)).toBeLessThanOrEqual(1.36)
    expect(wheelZoomFactor(-10000)).toBe(1.36)
    expect(wheelZoomFactor(10000)).toBeCloseTo(1 / 1.36)
  })

  it('la molette déplace de 1,5 × le delta, borné à 120 px', () => {
    expect(wheelPan(10, 1000)).toEqual({ dx: -15, dy: -120 })
    expect(wheelPan(-200, 0)).toEqual({ dx: 120, dy: -0 })
  })

  it('Ctrl+/Ctrl- passent d’une puissance de 2 à la suivante', () => {
    expect(stepZoom(1, 1)).toBe(2)
    expect(stepZoom(1, -1)).toBe(0.5)
    expect(stepZoom(0.7, 1)).toBe(1)
    expect(stepZoom(0.7, -1)).toBe(0.5)
    expect(stepZoom(256, 1)).toBe(256)
    expect(stepZoom(0.03, -1)).toBe(0.02)
  })

  it('tout voir : cadre avec une marge de 40 px, sans dépasser 100 %', () => {
    expect(fitRect({ x: 0, y: 0, width: 1000, height: 500 }, { width: 1080, height: 580 })).toEqual({ x: 40, y: 40, zoom: 1 })
    expect(fitRect({ x: 0, y: 0, width: 2000, height: 1000 }, { width: 1080, height: 580 })).toEqual({ x: 40, y: 40, zoom: 0.5 })
    expect(fitRect({ x: 100, y: -50, width: 2000, height: 1000 }, { width: 1080, height: 580 })).toEqual({ x: -10, y: 65, zoom: 0.5 })
    expect(fitRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 1080, height: 580 }).zoom).toBe(1)
  })
})
```

Tests (`tests/canvas/geometry.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { center, contains, distanceLines, intersects, normalizeRect, union } from '../../src/renderer/canvas/geometry'

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('géométrie', () => {
  it('union', () => {
    expect(union([r(0, 0, 10, 10), r(20, 5, 10, 10)])).toEqual(r(0, 0, 30, 15))
    expect(union([])).toBeNull()
  })

  it('intersection et inclusion', () => {
    expect(intersects(r(0, 0, 10, 10), r(5, 5, 10, 10))).toBe(true)
    expect(intersects(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false)
    expect(contains(r(0, 0, 100, 100), r(10, 10, 20, 20))).toBe(true)
    expect(contains(r(0, 0, 100, 100), r(90, 10, 20, 20))).toBe(false)
    expect(contains(r(0, 0, 100, 100), r(0, 0, 100.4, 100), 0.5)).toBe(true)
  })

  it('rectangle depuis deux points, centre', () => {
    expect(normalizeRect({ x: 10, y: 10 }, { x: 0, y: 20 })).toEqual(r(0, 10, 10, 10))
    expect(center(r(0, 10, 10, 20))).toEqual({ x: 5, y: 20 })
  })

  it('distance entre deux éléments côte à côte', () => {
    expect(distanceLines(r(0, 0, 10, 10), r(30, 0, 10, 10))).toEqual([{ x1: 10, y1: 5, x2: 30, y2: 5, length: 20 }])
  })

  it('distances aux bords du parent', () => {
    expect(distanceLines(r(10, 10, 10, 10), r(0, 0, 40, 40)).map((l) => l.length)).toEqual([10, 20, 10, 20])
  })
})
```

Tests (`tests/canvas/clicks.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { createClickTracker } from '../../src/renderer/canvas/clicks'

describe('double-clic maison', () => {
  it('deux clics rapprochés = 2, puis la séquence repart', () => {
    const t = createClickTracker()
    expect(t.track(0, 0, 0)).toBe(1)
    expect(t.track(200, 2, 2)).toBe(2)
    expect(t.track(300, 2, 2)).toBe(1)
  })
  it('trop lent ou trop loin = 1', () => {
    const t = createClickTracker()
    expect(t.track(0, 0, 0)).toBe(1)
    expect(t.track(400, 0, 0)).toBe(1)
    expect(t.track(500, 10, 0)).toBe(1)
  })
})
```

Commit : `Ajoute les calculs de caméra, de géométrie et la détection du double-clic`.

### Task A2: Magnétisme et point d'insertion

**Files:** Create `src/renderer/canvas/snapping.ts`, `src/renderer/canvas/reorder.ts` ; Test `tests/canvas/snapping.test.ts`, `tests/canvas/reorder.test.ts`.

**Produces:**
- `snapping.ts` : `interface Guide { axis: 'x' | 'y'; at: number; from: number; to: number }` (ligne verticale `x = at` de `y = from` à `to`, ou horizontale) ; `interface Gap { axis: 'x' | 'y'; from: number; to: number; at: number }` (écart égal mis en évidence) ; `interface SnapResult { dx: number; dy: number; guides: Guide[]; gaps: Gap[] }` ; `snapMove(moving: Rect, targets: Rect[], threshold: number): SnapResult` — pour chaque axe indépendamment : candidats de `moving` = début, centre, fin ; cibles = début, centre, fin de chaque `target` ; plus les positions « espacement égal » (entre deux cibles alignées sur l'autre axe, ou à la suite d'une paire avec le même écart) ; on prend le décalage de plus petite valeur absolue ≤ `threshold` (à égalité, un bord l'emporte sur un espacement) ; aucune cible → 0 et pas de guide. `snapValue(value: number, candidates: number[], threshold: number): { value: number; snapped: number | null }` pour le redimensionnement.
- `reorder.ts` : `insertionIndex(rects: Rect[], direction: 'row' | 'column', pointer: Point, wrap = false): number` — `rects` = enfants **sans** l'élément tiré, dans l'ordre ; renvoie l'indice du premier enfant « au-delà » du pointeur (son centre est après le pointeur sur l'axe principal ; avec `wrap`, un enfant d'une ligne suivante est aussi « au-delà ») ; sinon `rects.length`. `insertionMarker(rects: Rect[], direction: 'row' | 'column', index: number, container: Rect): { x1: number; y1: number; x2: number; y2: number }` — trait perpendiculaire à l'axe, à mi-chemin entre l'enfant `index - 1` et l'enfant `index` (au bord intérieur du conteneur aux extrémités).

Tests (`tests/canvas/snapping.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { snapMove, snapValue } from '../../src/renderer/canvas/snapping'

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('magnétisme', () => {
  const target = [r(100, 0, 50, 50)]

  it('bord contre bord à moins du seuil', () => {
    const s = snapMove(r(153, 200, 20, 20), target, 5)
    expect(s.dx).toBe(-3)
    expect(s.dy).toBe(0)
    expect(s.guides.some((g) => g.axis === 'x' && g.at === 150)).toBe(true)
  })

  it('centre contre centre', () => {
    expect(snapMove(r(113, 200, 20, 20), target, 5).dx).toBe(2)
  })

  it('au-delà du seuil : rien', () => {
    const s = snapMove(r(160, 200, 20, 20), target, 5)
    expect(s.dx).toBe(0)
    expect(s.guides).toEqual([])
  })

  it('axe vertical', () => {
    const s = snapMove(r(400, 52, 20, 20), target, 5)
    expect(s.dy).toBe(-2)
    expect(s.guides.some((g) => g.axis === 'y' && g.at === 50)).toBe(true)
  })

  it('espacement égal à la suite d’une paire', () => {
    const s = snapMove(r(82, 0, 20, 20), [r(0, 0, 20, 20), r(40, 0, 20, 20)], 5)
    expect(s.dx).toBe(-2)
    expect(s.gaps.length).toBeGreaterThanOrEqual(2)
  })

  it('espacement égal entre deux voisins', () => {
    expect(snapMove(r(49, 0, 20, 20), [r(0, 0, 20, 20), r(100, 0, 20, 20)], 5).dx).toBe(1)
  })

  it('le plus petit décalage gagne', () => {
    expect(snapMove(r(148, 300, 20, 20), [r(100, 0, 50, 50), r(0, 0, 147, 10)], 5).dx).toBe(-1)
  })

  it('snapValue pour un bord redimensionné', () => {
    expect(snapValue(203, [100, 200, 300], 5)).toEqual({ value: 200, snapped: 200 })
    expect(snapValue(250, [100, 200, 300], 5)).toEqual({ value: 250, snapped: null })
  })
})
```

Tests (`tests/canvas/reorder.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { insertionIndex, insertionMarker } from '../../src/renderer/canvas/reorder'

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('point d’insertion', () => {
  const col = [r(0, 0, 100, 20), r(0, 30, 100, 20), r(0, 60, 100, 20)]

  it('colonne', () => {
    expect(insertionIndex(col, 'column', { x: 50, y: 5 })).toBe(0)
    expect(insertionIndex(col, 'column', { x: 50, y: 25 })).toBe(1)
    expect(insertionIndex(col, 'column', { x: 50, y: 45 })).toBe(2)
    expect(insertionIndex(col, 'column', { x: 50, y: 200 })).toBe(3)
  })

  it('ligne : seul l’axe principal compte sans retour à la ligne', () => {
    const row = [r(0, 0, 20, 20), r(30, 0, 20, 20)]
    expect(insertionIndex(row, 'row', { x: 35, y: 0 })).toBe(1)
    expect(insertionIndex(row, 'row', { x: 100, y: 500 })).toBe(2)
    expect(insertionIndex(row, 'row', { x: -5, y: 500 })).toBe(0)
  })

  it('ligne avec retour à la ligne', () => {
    const rows = [r(0, 0, 20, 20), r(30, 0, 20, 20), r(0, 30, 20, 20)]
    expect(insertionIndex(rows, 'row', { x: 5, y: 35 }, true)).toBe(2)
    expect(insertionIndex(rows, 'row', { x: 45, y: 5 }, true)).toBe(2)
    expect(insertionIndex(rows, 'row', { x: 25, y: 10 }, true)).toBe(1)
  })

  it('liste vide', () => {
    expect(insertionIndex([], 'column', { x: 0, y: 0 })).toBe(0)
  })

  it('trait d’insertion entre deux enfants d’une colonne', () => {
    expect(insertionMarker(col, 'column', 1, r(0, 0, 100, 80))).toEqual({ x1: 0, y1: 25, x2: 100, y2: 25 })
    expect(insertionMarker(col, 'column', 0, r(0, -10, 100, 90))).toEqual({ x1: 0, y1: -10, x2: 100, y2: -10 })
    expect(insertionMarker(col, 'column', 3, r(0, 0, 100, 90))).toEqual({ x1: 0, y1: 90, x2: 100, y2: 90 })
  })
})
```

Commit : `Ajoute le magnétisme et le calcul du point d'insertion dans un cadre automatique`.

### Task A3: Règles de sélection, commandes, presse-papiers

**Files:** Create `src/renderer/canvas/selection.ts`, `src/renderer/canvas/canvasOps.ts`, `src/renderer/canvas/clipboard.ts` ; Test `tests/canvas/selection.test.ts`, `tests/canvas/canvasOps.test.ts`, `tests/canvas/clipboard.test.ts`.

**Consumes:** `findNode`, `walk` (core/tree), `applyOps`, `Op`, `Measure` (core/ops), types, helpers de test `tests/core/helpers.ts`.

**Produces:**
- `selection.ts` : `contextOf(doc, id): string | null` (parent de l'élément, `null` sur la page) ; `pickClickTarget(doc, hitId: string, opts: { deep: boolean; context: string | null; rectOf?: (id: string) => Rect | undefined }): string` — sans `deep` : l'élément de la chaîne `hitId → ancêtres` dont le parent est `context` (si aucun, l'ancêtre de premier niveau) ; avec `deep` : `hitId`, mais tant qu'un élément recouvre entièrement son parent (`contains(rect, rectParent, 0.5)` dans les deux sens) on remonte au parent ; `descend(doc, id): string | null` (premier enfant) ; `ascend(doc, id): string | null` ; `nextSibling(doc, id, dir: 1 | -1): string` (boucle) ; `marqueeSelect(doc, pageId, context: string | null, rectOf, marquee: Rect): string[]` (enfants du contexte — ou de la page — qui intersectent le lasso, dans l'ordre du document).
- `canvasOps.ts` (chaque fonction renvoie `{ ops: Op[]; select: string[] }` où `select` contient des identifiants réels ou temporaires `$…` à sélectionner après application) :
  - `deleteOps(doc, ids)` — ignore un élément dont un ancêtre est aussi supprimé ; `select: []`.
  - `duplicateOps(doc, ids)` — copie chaque sous-arbre ; hors flux : même parent, décalé de +10/+10 ; en flux : juste après l'original.
  - `wrapInFrameOps(doc, ids, measure: Measure)` — nouveau cadre `Cadre` sans remplissage dans le parent commun, à l'indice du premier élément ; parent libre/page : cadre libre à la boîte englobante, enfants replacés en relatif ; parent automatique : cadre automatique `hug`×`hug` de même direction, enfants en flux dans le même ordre.
  - `addAutoLayoutOps(doc, ids, measure)` — un seul cadre sélectionné : passe en automatique ; direction `row` si les enfants s'étalent plus horizontalement que verticalement, sinon `column` ; enfants réordonnés selon leur position ; `gap` = moyenne arrondie des écarts (≥ 0) ; `padding = [haut, gauche, haut, gauche]` (distance de la boîte des enfants aux bords haut et gauche) ; largeur et hauteur `hug`. Sinon : `wrapInFrameOps` en automatique.
  - `zOrderOps(doc, ids, to: 'forward' | 'backward' | 'front' | 'back')` — déplace dans le même parent en gardant l'ordre relatif.
  - `nudgeOps(doc, ids, dx, dy)` — hors flux : `x += dx`, `y += dy` ; enfant en flux d'un cadre `row` : `dx` déplace d'un rang (dy ignoré) ; `column` : `dy` déplace d'un rang.
- `clipboard.ts` : `interface ClipboardPayload { format: 'maquette-clipboard'; version: 1; nodes: Node[]; colors: ColorStyle[]; text: TextStyle[] }` ; `copyNodes(doc, ids): ClipboardPayload` (copies profondes + styles nommés utilisés) ; `parseClipboard(text: string): ClipboardPayload | null` ; `pasteOps(doc, payload, target: { parent: string; at?: Point }): { ops: Op[]; select: string[] }` — recrée chaque sous-arbre (un `create` par élément, identifiants temporaires) ; hors flux : positions relatives conservées, la boîte des éléments collés est placée à `at` (sinon +10/+10) ; dans un cadre automatique : ajoutés en flux à la fin, `x`/`y` retirés ; une référence de style absente du document est remplacée par sa valeur (copiée dans `payload.colors`/`payload.text`).

Tests (`tests/canvas/selection.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { ascend, contextOf, descend, marqueeSelect, nextSibling, pickClickTarget } from '../../src/renderer/canvas/selection'
import type { FrameNode, Rect } from '../../src/core/types'
import { docWith, frame, rect, text } from '../core/helpers'

function build() {
  const f2 = frame('F2', { layout: { mode: 'auto' }, width: 100, height: 100 }) as FrameNode
  f2.children.push(text('T2'))
  const f1 = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
  f1.children.push(text('T1'), f2)
  return docWith([f1, rect('R1', { x: 500, y: 0 })])
}

describe('règles de sélection', () => {
  const doc = build()

  it('un clic sélectionne l’élément de premier niveau du contexte', () => {
    expect(pickClickTarget(doc, 'T2', { deep: false, context: null })).toBe('F1')
    expect(pickClickTarget(doc, 'T2', { deep: false, context: 'F1' })).toBe('F2')
    expect(pickClickTarget(doc, 'T2', { deep: false, context: 'F2' })).toBe('T2')
    expect(pickClickTarget(doc, 'R1', { deep: false, context: 'F2' })).toBe('R1')
  })

  it('Ctrl+clic : l’élément le plus profond, sauf s’il recouvre tout son parent', () => {
    expect(pickClickTarget(doc, 'T2', { deep: true, context: null })).toBe('T2')
    const rects: Record<string, Rect> = { T2: { x: 0, y: 0, width: 100, height: 100 }, F2: { x: 0, y: 0, width: 100, height: 100 } }
    expect(pickClickTarget(doc, 'T2', { deep: true, context: null, rectOf: (id) => rects[id] })).toBe('F2')
  })

  it('contexte, descendre, remonter, frère suivant', () => {
    expect(contextOf(doc, 'T2')).toBe('F2')
    expect(contextOf(doc, 'F1')).toBeNull()
    expect(descend(doc, 'F1')).toBe('T1')
    expect(descend(doc, 'T1')).toBeNull()
    expect(ascend(doc, 'T2')).toBe('F2')
    expect(ascend(doc, 'F1')).toBeNull()
    expect(nextSibling(doc, 'T1', 1)).toBe('F2')
    expect(nextSibling(doc, 'F2', 1)).toBe('T1')
    expect(nextSibling(doc, 'T1', -1)).toBe('F2')
  })

  it('lasso : éléments du contexte qui intersectent', () => {
    const rects: Record<string, Rect> = {
      F1: { x: 0, y: 0, width: 400, height: 300 }, R1: { x: 500, y: 0, width: 100, height: 100 },
      T1: { x: 0, y: 0, width: 50, height: 20 }, F2: { x: 0, y: 30, width: 100, height: 100 },
    }
    const pageId = doc.pages[0]!.id
    expect(marqueeSelect(doc, pageId, null, (id) => rects[id], { x: 450, y: -10, width: 200, height: 50 })).toEqual(['R1'])
    expect(marqueeSelect(doc, pageId, null, (id) => rects[id], { x: -10, y: -10, width: 1000, height: 50 })).toEqual(['F1', 'R1'])
    expect(marqueeSelect(doc, pageId, 'F1', (id) => rects[id], { x: -10, y: 25, width: 30, height: 10 })).toEqual(['F2'])
  })
})
```

Tests (`tests/canvas/canvasOps.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { applyOps, type Measure } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode, MaquetteDocument, Node } from '../../src/core/types'
import { addAutoLayoutOps, deleteOps, duplicateOps, nudgeOps, wrapInFrameOps, zOrderOps } from '../../src/renderer/canvas/canvasOps'
import { docWith, frame, rect, text } from '../core/helpers'

function run(doc: MaquetteDocument, built: { ops: Parameters<typeof applyOps>[1]; select: string[] }, measure?: Measure) {
  const r = applyOps(doc, built.ops, { measure })
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  const select = built.select.map((id) => (id.startsWith('$') ? r.ids[id]! : id))
  return { doc: r.doc, select }
}
const ids = (list: Node[]) => list.map((n) => n.id)

describe('commandes du canevas', () => {
  it('supprimer ignore un enfant dont le parent est aussi supprimé', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(text('T1'))
    const base = docWith([f, rect('R1', { x: 0, y: 0 })])
    const { doc } = run(base, deleteOps(base, ['T1', 'F1', 'R1']))
    expect(doc.pages[0]!.children).toEqual([])
  })

  it('dupliquer hors flux : décalé de 10, sous-arbre copié, nouvelle sélection', () => {
    const f = frame('F1', { x: 20, y: 30, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(text('T1', { content: 'Bonjour' }))
    const base = docWith([f])
    const { doc, select } = run(base, duplicateOps(base, ['F1']))
    const copy = findNode(doc, select[0]!)!.node as FrameNode
    expect(copy).toMatchObject({ x: 30, y: 40 })
    expect(copy.children[0]).toMatchObject({ content: 'Bonjour' })
    expect(copy.id).not.toBe('F1')
  })

  it('dupliquer en flux : juste après l’original', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(text('T1'), text('T2'))
    const base = docWith([f])
    const { doc, select } = run(base, duplicateOps(base, ['T1']))
    expect(ids((findNode(doc, 'F1')!.node as FrameNode).children)).toEqual(['T1', select[0], 'T2'])
  })

  it('encadrer deux éléments posés sur la page', () => {
    const base = docWith([rect('R1', { x: 10, y: 10, width: 50, height: 50 }), rect('R2', { x: 100, y: 10, width: 50, height: 50 })])
    const { doc, select } = run(base, wrapInFrameOps(base, ['R1', 'R2'], () => undefined))
    const f = findNode(doc, select[0]!)!.node as FrameNode
    expect(f).toMatchObject({ x: 10, y: 10, width: 140, height: 50, fills: [] })
    expect(f.children.map((c) => [c.id, c.x, c.y])).toEqual([['R1', 0, 0], ['R2', 90, 0]])
  })

  it('encadrer dans un cadre automatique : cadre automatique hug, ordre gardé', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto', direction: 'row' } }) as FrameNode
    f.children.push(rect('A'), rect('B'), rect('C'))
    const base = docWith([f])
    const { doc, select } = run(base, wrapInFrameOps(base, ['C', 'B'], () => undefined))
    const parent = findNode(doc, 'F1')!.node as FrameNode
    expect(ids(parent.children)).toEqual(['A', select[0]])
    const w = parent.children[1] as FrameNode
    expect(w).toMatchObject({ width: { mode: 'hug' }, height: { mode: 'hug' }, layout: { mode: 'auto', direction: 'row' } })
    expect(ids(w.children)).toEqual(['B', 'C'])
  })

  it('Maj+A sur un cadre libre : direction, ordre, espacement et marges déduits', () => {
    const f = frame('F1', { x: 0, y: 0, width: 300, height: 100 }) as FrameNode
    f.children.push(rect('B', { x: 80, y: 20, width: 50, height: 40 }), rect('A', { x: 10, y: 20, width: 50, height: 40 }))
    const base = docWith([f])
    const { doc } = run(base, addAutoLayoutOps(base, ['F1'], () => undefined))
    const out = findNode(doc, 'F1')!.node as FrameNode
    expect(out.layout).toMatchObject({ mode: 'auto', direction: 'row', gap: 20, padding: [20, 10, 20, 10] })
    expect(out).toMatchObject({ width: { mode: 'hug' }, height: { mode: 'hug' } })
    expect(ids(out.children)).toEqual(['A', 'B'])
  })

  it('Maj+A sur des éléments : les encadre dans un cadre automatique', () => {
    const base = docWith([rect('R1', { x: 0, y: 0, width: 50, height: 50 }), rect('R2', { x: 0, y: 80, width: 50, height: 50 })])
    const { doc, select } = run(base, addAutoLayoutOps(base, ['R1', 'R2'], () => undefined))
    const f = findNode(doc, select[0]!)!.node as FrameNode
    expect(f.layout).toMatchObject({ mode: 'auto', direction: 'column', gap: 30 })
    expect(ids(f.children)).toEqual(['R1', 'R2'])
  })

  it('ordre d’empilement', () => {
    const base = docWith([rect('A', { x: 0, y: 0 }), rect('B', { x: 0, y: 0 }), rect('C', { x: 0, y: 0 })])
    expect(ids(run(base, zOrderOps(base, ['A'], 'forward')).doc.pages[0]!.children)).toEqual(['B', 'A', 'C'])
    expect(ids(run(base, zOrderOps(base, ['A'], 'front')).doc.pages[0]!.children)).toEqual(['B', 'C', 'A'])
    expect(ids(run(base, zOrderOps(base, ['C'], 'back')).doc.pages[0]!.children)).toEqual(['C', 'A', 'B'])
    expect(ids(run(base, zOrderOps(base, ['A', 'B'], 'front')).doc.pages[0]!.children)).toEqual(['C', 'A', 'B'])
  })

  it('flèches : déplacement hors flux, changement de rang en flux', () => {
    const base = docWith([rect('R1', { x: 5, y: 5 })])
    expect(findNode(run(base, nudgeOps(base, ['R1'], 10, -1)).doc, 'R1')!.node).toMatchObject({ x: 15, y: 4 })
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto', direction: 'row' } }) as FrameNode
    f.children.push(rect('A'), rect('B'))
    const b2 = docWith([f])
    expect(ids((findNode(run(b2, nudgeOps(b2, ['A'], 1, 0)).doc, 'F1')!.node as FrameNode).children)).toEqual(['B', 'A'])
    expect(nudgeOps(b2, ['A'], 0, 1).ops).toEqual([])
  })
})
```

Tests (`tests/canvas/clipboard.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { applyOps } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode } from '../../src/core/types'
import { copyNodes, parseClipboard, pasteOps } from '../../src/renderer/canvas/clipboard'
import { docWith, frame, rect, text } from '../core/helpers'

describe('presse-papiers', () => {
  it('copier puis coller un sous-arbre à un point donné', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(text('T1', { content: 'Salut' }))
    const doc = docWith([f])
    const payload = copyNodes(doc, ['F1'])
    expect(payload.format).toBe('maquette-clipboard')
    const built = pasteOps(doc, payload, { parent: doc.pages[0]!.id, at: { x: 300, y: 40 } })
    const r = applyOps(doc, built.ops)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const pasted = findNode(r.doc, r.ids[built.select[0]!]!)!.node as FrameNode
    expect(pasted).toMatchObject({ x: 300, y: 40 })
    expect(pasted.children[0]).toMatchObject({ content: 'Salut' })
  })

  it('plusieurs éléments gardent leurs positions relatives', () => {
    const doc = docWith([rect('R1', { x: 10, y: 10 }), rect('R2', { x: 100, y: 10 })])
    const built = pasteOps(doc, copyNodes(doc, ['R1', 'R2']), { parent: doc.pages[0]!.id, at: { x: 0, y: 0 } })
    const r = applyOps(doc, built.ops)
    if (!r.ok) throw new Error('échec')
    const [a, b] = built.select.map((t) => findNode(r.doc, r.ids[t]!)!.node)
    expect([a!.x, a!.y, b!.x, b!.y]).toEqual([0, 0, 90, 0])
  })

  it('coller dans un cadre automatique : en flux, à la fin', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(rect('A'))
    const doc = docWith([f, rect('R1', { x: 400, y: 0 })])
    const built = pasteOps(doc, copyNodes(doc, ['R1']), { parent: 'F1' })
    const r = applyOps(doc, built.ops)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const children = (findNode(r.doc, 'F1')!.node as FrameNode).children
    expect(children).toHaveLength(2)
    expect(children[1]!.x).toBeUndefined()
  })

  it('un style absent du document de destination est remplacé par sa valeur', () => {
    const src = docWith([rect('R1', { x: 0, y: 0, fills: [{ style: 'cFond1' }] })])
    src.styles.colors.push({ id: 'cFond1', name: 'fond', value: '#F4F1EA' })
    const dest = docWith([])
    const built = pasteOps(dest, copyNodes(src, ['R1']), { parent: dest.pages[0]!.id })
    const r = applyOps(dest, built.ops)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const n = r.doc.pages[0]!.children[0]!
    expect(n.type === 'shape' && n.fills).toEqual(['#F4F1EA'])
  })

  it('parseClipboard ne reconnaît que le format Maquette', () => {
    const doc = docWith([rect('R1', { x: 0, y: 0 })])
    expect(parseClipboard(JSON.stringify(copyNodes(doc, ['R1'])))).not.toBeNull()
    expect(parseClipboard('bonjour')).toBeNull()
    expect(parseClipboard('{"format":"autre"}')).toBeNull()
  })
})
```

Commit (un par fichier source) : `Ajoute les règles de sélection du canevas`, `Ajoute les commandes du canevas sous forme de lots d'opérations`, `Ajoute le copier-coller d'éléments`.

### Task A4: Raccourcis, gestes dans le store, contour de cadre au-dessus des enfants

**Files:** Create `src/renderer/canvas/shortcuts.ts` ; Modify `src/renderer/state/store.ts`, `src/core/css.ts` ; Test `tests/canvas/shortcuts.test.ts`, `tests/renderer/store.test.ts` (ajouts), `tests/core/css.test.ts` (ajouts).

**Produces:**
- `shortcuts.ts` : `type CommandId = 'tool.move' | 'tool.frame' | 'tool.rect' | 'tool.ellipse' | 'tool.text' | 'undo' | 'redo' | 'delete' | 'duplicate' | 'copy' | 'paste' | 'cut' | 'selectAll' | 'escape' | 'enter' | 'parent' | 'nextSibling' | 'prevSibling' | 'wrapInFrame' | 'addAutoLayout' | 'forward' | 'backward' | 'front' | 'back' | 'zoomIn' | 'zoomOut' | 'zoom100' | 'zoomFit' | 'zoomSelection' | 'nudgeLeft' | 'nudgeRight' | 'nudgeUp' | 'nudgeDown' | 'nudgeLeft10' | 'nudgeRight10' | 'nudgeUp10' | 'nudgeDown10' | 'help'` ; `interface Shortcut { id: CommandId; keys: string; label: string; group: 'Outils' | 'Édition' | 'Sélection' | 'Disposition' | 'Affichage' }` ; `SHORTCUTS: Shortcut[]` (une entrée par commande, `keys` lisible : `Ctrl+D`, `Maj+A`, `Ctrl+Alt+G`, `Ctrl+]`…) ; `interface KeyLike { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }` ; `matchShortcut(e: KeyLike): CommandId | null`. Lettres : comparées sur `key` (insensible à la casse, donc AZERTY/QWERTY suivent la lettre tapée) ; chiffres : sur `code` (`Digit0`, `Digit1`…) ; `Ctrl` = `ctrlKey || metaKey` ; les modificateurs doivent correspondre exactement (une lettre seule ne matche pas si `Ctrl` est enfoncé). `]`/`[` : sur `code` (`BracketRight`/`BracketLeft`). `Suppr` et `Retour arrière` → `delete`. `Ctrl+Y` et `Ctrl+Maj+Z` → `redo`. `Ctrl+=`/`Ctrl++` (code `Equal` ou `NumpadAdd`) → `zoomIn` ; `Ctrl+-` (code `Minus` ou `NumpadSubtract`) → `zoomOut`. `?` : comparé sur `key`, `Maj` ignoré (sur AZERTY, `?` = `Maj+,`).
- `store.ts` : `beginGesture(): void` (mémorise le document courant comme base), `previewGesture(ops: Op[]): ApplyResult` (applique `ops` **à la base** — pas de cumul —, affiche le résultat, ne touche pas l'historique ; si refusé, l'affichage reste sur le dernier aperçu valide), `commitGesture(label: string): void` (une seule entrée d'historique, de la base au dernier aperçu valide ; rien si aucun aperçu valide), `cancelGesture(): void` (revient à la base). `inGesture: boolean` dans l'état.
- `css.ts` : `frameStrokeCss(node: FrameNode, styles: DocStyles): CSS | null` — contour `inside` ou `center` d'un **cadre** dessiné par une couche au-dessus de ses enfants : `{ position: 'absolute', inset: 0, borderRadius, pointerEvents: 'none', zIndex: 2147483647 }` + `boxShadow: 'inset 0 0 0 Npx C'` (inside) ou `outline: 'Npx solid C'` + `outlineOffset: '-N/2px'` (center). `nodeCss` d'un cadre n'inclut plus ces contours (les `outside` et les ombres restent sur le cadre). Formes et images : inchangé.

Tests (`tests/canvas/shortcuts.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { SHORTCUTS, matchShortcut, type KeyLike } from '../../src/renderer/canvas/shortcuts'

const k = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
})

describe('raccourcis', () => {
  it('outils sans modificateur ; une lettre avec Ctrl ne choisit pas d’outil', () => {
    expect(matchShortcut(k('r', 'KeyR'))).toBe('tool.rect')
    expect(matchShortcut(k('t', 'KeyT'))).toBe('tool.text')
    expect(matchShortcut(k('f', 'KeyF'))).toBe('tool.frame')
    expect(matchShortcut(k('o', 'KeyO'))).toBe('tool.ellipse')
    expect(matchShortcut(k('v', 'KeyV'))).toBe('tool.move')
    expect(matchShortcut(k('r', 'KeyR', { ctrlKey: true }))).toBeNull()
  })

  it('AZERTY : les lettres suivent la lettre tapée, les chiffres la touche physique', () => {
    expect(matchShortcut(k('A', 'KeyQ', { shiftKey: true }))).toBe('addAutoLayout')
    expect(matchShortcut(k('d', 'KeyD', { ctrlKey: true }))).toBe('duplicate')
    expect(matchShortcut(k('à', 'Digit0', { ctrlKey: true }))).toBe('zoom100')
    expect(matchShortcut(k('1', 'Digit1', { shiftKey: true }))).toBe('zoomFit')
    expect(matchShortcut(k('2', 'Digit2', { shiftKey: true }))).toBe('zoomSelection')
  })

  it('édition', () => {
    expect(matchShortcut(k('z', 'KeyZ', { ctrlKey: true }))).toBe('undo')
    expect(matchShortcut(k('y', 'KeyY', { ctrlKey: true }))).toBe('redo')
    expect(matchShortcut(k('Z', 'KeyZ', { ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(matchShortcut(k('Delete', 'Delete'))).toBe('delete')
    expect(matchShortcut(k('Backspace', 'Backspace'))).toBe('delete')
    expect(matchShortcut(k('g', 'KeyG', { ctrlKey: true, altKey: true }))).toBe('wrapInFrame')
    expect(matchShortcut(k('c', 'KeyC', { ctrlKey: true }))).toBe('copy')
    expect(matchShortcut(k('v', 'KeyV', { ctrlKey: true }))).toBe('paste')
    expect(matchShortcut(k('a', 'KeyA', { ctrlKey: true }))).toBe('selectAll')
  })

  it('ordre, sélection, flèches, aide', () => {
    expect(matchShortcut(k(']', 'BracketRight', { ctrlKey: true }))).toBe('forward')
    expect(matchShortcut(k('[', 'BracketLeft', { ctrlKey: true }))).toBe('backward')
    expect(matchShortcut(k('Enter', 'Enter'))).toBe('enter')
    expect(matchShortcut(k('Enter', 'Enter', { shiftKey: true }))).toBe('parent')
    expect(matchShortcut(k('Tab', 'Tab'))).toBe('nextSibling')
    expect(matchShortcut(k('Tab', 'Tab', { shiftKey: true }))).toBe('prevSibling')
    expect(matchShortcut(k('ArrowLeft', 'ArrowLeft'))).toBe('nudgeLeft')
    expect(matchShortcut(k('ArrowDown', 'ArrowDown', { shiftKey: true }))).toBe('nudgeDown10')
    expect(matchShortcut(k('Escape', 'Escape'))).toBe('escape')
    expect(matchShortcut(k('?', 'Comma', { shiftKey: true }))).toBe('help')
    expect(matchShortcut(k('=', 'Equal', { ctrlKey: true }))).toBe('zoomIn')
    expect(matchShortcut(k('-', 'Minus', { ctrlKey: true }))).toBe('zoomOut')
  })

  it('chaque commande a une entrée lisible dans la table', () => {
    const ids = new Set(SHORTCUTS.map((s) => s.id))
    expect(ids.size).toBe(SHORTCUTS.length)
    expect(SHORTCUTS.find((s) => s.id === 'duplicate')).toMatchObject({ keys: 'Ctrl+D', group: 'Édition' })
  })
})
```

Tests à ajouter à `tests/renderer/store.test.ts` :
```ts
describe('gestes', () => {
  it('un geste = une seule entrée d’historique', () => {
    const s = docStore.getState()
    s.beginGesture()
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'B' } }])
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'C' } }])
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('C')
    expect(docStore.getState().canUndo).toBe(false)
    docStore.getState().commitGesture('Renommer')
    expect(docStore.getState()).toMatchObject({ canUndo: true, dirty: true, inGesture: false })
    docStore.getState().undo()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('A')
    expect(docStore.getState().canUndo).toBe(false)
  })

  it('les aperçus ne se cumulent pas : chacun part de la base', () => {
    const s = docStore.getState()
    s.beginGesture()
    s.previewGesture([{ op: 'update', id: 'r00001', set: { opacity: 0.5 } }])
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'B' } }])
    expect(docStore.getState().doc.pages[0]!.children[0]).toMatchObject({ name: 'B', opacity: 1 })
  })

  it('annuler le geste revient à la base sans historique', () => {
    const s = docStore.getState()
    s.beginGesture()
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'B' } }])
    docStore.getState().cancelGesture()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('A')
    expect(docStore.getState()).toMatchObject({ canUndo: false, inGesture: false })
  })

  it('un aperçu refusé garde le dernier aperçu valide', () => {
    const s = docStore.getState()
    s.beginGesture()
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'B' } }])
    const r = s.previewGesture([{ op: 'update', id: 'absent', set: { name: 'X' } }])
    expect(r.ok).toBe(false)
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('B')
    docStore.getState().commitGesture('Renommer')
    docStore.getState().undo()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('A')
  })

  it('valider sans aperçu ne crée pas d’entrée', () => {
    docStore.getState().beginGesture()
    docStore.getState().commitGesture('Rien')
    expect(docStore.getState().canUndo).toBe(false)
  })
})
```

Tests à ajouter à `tests/core/css.test.ts` (dans le `describe`, et ajouter `frameStrokeCss` à l'import) :
```ts
  it('contour intérieur d’un cadre : dessiné par une couche au-dessus des enfants', () => {
    const f = frame('f00009', { x: 0, y: 0, radius: 12, stroke: { color: '#FF0000', width: 2, align: 'inside' }, shadows: [{ x: 0, y: 4, blur: 8, spread: 0, color: '#00000040', inset: false }] }) as FrameNode
    expect(nodeCss(f, null, styles).boxShadow).toBe('0px 4px 8px 0px #00000040')
    expect(frameStrokeCss(f, styles)).toEqual({
      position: 'absolute', inset: 0, borderRadius: '12px', pointerEvents: 'none', zIndex: 2147483647,
      boxShadow: 'inset 0 0 0 2px #FF0000',
    })
  })

  it('contour centré d’un cadre en couche ; extérieur et sans contour : pas de couche', () => {
    const c = frame('f00010', { x: 0, y: 0, stroke: { color: '#000000', width: 4, align: 'center' } }) as FrameNode
    expect(frameStrokeCss(c, styles)).toMatchObject({ outline: '4px solid #000000', outlineOffset: '-2px' })
    expect(nodeCss(c, null, styles).outline).toBeUndefined()
    const o = frame('f00011', { x: 0, y: 0, stroke: { color: '#000000', width: 4, align: 'outside' } }) as FrameNode
    expect(frameStrokeCss(o, styles)).toBeNull()
    expect(nodeCss(o, null, styles).boxShadow).toBe('0 0 0 4px #000000')
    expect(frameStrokeCss(frame('f00012', { x: 0, y: 0 }) as FrameNode, styles)).toBeNull()
  })
```

Commits : `Ajoute la table des raccourcis clavier, indépendante de la disposition du clavier`, `Ajoute les gestes au store : un aperçu en direct, une seule entrée d'historique`, `Dessine le contour intérieur d'un cadre au-dessus de ses enfants`.

---

## Phase B — intégration (session principale, séquentielle)

Chaque tâche : écrire d'abord le(s) test(s) e2e listé(s) dans `e2e/canvas-*.spec.ts`, constater l'échec, intégrer, vert, commit. Les tests pilotent la vraie fenêtre avec `page.mouse`, `page.keyboard` et lisent l'état via `window.__maquetteStore` / `window.__maquetteUi` (exposés quand l'URL contient `e2e`).

### Task B1: Store d'interface, caméra, `Canvas`

**Files:** Create `src/renderer/state/ui.ts`, `src/renderer/canvas/Canvas.tsx`, `src/renderer/canvas/rects.ts` ; Modify `DocumentView.tsx` (remplacé par `Canvas`), `measure.ts` (zoom lu dans le store d'interface), `NodeView.tsx` (`React.memo` + couche de contour `frameStrokeCss`), `App.tsx`, `main.tsx` (exposer `__maquetteUi`), `app.css`.

Comportement : le monde est un `div` transformé par `translate(x px, y px) scale(zoom)` ; molette = déplacement (`wheelPan`) ; `Ctrl`+molette et pincement = `zoomAt(wheelZoomFactor)` au curseur ; écouteur `wheel` **non passif** avec `preventDefault()` ; Espace maintenu + glisser ou clic molette + glisser = déplacement ; `Ctrl+0`, `Ctrl+=`/`Ctrl+-` (`stepZoom` au centre), `Maj+1` (tout voir, animation 220 ms), `Maj+2` (sélection) ; badge de zoom en bas à droite (`data-testid="zoom"`, ex. « 100 % ») ; au chargement d'un document, cadrage « tout voir ».

e2e (`e2e/canvas-camera.spec.ts`) : (1) `Ctrl`+molette sur le titre de `demo.maquette` → le titre reste sous le curseur (écart ≤ 2 px) et le badge change ; (2) molette seule → le monde se déplace, le zoom ne change pas ; (3) `Ctrl+0` → « 100 % » ; (4) Espace + glisser de 100 px → le titre se déplace de 100 px ; (5) le zoom de la page Electron reste à 1 après un `Ctrl`+molette (`await app.evaluate(({ webContents }) => webContents.getAllWebContents()[0].getZoomFactor())` = 1).

Commit : `Ajoute le canevas : caméra, zoom vers le curseur, déplacement, cadrage`.

### Task B2: Surcouche et sélection

**Files:** Create `src/renderer/canvas/Overlay.tsx`, `src/renderer/canvas/interaction.ts` ; Modify `Canvas.tsx`.

Comportement : survol = contour fin ; sélection = cadre + 8 poignées (8 px visibles, zone de 15 px, masquées sous 10 px) + étiquette « L × H » ; clic selon `pickClickTarget` (contexte = parent de la sélection courante) ; double-clic (`createClickTracker`) = descendre sous le pointeur ; `Ctrl`+clic = profond ; `Maj`+clic = ajouter/retirer ; glisser dans le vide = lasso (`marqueeSelect`) ; `Échap` = remonter puis désélectionner ; `Entrée`/`Maj+Entrée`/`Tab`/`Maj+Tab` ; `Ctrl+A` = tous les éléments du contexte ; `Alt` + survol avec une sélection = lignes de distance (`distanceLines`) avec leurs valeurs ; grille de pixels dès 400 %.

e2e (`e2e/canvas-select.spec.ts`) : clic sur le titre → sélection = le cadre Hero ; double-clic → le titre ; `Échap` → le cadre ; `Échap` → rien ; `Maj`+clic sur un 2ᵉ élément de premier niveau → 2 sélectionnés ; lasso autour des deux → 2 ; poignées visibles (8 éléments `[data-handle]`).

Commit : `Ajoute la sélection au clic, au double-clic, au lasso et la surcouche de sélection`.

### Task B3: Déplacement libre, magnétisme, flèches

**Files:** Modify `interaction.ts`, `Overlay.tsx`.

Comportement : glisser un élément (au-delà de 4 px écran) dans un parent libre ou sur la page → `beginGesture`, `previewGesture([move x/y])` à chaque mouvement avec `snapMove` (cibles : frères visibles + parent, seuil 5 px écran ÷ zoom) et guides magenta, `commitGesture('Déplacer')` au relâchement ; `Ctrl` coupe le magnétisme ; perte de capture du pointeur ou de focus de la fenêtre → `commitGesture` ; `Échap` pendant le geste → `cancelGesture` ; positions arrondies au pixel ; flèches = `nudgeOps` (une entrée par appui).

e2e (`e2e/canvas-move.spec.ts`) : glisser un rectangle de +50/+30 → x/y du document +50/+30 ; `Ctrl+Z` une fois → position d'origine ; glisser près du bord d'un voisin (à 3 px) → aligné exactement ; même chose avec `Ctrl` → pas aligné ; `Échap` pendant le glisser → position d'origine, pas d'historique ; flèche droite → x+1, `Maj`+flèche → x+10.

Commit : `Ajoute le déplacement à la souris avec magnétisme, et les flèches`.

### Task B4: Redimensionnement et bascules de taille

**Files:** Modify `interaction.ts`, `Overlay.tsx`.

Comportement : tirer une poignée → l'axe touché passe en fixe (spec §6) et prend la nouvelle taille ; bords magnétiques (`snapValue`) ; `Maj` garde les proportions ; tailles ≥ 1 px ; une entrée d'historique. Double-clic sur un bord de la boîte → l'axe passe en `hug` (si permis, sinon rien) ; `Alt` + double-clic → `fill` (si permis).

e2e (`e2e/canvas-resize.spec.ts`) : tirer la poignée droite d'un rectangle de +40 → largeur +40, hauteur inchangée, `Ctrl+Z` en une fois ; poignée de coin avec `Maj` → proportions gardées ; double-clic sur le bord bas d'un cadre automatique en hauteur fixe → hauteur `hug`.

Commit : `Ajoute le redimensionnement par poignées et les bascules hug/fill au double-clic`.

### Task B5: Glisser dans un cadre automatique

**Files:** Modify `interaction.ts`, `Overlay.tsx`.

Comportement : glisser un enfant en flux → dans le même cadre, `insertionIndex` à chaque mouvement, réordonnancement **en direct** (`previewGesture([move index])`), frères animés (FLIP : mesurer avant/après, `transform` transitoire de 150 ms) ; hors du cadre au-dessus d'un autre cadre automatique → trait d'insertion (`insertionMarker`), dépôt au relâchement ; au-dessus d'un cadre libre ou de la page → l'élément suit le pointeur (x/y) ; un seul `commitGesture('Déplacer')`.

e2e (`e2e/canvas-reorder.spec.ts`) : dans Hero (colonne), glisser le titre sous le 2ᵉ texte → ordre inversé, `Ctrl+Z` une fois → ordre d'origine ; glisser le titre hors du cadre sur la page → il devient un élément de premier niveau à la position de dépôt.

Commit : `Ajoute le réordonnancement en direct et le changement de parent dans les cadres automatiques`.

### Task B6: Outils de création et images

**Files:** Create `src/main/images.ts` ; Modify `src/main/ipc.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `interaction.ts`, `Canvas.tsx` (barre d'outils minimale en haut, `data-tool`).

Comportement : `V` `F` `R` `O` `T` ; avec `F`/`R`/`O` : glisser = dessiner (rectangle normalisé, `Maj` = carré), simple clic = taille par défaut (cadre 400×300, forme 100×100) ; le nouvel élément est créé dans le cadre sous le pointeur (en flux s'il est automatique), sinon sur la page ; retour à l'outil `V` après création ; `T` : clic = texte « Texte » créé et ouvert en édition. Images : glisser-déposer un ou plusieurs fichiers image depuis l'explorateur → la fenêtre lit les octets (`File.arrayBuffer()`) et appelle `maquette.importImage(nom, octets)` ; le principal (`images.ts`) refuse au-delà de 50 Mo ou hors `png/jpg/jpeg/gif/webp/svg/avif`, calcule le SHA-256, écrit `assets/<16 premiers hex>.<ext>` à côté du document courant (sans réécrire s'il existe) et renvoie `{ src }` ; document jamais enregistré → la fenêtre lance d'abord « Enregistrer sous » puis importe ; l'image est créée au point de dépôt à sa taille naturelle, ramenée à 800 px de large au plus.

Tests : unitaires `tests/main/images.test.ts` (nom par empreinte, pas de doublon, refus taille/extension) ; e2e (`e2e/canvas-create.spec.ts`) : `R` + glisser 80×60 → rectangle 80×60 à cet endroit ; `F` + clic → cadre 400×300 ; `T` + clic + taper « Coucou » + `Échap` → texte « Coucou » ; déposer un PNG synthétique (`DataTransfer` construit dans la page) sur un document enregistré → image visible, fichier présent dans `assets/`.

Commits : `Ajoute l'import d'images dans le dossier assets par empreinte`, `Ajoute les outils de création cadre, rectangle, ellipse, texte et le dépôt d'images`.

### Task B7: Édition de texte sur place

**Files:** Create `src/renderer/canvas/TextEditor.tsx` ; Modify `NodeView.tsx`, `interaction.ts`.

Comportement : double-clic sur un texte sélectionné (ou `Entrée`) → l'élément devient `contentEditable="plaintext-only"`, texte entièrement sélectionné ; les raccourcis du canevas sont **désactivés** pendant l'édition ; `Entrée` = retour à la ligne ; `Échap` ou clic ailleurs = fin ; à la fin : une seule opération `update content` (une entrée « Modifier le texte ») ; texte vide → l'élément est supprimé (même entrée).

e2e (`e2e/canvas-text.spec.ts`) : double-cliquer deux fois sur le titre, taper « Nouveau titre », `Échap` → contenu changé, `Ctrl+Z` une fois → « Bonjour Maquette » ; pendant l'édition, taper `R` puis `Suppr` → agit sur le texte, aucun rectangle créé, élément non supprimé ; vider le texte → élément supprimé.

Commit : `Ajoute l'édition de texte sur place`.

### Task B8: Commandes clavier et aide

**Files:** Create `src/renderer/canvas/HelpOverlay.tsx` ; Modify `interaction.ts` (aiguillage `matchShortcut` → `canvasOps`/`clipboard`/caméra/outils), `src/renderer/state/commands.ts` (Annuler/Rétablir du menu passent par le même chemin).

Comportement : toutes les commandes de `SHORTCUTS` ; copier/couper écrivent le JSON `maquette-clipboard` dans le presse-papiers système (`navigator.clipboard.writeText`) ; coller lit le presse-papiers (format Maquette seulement) et colle dans le contexte courant, à la position du pointeur s'il est sur le canevas ; `?` ouvre la fenêtre d'aide, groupée par `group`.

e2e (`e2e/canvas-commands.spec.ts`) : `Ctrl+D` → un élément de plus, sélection = la copie ; `Suppr` → supprimé ; `Ctrl+Alt+G` sur deux rectangles → un cadre les contient ; `Maj+A` sur ce cadre → mise en page automatique ; `Ctrl+C` puis `Ctrl+V` → copie collée ; `Ctrl+]` → ordre changé ; `?` → aide visible avec « Ctrl+D ».

Commit : `Branche les commandes clavier du canevas et la fenêtre d'aide`.

### Task B9: Tenue en charge

**Files:** Create `e2e/fixtures/charge-2000.maquette` (généré par un script de test : un cadre automatique en ligne avec retour à la ligne contenant 2 000 rectangles) ; Test `e2e/canvas-perf.spec.ts`.

e2e : ouvrir le fichier ; 20 événements `Ctrl`+molette en moins de 2 s au total ; glisser un rectangle sur 200 px en 20 étapes en moins de 3 s ; l'interface reste réactive (le badge de zoom se met à jour). Si ça échoue : ne rendre que les cadres de premier niveau visibles (cadrage), et noter la mesure dans le commit.

Commit : `Vérifie la tenue en charge du canevas avec 2 000 éléments`.

### Fin du plan

1. `npm run typecheck && npm test && npm run e2e` verts.
2. Relecture finale par un agent neuf (lecture seule) sur tout le plan 2 ; corriger ce qui est confirmé, chaque correctif avec son test.
3. Captures d'écran (Playwright) des états clés — sélection avec poignées, guides de magnétisme, trait d'insertion, édition de texte, fenêtre d'aide — enregistrées dans `docs/captures/plan-2/` et envoyées à l'utilisateur.
