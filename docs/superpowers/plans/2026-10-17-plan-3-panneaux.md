# Maquette — Plan 3 : Panneaux, styles nommés, polices

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pouvoir tout régler sans le clavier : pages et calques à gauche, propriétés à droite (position, tailles fixe/hug/fill, mise en page automatique, texte, remplissage, contour, arrondi, ombre, opacité), styles nommés (couleurs, textes), polices Google Fonts avec cache local.

**Architecture:** Même découpage que le plan 2. **Phase A** (agents en parallèle) : modules purs testés — calcul des propriétés et lots d'opérations (`panels/props.ts`), lignes et dépôt de l'arbre des calques (`panels/layerRows.ts`), cache des polices côté principal (`main/fonts.ts`), opération `page.move` du noyau. **Phase B** (séquentielle) : l'interface React des panneaux, branchée sur les stores, et le chargement des polices dans la fenêtre.

**Spec:** §5.4 (polices, cache local), §5.5 (styles nommés), §8 (panneaux), §13 (police de secours visible).

## Global Constraints

- Contraintes des plans 1 et 2 (versions exactes, `src/core` pur, textes en français, commits en français sans `Co-Authored-By`, un commit par changement, pas de push).
- Aucune nouvelle dépendance npm.
- **Jamais de refus à la souris** : un choix impossible est grisé avec sa raison au survol ; une saisie invalide revient à la valeur précédente.
- Chaque modification depuis un panneau = **une** entrée d'historique (le glisser sur une étiquette numérique est un geste : `beginGesture`/`previewGesture`/`commitGesture`).
- Polices : catalogue `https://fonts.google.com/metadata/fonts` (sans clé), feuilles `https://fonts.googleapis.com/css2`, fichiers `woff2` mis en cache dans `<userData>/fonts/` et servis par le protocole `mfont://` ; hors connexion, le cache suffit ; police introuvable → signalée, jamais remplacée en silence.

## Review Focus

1. **Saisie numérique invalide** (« abc », « 2** », vide) → la valeur précédente revient, aucune opération. Test : A2 (`evalNumber`) + B4 (e2e).
2. **Sélection multiple aux valeurs différentes** → le champ affiche « Mixte » ; une saisie s'applique à tous. Test : A2 (`mixed`) + B4.
3. **Hors connexion avec un cache vide** → le catalogue de secours (polices système courantes + Inter) s'affiche, pas d'erreur bloquante. Test : A4.
4. **Glisser sur une étiquette puis `Ctrl+Z`** → une seule annulation. Test : B4.
5. **Renommer un calque avec un nom vide** → le nom précédent revient. Test : B3.

---

## Phase A — modules purs (en parallèle)

### Task A1: Opération `page.move` (noyau)

**Files:** Modify `src/core/ops.ts` ; Test `tests/core/ops.test.ts`.

`{ op: 'page.move'; id: string; index: number }` — déplace la page à l'indice final (borné), identifiants temporaires acceptés.

```ts
  it('page.move réordonne les pages', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'page.create', id: '$b', name: 'B' },
      { op: 'page.create', id: '$c', name: 'C' },
      { op: 'page.move', id: '$c', index: 0 },
    ]))
    expect(r.doc.pages.map((p) => p.name)).toEqual(['C', 'Page 1', 'B'])
    const r2 = applyOps(r.doc, [{ op: 'page.move', id: 'absent', index: 0 }])
    expect(r2.ok).toBe(false)
  })
```

Commit : `Ajoute l'opération page.move`.

### Task A2: Propriétés et lots d'opérations des panneaux

**Files:** Create `src/renderer/panels/props.ts` ; Test `tests/panels/props.test.ts`.

**Produces:**
- `evalNumber(input: string): number | null` — nombres décimaux (point ou virgule), `+ - * /`, parenthèses, signe moins unaire ; tout autre caractère, résultat non fini ou chaîne vide → `null`. Pas d'`eval`.
- `formatNumber(n: number): string` — au plus 2 décimales, zéros inutiles retirés, `-0` → `0`.
- `mixed<T>(values: T[]): T | 'mixed' | null` — `null` si liste vide, la valeur si toutes égales (égalité structurelle), sinon `'mixed'`.
- `type SizeChoice = 'fixed' | 'hug' | 'fill'` ; `sizingChoices(doc, id, axis): Record<SizeChoice, { ok: boolean; reason?: string }>` — `fixed` toujours possible ; `hug` seulement texte ou cadre automatique (raison : « S'adapter au contenu : réservé aux textes et aux cadres en mise en page automatique ») ; `fill` seulement enfant en flux d'un cadre automatique (raison : « Remplir : réservé aux enfants d'un cadre en mise en page automatique »).
- `sizeOps(doc, ids, axis, choice, measure): Op[]` — ne touche que les éléments où le choix est permis ; `fixed` = taille mesurée arrondie (ou valeur actuelle si déjà fixe).
- `setOps(ids, set): Op[]` — une opération `update` par élément.
- `positionOps(doc, ids, axis: 'x' | 'y', value): Op[]` — ignore les enfants en flux.

Tests (`tests/panels/props.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import { applyOps } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode } from '../../src/core/types'
import { evalNumber, formatNumber, mixed, positionOps, setOps, sizeOps, sizingChoices } from '../../src/renderer/panels/props'
import { docWith, frame, rect, text } from '../core/helpers'

describe('saisie numérique', () => {
  it.each([
    ['24*2', 48], [' 10 + 5 ', 15], ['1,5', 1.5], ['(2+3)*4', 20], ['-8', -8], ['10/4', 2.5], ['-(2+2)', -4], ['3.25', 3.25],
  ])('%s → %s', (input, expected) => expect(evalNumber(input)).toBe(expected))

  it.each(['', 'abc', '2**3', '1/0', '2+', 'alert(1)', '1e999'])('%s → null', (input) => expect(evalNumber(input)).toBeNull())

  it('formatNumber', () => {
    expect(formatNumber(12)).toBe('12')
    expect(formatNumber(12.345)).toBe('12.35')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(-0)).toBe('0')
  })

  it('mixed', () => {
    expect(mixed([1, 1])).toBe(1)
    expect(mixed([1, 2])).toBe('mixed')
    expect(mixed([{ mode: 'hug' }, { mode: 'hug' }])).toEqual({ mode: 'hug' })
    expect(mixed([])).toBeNull()
  })
})

describe('tailles', () => {
  const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
  f.children.push(text('T1'), rect('R1'))
  const doc = docWith([f, rect('R2', { x: 500, y: 0 })])

  it('choix permis et raisons', () => {
    const top = sizingChoices(doc, 'R2', 'width')
    expect(top.fixed.ok).toBe(true)
    expect(top.hug).toMatchObject({ ok: false })
    expect(top.hug.reason).toContain('cadres en mise en page automatique')
    expect(top.fill.reason).toContain('enfants d’un cadre')
    expect(sizingChoices(doc, 'T1', 'width')).toMatchObject({ hug: { ok: true }, fill: { ok: true } })
    expect(sizingChoices(doc, 'F1', 'height')).toMatchObject({ hug: { ok: true }, fill: { ok: false } })
  })

  it('sizeOps : fixe = taille mesurée ; les éléments où le choix est impossible sont ignorés', () => {
    const ops = sizeOps(doc, ['T1', 'R2'], 'width', 'fixed', (id) => (id === 'T1' ? { x: 0, y: 0, width: 87.6, height: 19 } : undefined))
    const r = applyOps(doc, ops)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(findNode(r.doc, 'T1')!.node).toMatchObject({ width: 88, textSizing: 'auto-height' })
    expect(sizeOps(doc, ['R2'], 'width', 'fill', () => undefined)).toEqual([])
  })

  it('positionOps ignore les enfants en flux ; setOps', () => {
    expect(positionOps(doc, ['R1', 'R2'], 'x', 40)).toEqual([{ op: 'update', id: 'R2', set: { x: 40 } }])
    expect(setOps(['R1', 'R2'], { opacity: 0.5 })).toEqual([
      { op: 'update', id: 'R1', set: { opacity: 0.5 } },
      { op: 'update', id: 'R2', set: { opacity: 0.5 } },
    ])
  })
})
```

Commit : `Ajoute le calcul des propriétés et les lots d'opérations des panneaux`.

### Task A3: Arbre des calques

**Files:** Create `src/renderer/panels/layerRows.ts` ; Test `tests/panels/layerRows.test.ts`.

**Produces:**
- `interface LayerRow { id: string; name: string; type: NodeType; depth: number; parentId: string | null; hasChildren: boolean; expanded: boolean; visible: boolean; locked: boolean; auto: boolean }` (`auto` : le parent est en mise en page automatique).
- `layerRows(page: Page, expanded: ReadonlySet<string>): LayerRow[]` — ordre du panneau de Figma : dans la page et dans un cadre libre, **l'élément du dessus en premier** (ordre inverse des enfants) ; dans un cadre automatique, l'ordre de la mise en page (premier enfant en premier). Les enfants d'un cadre non déplié ne sont pas listés.
- `layerDrop(page: Page, rows: LayerRow[], overIndex: number, ratio: number, dragged: string[]): { parent: string; index: number } | null` — `ratio` = position verticale du pointeur dans la ligne (0 en haut, 1 en bas). Quart haut → avant la ligne, quart bas → après, milieu d'un cadre → à l'intérieur (en dernier visuellement : au-dessus dans un cadre libre, à la fin dans un cadre automatique), milieu d'un autre élément → avant. Renvoie l'**indice dans le tableau `children` du document** (en tenant compte de l'inversion). Déposer dans soi-même ou un descendant → `null`.

Tests (`tests/panels/layerRows.test.ts`) :
```ts
import { describe, it, expect } from 'vitest'
import type { FrameNode } from '../../src/core/types'
import { layerDrop, layerRows } from '../../src/renderer/panels/layerRows'
import { docWith, frame, rect, text } from '../core/helpers'

function build() {
  const auto = frame('A1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
  auto.children.push(text('T1'), text('T2'))
  const free = frame('L1', { x: 0, y: 0 }) as FrameNode
  free.children.push(rect('R1', { x: 0, y: 0 }), rect('R2', { x: 0, y: 0 }))
  return docWith([auto, free, rect('R3', { x: 0, y: 0 })]).pages[0]!
}

describe('arbre des calques', () => {
  const page = build()

  it('ordre de Figma : dessus en premier, mais ordre de la mise en page dans un cadre automatique', () => {
    const rows = layerRows(page, new Set(['A1', 'L1']))
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ['R3', 0], ['L1', 0], ['R2', 1], ['R1', 1], ['A1', 0], ['T1', 1], ['T2', 1],
    ])
    expect(rows.find((r) => r.id === 'T1')).toMatchObject({ parentId: 'A1', auto: true })
  })

  it('un cadre replié cache ses enfants', () => {
    expect(layerRows(page, new Set()).map((r) => r.id)).toEqual(['R3', 'L1', 'A1'])
  })

  it('dépôt avant / après / dans', () => {
    const rows = layerRows(page, new Set(['A1', 'L1']))
    const at = (id: string) => rows.findIndex((r) => r.id === id)
    // Avant R3 (tout en haut de la page) = au-dessus de tout = fin du tableau children de la page.
    expect(layerDrop(page, rows, at('R3'), 0.1, ['R1'])).toEqual({ parent: page.id, index: 3 })
    // Après T1 dans le cadre automatique = indice 1.
    expect(layerDrop(page, rows, at('T1'), 0.9, ['R3'])).toEqual({ parent: 'A1', index: 1 })
    // Au milieu du cadre libre L1 = à l'intérieur, au-dessus = fin de ses enfants.
    expect(layerDrop(page, rows, at('L1'), 0.5, ['R3'])).toEqual({ parent: 'L1', index: 2 })
    // Au milieu d'un rectangle = avant lui.
    expect(layerDrop(page, rows, at('R2'), 0.5, ['R3'])).toEqual({ parent: 'L1', index: 2 })
    // Dans soi-même : interdit.
    expect(layerDrop(page, rows, at('T1'), 0.5, ['A1'])).toBeNull()
  })
})
```

Commit : `Ajoute le calcul des lignes et du dépôt de l'arbre des calques`.

### Task A4: Cache des polices Google (processus principal)

**Files:** Create `src/main/fonts.ts`, `src/main/fontPath.ts` ; Test `tests/main/fonts.test.ts`.

**Produces:**
- `interface FontInfo { family: string; category: string; weights: number[]; italic: boolean; variable: { min: number; max: number } | null }`.
- `parseCatalog(text: string): FontInfo[]` — accepte un préfixe parasite avant le premier `{` ; `weights` triés ; `variable` depuis l'axe `wght`.
- `FALLBACK_FONTS: FontInfo[]` — Inter, Arial, Georgia, Times New Roman, Verdana, Courier New, system-ui (catégories correctes).
- `css2Url(info: FontInfo): string` — variable : `family=Nom+Avec+Plus:ital,wght@0,MIN..MAX;1,MIN..MAX` (sans `ital` si pas d'italique : `:wght@MIN..MAX`) ; statique : liste des tuples ; `&display=swap`.
- `rewriteCss(css: string, name: (url: string) => string): { css: string; urls: string[] }` — remplace chaque `url(https://fonts.gstatic.com/...)` par `url(mfont://<name>)`.
- `class FontCache { constructor(dir: string, fetchText: (url) => Promise<string>, fetchBytes: (url) => Promise<Uint8Array>, now = Date.now) ; catalog(): Promise<FontInfo[]> ; css(family: string): Promise<string | null> }` — catalogue mis en cache dans `dir/catalog.json` (rafraîchi après 30 jours ; réseau en échec → cache, sinon `FALLBACK_FONTS`) ; `css(family)` : feuille en cache `dir/css/<sha16 du nom>.css`, sinon téléchargée (avec un en-tête navigateur pour obtenir du woff2), fichiers écrits dans `dir/files/<sha16 de l'URL>.woff2` ; famille inconnue du catalogue → `null` ; réseau en échec et rien en cache → `null`.
- `fontPath.ts` : `resolveFontFile(dir: string, name: string): string | null` — accepte seulement `^[0-9a-f]{16}\.woff2$`.

Tests (`tests/main/fonts.test.ts`) :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FALLBACK_FONTS, FontCache, css2Url, parseCatalog, rewriteCss } from '../../src/main/fonts'
import { resolveFontFile } from '../../src/main/fontPath'

const META = `)]}'\n{"familyMetadataList":[
  {"family":"Inter","category":"Sans Serif","fonts":{"400":{},"700":{},"400i":{}},"axes":[{"tag":"wght","min":100,"max":900}]},
  {"family":"Playfair Display","category":"Serif","fonts":{"700":{},"400":{}},"axes":[]}
]}`
const CSS = `@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/a.woff2) format('woff2'); }
@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/b.woff2) format('woff2'); }`

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'polices '))
})

describe('polices', () => {
  it('lit le catalogue', () => {
    const list = parseCatalog(META)
    expect(list[0]).toEqual({ family: 'Inter', category: 'Sans Serif', weights: [400, 700], italic: true, variable: { min: 100, max: 900 } })
    expect(list[1]).toMatchObject({ family: 'Playfair Display', weights: [400, 700], italic: false, variable: null })
  })

  it('adresse css2', () => {
    const [inter, playfair] = parseCatalog(META)
    expect(css2Url(inter!)).toBe('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap')
    expect(css2Url(playfair!)).toBe('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap')
  })

  it('réécrit les adresses de fichiers', () => {
    const { css, urls } = rewriteCss(CSS, (u) => (u.endsWith('a.woff2') ? 'aaaa.woff2' : 'bbbb.woff2'))
    expect(urls).toEqual(['https://fonts.gstatic.com/s/inter/a.woff2', 'https://fonts.gstatic.com/s/inter/b.woff2'])
    expect(css).toContain('url(mfont://aaaa.woff2)')
    expect(css).not.toContain('gstatic')
  })

  it('télécharge une fois, puis sert depuis le cache même hors connexion', async () => {
    let calls = 0
    const online = new FontCache(dir, async (u) => { calls++; return u.includes('metadata') ? META : CSS }, async () => new Uint8Array([1, 2, 3]))
    expect((await online.catalog()).map((f) => f.family)).toEqual(['Inter', 'Playfair Display'])
    const css = await online.css('Inter')
    expect(css).toMatch(/url\(mfont:\/\/[0-9a-f]{16}\.woff2\)/)
    expect(await readdir(join(dir, 'files'))).toHaveLength(2)
    const offline = new FontCache(dir, async () => { throw new Error('hors ligne') }, async () => { throw new Error('hors ligne') })
    expect((await offline.catalog()).length).toBe(2)
    expect(await offline.css('Inter')).toBe(css)
    expect(calls).toBe(2)
  })

  it('hors connexion sans cache : catalogue de secours ; famille inconnue : null', async () => {
    const offline = new FontCache(dir, async () => { throw new Error('hors ligne') }, async () => { throw new Error('hors ligne') })
    expect(await offline.catalog()).toEqual(FALLBACK_FONTS)
    expect(await offline.css('Inconnue')).toBeNull()
  })

  it('nom de fichier de police : seulement 16 hexadécimaux + .woff2', () => {
    expect(resolveFontFile(dir, '0123456789abcdef.woff2')).toBe(join(dir, 'files', '0123456789abcdef.woff2'))
    expect(resolveFontFile(dir, '../catalog.json')).toBeNull()
    expect(resolveFontFile(dir, 'abc.woff2')).toBeNull()
  })
})
```

Commit : `Ajoute le cache local des polices Google`.

---

## Phase B — interface (séquentielle)

Chaque tâche : tests e2e d'abord (`e2e/panels-*.spec.ts`), puis intégration, vert, commit.

- **B1 Mise en page de la fenêtre** : panneau gauche (240 px, `data-testid="left-panel"`) = Pages + Calques ; canevas au centre ; panneau droit (260 px, `data-testid="right-panel"`) = Propriétés (onglet « Design ») ; les panneaux sont des `data-ui` ; la caméra et la mesure tiennent compte du décalage du canevas. e2e : les trois zones visibles, le cadrage tient dans le canevas.
- **B2 Pages** : liste, `+` (nouvelle page « Page N », sélectionnée), double-clic = renommer (Entrée valide, Échap annule, vide = ancien nom), menu contextuel ou bouton « Supprimer » (désactivé s'il ne reste qu'une page), glisser pour réordonner (`page.move`) ; changer de page = `pageId` du store, sélection vidée, cadrage. e2e : créer, renommer, changer de page, supprimer, annuler.
- **B3 Calques** : `layerRows`, flèches de dépliage, icône par type, clic = sélection (Maj = ajouter, Ctrl = bascule), survol synchronisé avec le canevas, double-clic = renommer, œil (visible) et cadenas (verrouillé) au survol de la ligne, glisser-déposer avec `layerDrop` → `move` ; la ligne sélectionnée défile pour rester visible ; les ancêtres de la sélection se déplient. e2e : sélection dans les deux sens, renommer (vide → ancien nom), masquer/verrouiller, réordonner par glisser.
- **B4 Champ numérique et Position & taille** : composant `NumberField` (étiquette à glisser = geste, saisie avec calculs via `evalNumber`, flèches ±1/±10, Entrée/Tab valident, Échap annule, « Mixte ») ; section X, Y, L, H + menus fixe/hug/fill par axe (`sizingChoices`, choix impossibles grisés avec `title`) ; opacité ; arrondi (lien 4 coins). e2e : taper `24*2` dans L → 48 ; « abc » → valeur précédente ; glisser l'étiquette L puis `Ctrl+Z` en une fois ; deux éléments de largeurs différentes → « Mixte » ; « Remplir » grisé sur un élément de premier niveau.
- **B5 Mise en page automatique** : bouton « + » (Maj+A) / « − » (repasser en libre), direction, espacement (ou « auto »), marges (4 valeurs, liées ou séparées), grille d'alignement 3×3 (justify × align), retour à la ligne + `rowGap`, alignement propre de l'enfant (`alignSelf`) pour un enfant en flux. e2e : activer, changer direction et espacement, cliquer la case centre-centre de la grille.
- **B6 Couleurs, contour, ombres** : remplissages (liste, ajouter, retirer, couleur via `<input type="color">` + champ hex + opacité %), contour (couleur, épaisseur, position intérieur/centre/extérieur), ombres (liste x, y, flou, étendue, couleur, intérieure). Couleur nommée : pastille cliquable qui ouvre la liste des styles du document (appliquer = `{ style: id }`), « détacher ». e2e : changer la couleur d'un rectangle par le champ hex, ajouter un contour, appliquer puis détacher un style.
- **B7 Texte et polices** : `FontCache` branché (IPC `fonts:catalog`, `fonts:css`, protocole `mfont://`, CSP `font-src mfont:`) ; sélecteur de police avec recherche sur le catalogue (100 premiers résultats, aperçu dans la police au survol optionnel) ; graisse (graisses disponibles), taille, interligne, espacement, alignement, couleur, style de texte nommé ; la fenêtre charge les polices utilisées par le document (`<style>` injecté, `document.fonts.load`) et signale celles qui n'ont pas pu être chargées (bandeau « Police introuvable : X »). e2e : changer la police d'un texte pour « Arial » (sans réseau) puis pour une police du cache de test ; police inconnue dans un fichier → bandeau.
- **B8 Styles du document** : quand rien n'est sélectionné, le panneau droit montre « Document » : couleurs nommées et styles de texte (ajouter, renommer, modifier, supprimer = détache — §6.1) ; « Créer un style » depuis la couleur ou le texte de la sélection. e2e : créer une couleur nommée, l'appliquer, la modifier → l'élément change, la supprimer → l'élément garde la couleur.

### Fin du plan

Suites complètes vertes, relecture finale par un agent neuf (lecture seule), correctifs avec tests, captures envoyées.
