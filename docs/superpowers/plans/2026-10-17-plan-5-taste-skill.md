# Maquette — Plan 5 : taste-skill intégré

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** taste-skill (v2, `design-taste-frontend`, MIT) au cœur de Maquette : (1) le skill reste celui de Claude Code ; (2) un onglet **Direction** tire trois directions artistiques depuis sa bibliothèque et applique la palette et la typographie choisies au document (couleurs nommées, styles de texte) ; (3) un **contrôle qualité** passe les règles de taste-skill sur le rendu réel d'un cadre, épingle les fautes sur le canevas, et l'outil MCP `verifier_gout` donne le même résultat à Claude.

**Architecture:** Les fichiers de taste-skill sont copiés tels quels dans `vendor/taste-skill/` (bibliothèque JSON, `scripts/draw.mjs`, `scripts/lib/probe.mjs`, `scripts/lib/rules.mjs`, licence) par un script de mise à jour. Le tirage exécute `draw.mjs` avec l'exécutable d'Electron en mode Node (aucun Node installé requis). La traduction d'une direction en styles du document est du code pur testé (`src/taste/direction.ts`). Le contrôle rend le cadre dans la fenêtre cachée de l'export (plan 4), y exécute `probe()` (fonction autonome de taste-skill), puis `judge()` dans le principal.

**Spec:** §10 (taste-skill), §9 (outil `verifier_gout`), §15 (règles pensées pour des pages entières).

## Global Constraints

- Contraintes des plans précédents. Aucune nouvelle dépendance npm.
- **Aucune modification des fichiers de taste-skill** : copie exacte + fichier `VERSION` (commit/date de la copie) + `LICENSE`.
- Les polices de la bibliothèque viennent de Google Fonts (30 systèmes) ou de **Fontshare** (14) : le cache de polices doit servir les deux (`api.fontshare.com/v2/css?f[]=<slug>@<graisses>` → fichiers `cdn.fontshare.com`).
- Règles inapplicables à une maquette statique désactivées par défaut (`still-page`, `no-footage`, `long-pin`, `pinned-over-picture`, `empty-screens`, `side-scroll`) ; la liste est visible et modifiable dans le panneau.

## Review Focus

1. **`draw.mjs` en échec** (secteur inconnu, bibliothèque absente) → message clair dans l'onglet, rien d'appliqué.
2. **Appliquer une direction deux fois** → les styles du même nom sont mis à jour, pas dupliqués ; une seule annulation.
3. **Contrôle d'un cadre qui n'est pas une page** (bouton, carte) → les règles de page entière ne crient pas : le panneau prévient et propose de les ignorer.
4. **Police Fontshare** d'une direction → téléchargée, mise en cache, affichée.
5. **Fautes épinglées** → un clic sur une faute sélectionne l'élément concerné quand on peut le retrouver (texte cité), sinon le cadre.

---

## Phase A (agents en parallèle)

### Task A1: Copie de taste-skill et script de mise à jour

**Files:** Create `scripts/update-taste-skill.mjs`, `vendor/taste-skill/**` ; Test `tests/taste/vendor.test.ts`.

`node scripts/update-taste-skill.mjs [source]` — source par défaut `~/.claude/skills/design-taste-frontend` ; copie `library/*.json`, `scripts/draw.mjs`, `scripts/assets.mjs`, `scripts/lib/{probe,rules,cdp}.mjs`, `README.md`, et la licence MIT du dépôt (texte copié depuis `https://github.com/Leonxlnx/taste-skill/blob/main/LICENSE`, à inscrire tel quel) ; écrit `VERSION` (date + empreinte SHA-256 des fichiers). Tests : les fichiers attendus existent ; `probe.mjs` exporte `probe` ; `rules.mjs` exporte `judge` et `RULE_IDS` ; `draw.mjs --list sectors` lancé avec `process.execPath` répond.

Commit : `Ajoute la copie de taste-skill et son script de mise à jour`.

### Task A2: Direction → styles du document (pur)

**Files:** Create `src/taste/direction.ts` ; Test `tests/taste/direction.test.ts` (fixtures `tests/taste/fixtures/options.md` et `direction-one-motif.json`, déjà présentes).

**Produces:**
- `SECTORS: { id: string; label: string }[]` (les 22 secteurs de `draw.mjs`, libellés français) et `TONES`.
- `parseOptions(markdown: string): { id: string; name: string; idea: string; composition: string; needs?: string }[]` — sections `## \`id\` — Nom`, lignes `Idea engine:`, `Composition:`, `Needs:`.
- `parseSettings(settings: string): { weight?: number; trackingEm?: number; leading?: number; uppercase?: boolean }` — `weight 700`, `tracking -0.03em`, `leading 0.9`, `uppercase` ; séparateurs `·` ou `�`.
- `directionStyles(sheet): { colors: { name: string; value: string }[]; text: Omit<TextStyle, 'id'>[]; fonts: { family: string; source: 'google' | 'fontshare'; slug?: string; weights: number[] }[] }` — couleurs nommées : `Fond` (bg), `Surface`, `Encre` (ink), `Discret` (muted), `Accent`, `Sur accent` (accentInk), `Aplat 1..n` (fields[].bg) ; styles de texte (famille display pour les titres, text pour le reste ; interligne = arrondi(leading × taille) ; espacement = arrondi(tracking × taille, 2)) : `Titre 1` 72 px, `Titre 2` 48, `Titre 3` 32, `Texte large` 20, `Texte` 16, `Petit` 13 (graisses : celle de `display.settings` pour les titres, 400 pour le texte ; interligne texte = leading de `text.settings` ou 1,5).
- `applyDirectionOps(doc, styles): Op[]` — `style.color.set` / `style.text.set` en **réutilisant l'id d'un style du même nom** s'il existe (mise à jour plutôt que doublon).

Tests : `parseOptions` sur la fixture → 3 directions avec id/nom/idée ; `parseSettings('weight 700 · tracking -0.03em · leading 0.9 · uppercase')` ; `directionStyles(fixture)` → `Fond = #F7F7F5`, `Accent = #D0106F`, 4 aplats, `Titre 1` en Jost 700 72/65 −2,16 ; appliquer deux fois → aucun doublon (via `applyOps`).

Commit : `Ajoute la traduction d'une direction de taste-skill en styles du document`.

### Task A3: Polices Fontshare dans le cache

**Files:** Modify `src/main/fonts.ts` ; Test `tests/main/fonts.test.ts` (ajouts).

`FontCache.css(family, hint?: { source: 'fontshare'; slug: string; weights: number[] })` : si la famille n'est pas dans le catalogue Google mais qu'un `hint` Fontshare est fourni (ou qu'elle figure dans une liste `FONTSHARE_FAMILIES` construite à partir de `vendor/taste-skill/library/type.json` et passée au constructeur), télécharge `https://api.fontshare.com/v2/css?f[]=<slug>@<graisses>&display=swap` ; `rewriteCss` accepte aussi `https://cdn.fontshare.com/...` (et les URL protocol-relative `//cdn.fontshare.com/...`). Tests avec un CSS Fontshare factice ; un test réseau facultatif (`FONTS_LIVE=1`).

Commit : `Ajoute les polices Fontshare au cache de polices`.

---

## Phase B (séquentielle, après fusion du plan 4)

- **B1 Service taste (principal)** : `src/main/taste.ts` — `drawOptions({ sector, brief, tone? })` et `drawDirection({ …, direction })` exécutent `vendor/taste-skill/scripts/draw.mjs` avec `process.execPath` + `ELECTRON_RUN_AS_NODE=1`, `--out` dans un dossier temporaire, délai 20 s ; `checkFrame(doc, nodeId, { allow })` : rendu hors écran à la largeur du cadre (hauteur de fenêtre = min(hauteur du cadre, 900)), exécution de `probe()` dans la page, `judge(metrics, { width, allow })`, retour `{ findings, hero, isPage }` (`isPage` = largeur ≥ 900 et hauteur ≥ 600). IPC `taste:options`, `taste:direction`, `taste:check`. En production, `vendor/` est copié dans les ressources (plan 6).
- **B2 Onglet Direction** : onglet à côté de « Design » ; formulaire (secteur, une phrase de brief, ton) ; « Tirer 3 directions » → cartes (nom, idée, composition, besoins) ; « Choisir » → feuille complète : aperçu de la palette (pastilles), des polices (aperçu « Ag » dans la police), idée du hero ; « Appliquer au document » → `applyDirectionOps` en une opération (« Appliquer la direction <nom> ») + chargement des polices (Google ou Fontshare) ; « Retirer » = Ctrl+Z.
- **B3 Contrôle qualité** : bouton « Vérifier » dans l'en-tête du panneau quand un cadre est sélectionné (et commande `Ctrl+Alt+V`) ; résultats dans une section « Contrôle taste-skill » : fautes (FAIL en rouge, WARN en orange), règle, message, correction proposée ; épingles numérotées sur le canevas (surcouche) à côté de l'élément concerné (texte cité retrouvé dans le cadre, sinon coin du cadre) ; clic = sélection ; avertissement « Ce cadre n'est pas une page entière » avec bouton « Ignorer les règles de page » ; liste des règles désactivées modifiable ; les fautes disparaissent dès que le cadre change (badge « à revérifier »).
- **B4 Outil MCP `verifier_gout`** `{ id }` → `{"fautes":[[niveau, règle, message]], "page": bool}` (compact, au plus 15) ; ajouté à `TOOLS` et au relais.
- **B5 e2e** : tirer 3 directions (secteur « restaurant ») → 3 cartes ; choisir la première, appliquer → couleurs `Fond`/`Accent` et `Titre 1` dans le document, Ctrl+Z les retire en une fois ; vérifier un cadre de test contenant un titre sur 3 lignes et un dégradé → fautes `headline-lines` et `gradient` présentes, épingles visibles ; `verifier_gout` par MCP → mêmes règles.

### Fin du plan

Suites vertes, relecture finale par un agent neuf, correctifs avec tests, captures envoyées.
