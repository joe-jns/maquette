# Montée en charge : à partir de combien d'éléments l'éditeur rame

Mesures du 17/10/2026 sur la machine de dev (Windows 11, écran 144 Hz : une image au repos = 6,9 ms),
build de production (`npx electron-vite build`), fenêtre 1 400 × 900, polices système, réseau des polices coupé.
Relancer : `npx electron-vite build && npx playwright test -c bench`, puis `node bench/table.mjs`.

## Les scènes

- **site** : des pages de site de 1 440 px posées côte à côte (≈ 190 éléments par page). Chaque page
  contient un héros en mise en page libre, deux grilles de cartes, un bandeau de chiffres et un pied de page, tous
  en mise en page automatique (l'éditeur place lui-même les enfants en ligne ou en colonne). Profondeur 6
  (page > section > grille > carte > ligne d'étiquettes > élément). Il y a des textes, des rectangles, des
  ellipses, une ombre une carte sur deux et un contour une carte sur trois.
- **plat** : N rectangles côte à côte directement sur la page, sans imbrication ni mise en page automatique.

Chaque scène est validée par le vrai parseur du format (`parseDocument`) avant d'être ouverte.

## Comment on mesure

- **Ouverture** : du lancement de l'app jusqu'au moment où tous les éléments sont dans le DOM. Le DOM est la
  liste des éléments HTML de la page. Le lancement d'Electron compte pour ≈ 0,4 s.
- **Images** : chaque image est horodatée avec `requestAnimationFrame` et `performance.now()`. On donne le
  **p95**, le maximum et, entre parenthèses, le nombre d'images de plus de 50 ms. Le p95 est la durée sous
  laquelle passent 95 % des images. Chaque geste dure 2 s :
  - survol : la souris balaie le canevas ;
  - déplacement « tout voir » : molette avec toute la scène à l'écran ;
  - zoom : Ctrl + molette ;
  - déplacement à 100 % : molette au zoom 100 %.
- **Latences** : du moment de l'entrée (horodatage de l'événement) jusqu'à la première image qui montre le
  résultat.
  - Sélection : Ctrl + clic, puis panneau Design affiché.
  - Glisser : 200 px en 30 étapes, avec la durée des images pendant le geste.
  - Relâcher : document validé.
  - Ctrl+Z : l'élément revient à sa place.
  - Texte : Entrée ouvre l'édition, on tape une lettre, Échap valide le texte dans le document.
- **MCP** : temps d'un appel complet depuis un vrai client MCP qui passe par le relais. On mesure
  `lire_document` et `appliquer` (une mise à jour de couleur).
- **Mémoire** :
  - tas JS : la mémoire occupée par les objets JavaScript du canevas (`performance.memory`) ;
  - processus de rendu : la mémoire du processus qui dessine la fenêtre (`app.getAppMetrics`).

Le ralentissement des fenêtres en arrière-plan est désactivé. Sans ça, Chromium passe à une image par
seconde dès que la fenêtre est recouverte. Une première série de mesures a été jetée pour cette raison.

## Résultats

Temps en ms. Format des colonnes d'images : p95 / max (nombre d'images > 50 ms).

| Scène | N | Ouverture | Survol | Pan « tout voir » | Zoom | Pan 100 % | Sélection | Glisser | Relâcher | Ctrl+Z | Entrée→édition | Lettre | Échap→validé | MCP lire / appliquer | Tas JS / rendu (Mo) | Éléments DOM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| site | 500 | 696 | 8.7 / 54.1 (1) | 9.3 / 12.6 (0) | 7.9 / 113.3 (1) | 8 / 8.6 (0) | 36 | 19.4 / 32.2 (0) | 4 | 7 | 5 | 6 | 13 | 10 / 18 | 10 / 214 | 628 |
| site | 1 000 | 653 | 7.6 / 8.7 (0) | 9.1 / 11.3 (0) | 8.1 / 9 (0) | 8.7 / 9.3 (0) | 32 | 31 / 37.9 (0) | 5 | 9 | 6 | 6 | 22 | 10 / 26 | 12 / 279 | 1 183 |
| site | **2 000** | 629 | 7.6 / 10 (0) | 12.8 / 22.1 (0) | 8.3 / 9.1 (0) | 8.9 / 9.7 (0) | 36 | **45.4 / 55.7 (2)** | 9 | 12 | 7 | 6 | 41 | 10 / 45 | 16 / 293 | 2 279 |
| site | 5 000 | 705 | 25.8 / 31.9 (0) | 29.7 / 53.6 (1) | 29.3 / 104.1 (1) | 10.4 / 11.8 (0) | 65 | 106.1 / 119.8 (30) | 20 | 26 | 9 | 6 | 93 | 9 / 90 | 20 / 410 | 5 582 |
| site | 10 000 | 1 014 | 43.5 / 74.4 (2) | 63.2 / 78.8 (11) | 28.2 / 69.9 (1) | 10.5 / 15.8 (0) | 127 | 216.1 / 263.1 (30) | 102 | 72 | 13 | 11 | 212 | 10 / 203 | 33 / 508 | 11 078 |
| site | 20 000 | 1 582 | 156.4 / 175.9 (14) | 102 / 120.4 (12) | 131.7 / 162.1 (10) | 31.4 / 49.9 (0) | 635 | 666.4 / 734.8 (31) | 277 | 357 | 22 | 14 | 515 | 11 / 495 | 61 / 648 | 22 083 |
| plat | 500 | 593 | 7.9 / 24.5 (0) | 9.8 / 11.4 (0) | 7.9 / 8.6 (0) | 7.9 / 19.8 (0) | 50 | 35.3 / 70.9 (1) | 20 | 23 | 9 | 5 | 34 | 10 / 33 | 16 / 332 | 7 572 |
| plat | **1 000** | 847 | 7.4 / 11.8 (0) | 8.1 / 9 (0) | 7.6 / 8.7 (0) | 7.9 / 9 (0) | **106** | **101 / 260 (30)** | 85 | 84 | 5 | 8 | 94 | 12 / 90 | 14 / 449 | 15 072 |
| plat | 2 000 | 1 936 | 11.2 / 13.2 (0) | 8.5 / 9.4 (0) | 8 / 10.5 (0) | 8.4 / 9.3 (0) | 272 | 334.6 / 1162.3 (31) | 280 | 310 | 6 | 7 | 354 | 14 / 314 | 26 / 539 | 30 072 |
| plat | 5 000 | 24 749 | 561.2 / 739.3 (3) | 10.2 / 16.3 (0) | 22.4 / 26 (0) | 10.2 / 11.4 (0) | 2 529 | 1869 / 20569 (31) | 1 943 | 1 517 | 31 | 17 | 1 729 | 22 / 2 106 | 48 / 658 | 75 072 |
| plat | 10 000 | **81 958** | 2594 / 2594 (1) | 12.2 / 16.4 (0) | 24.2 / 28.1 (0) | 8.8 / 11.7 (0) | 5 539 | 6259 / 76987 (31) | 5 992 | 6 220 | 43 | 26 | 7 543 | 31 / 6 315 | 111 / 1 163 | 150 072 |
| plat | 20 000 | non mesuré : l'ouverture dépasse 60 s dès 10 000 | | | | | | | | | | | | | | |

Remarques :
- Au repos, une image dure 6,9 ms. Les pics isolés de 50 à 110 ms à N = 500 sont des images de démarrage
  (préchauffage du JIT, le compilateur JavaScript), pas de la charge.
- « Lettre » reste rapide partout : la frappe ne touche que le `contentEditable` (la zone de texte éditable
  du navigateur), sans passer par le document. Tout le coût arrive à la validation (« Échap→validé »).
- `lire_document` ne renvoie qu'un résumé des éléments de premier niveau (10 Ko à 20 000 éléments) : il reste
  à ≈ 10 ms. `appliquer` paie le même prix que n'importe quelle modification (voir points chauds 1 et 2).
- Dans la scène plate, le DOM compte 15 fois plus d'éléments que le canevas : chaque ligne du panneau
  Calques ajoute ≈ 14 balises, et la liste n'est jamais tronquée.

### Expérience : `will-change: transform` sur le monde (CSS injecté, rien changé dans src/)

Le « monde » est la couche du canevas qui contient tous les éléments et que la caméra déplace.

| Scène | N | Pan « tout voir » sans → avec | Zoom sans → avec | Survol sans → avec |
|---|---|---|---|---|
| site | 5 000 | 29.7 → **10.1** | 29.3 → **16.5** | 25.8 → 18.8 |
| site | 10 000 | 63.2 → **11.9** | 28.2 → **16.7** | 43.5 → 19.3 |
| site | 20 000 | 102 → **52.6** | 131.7 → **47.6** | 156 → 213 (dû aux calques, voir point chaud 1) |

## Seuils

Repères :
- **fluide** : p95 des images ≤ 17 ms (60 images/s) et latences ≤ 50 ms ;
- **acceptable** : p95 ≤ 33 ms et latences ≤ 100 ms ;
- **gênant** : p95 ≤ 100 ms et latences ≤ 300 ms ;
- **inutilisable** : au-delà, ou ouverture > 60 s.

| N | Scène site (réaliste) | Scène plate (tout au premier niveau) |
|---|---|---|
| 500 | acceptable (glisser p95 19 ms) | acceptable à la limite (glisser p95 35 ms, sélection 50 ms) |
| 1 000 | acceptable (glisser p95 31 ms) | **gênant** (sélection 106 ms, glisser p95 101 ms) |
| 2 000 | **gênant** (glisser p95 45 ms ; navigation encore fluide) | inutilisable (sélection 272 ms, glisser p95 335 ms, pics à 1,2 s) |
| 5 000 | gênant (glisser p95 106 ms, sélection 65 ms, pan 30 ms) | inutilisable (ouverture 25 s, sélection 2,5 s) |
| 10 000 | inutilisable pour éditer (glisser 216 ms, sélection 127 ms) ; navigation gênante (pan 63 ms) | inutilisable (ouverture 82 s, arrêt) |
| 20 000 | inutilisable (glisser 666 ms, sélection 635 ms, pan 102 ms) | non mesuré |

**Le seuil** : sur une vraie maquette de site, l'édition devient gênante vers **2 000 éléments** (≈ 10 pages de
site). Le glisser est le premier geste à décrocher. Le déplacement et le zoom de la vue tiennent jusqu'à
≈ 5 000 éléments. Si beaucoup d'éléments sont posés directement sur la page, la limite tombe à **≈ 1 000
éléments**, à cause du panneau Calques (coût quadratique : 2 fois plus d'éléments = 4 fois plus lent).

## Points chauds (profils CPU sur site 2 000, site 5 000 et plat 2 000)

Profil CPU = relevé, plusieurs fois par milliseconde, de la fonction en cours d'exécution. On en tire le temps
passé dans chaque fonction. Ici : profileur du protocole DevTools (CDP) toutes les 0,2 ms, plus le nombre exact
d'appels de chaque fonction. Build non minifié avec carte de sources :
`npx electron-vite build -c bench/electron.vite.profile.config.ts`, puis `BENCH_PROFILE=site:5000 npx playwright test -c bench`
et `node bench/profile-summary.mjs site-5000`. Les profils bruts sont dans `bench/.results/` (ignoré par git).

### 1. Panneau Calques : une recherche dans tout l'arbre par ligne, à chaque rendu (coût quadratique)

`src/renderer/panels/LayersPanel.tsx:11-12` — `TypeIcon` appelle `findNode(...)` sur toute la page pour chaque
ligne affichée, juste pour choisir l'icône. Coût : nombre de lignes × N. Le panneau se redessine en entier
à chaque changement :
- du document (`LayersPanel.tsx:36`, donc à chaque mouvement de souris pendant un glisser) ;
- de la sélection et du survol (`LayersPanel.tsx:37-38`).

Les lignes ne sont ni mémorisées (`memo`) ni virtualisées (seules les lignes visibles seraient construites).

- plat 2 000, glisser : **14,4 s sur 19,7 s** de temps actif ; 4 000 appels de `TypeIcon` → 4 018 appels de
  `findNode` pour une seule sélection (576 ms sur 808 ms).
- site 5 000, glisser : 0,76 s sur 6,5 s.
- C'est aussi ce qui rend l'ouverture de la scène plate quadratique (25 s à 5 000, 82 s à 10 000). C'est
  aussi la cause du survol à 156-213 ms à 20 000 : chaque changement de `hoverId` (l'élément survolé)
  redessine tout le panneau.

### 2. `applyOps` refait tout le document à chaque mouvement du glisser

`src/core/ops.ts:60-67`. `previewGesture` (l'aperçu en direct pendant un geste) rappelle `applyOps` à chaque
déplacement de la souris. Chaque appel, même pour changer seulement x et y, fait ceci :
- `collectIds(draft)` (l.61) parcourt la copie de travail d'Immer. Immer crée alors un intermédiaire (proxy)
  pour chacun des éléments : 404 000 `createProxy` pendant un glisser à 5 000 éléments.
- `normalizeHugFill` (l.64 → l.368) et `normalizeContext` (l.65 → l.336) parcourent tout l'arbre.
- `validateDocument(current(draft))` (l.66) copie la copie de travail. Il relit ensuite tout le document
  avec le schéma zod (`rules.ts:19`), puis fait un nouveau parcours pour les règles.

Résultat dans le profil site 5 000 du glisser :
- zod ≈ 2 s ;
- parcours d'arbre ≈ 1,4 s ;
- Immer (`get`, `isDraftable`, `createProxy`) ≈ 1 s ;
- au total ≈ **4 s sur 6,5 s**, attribués à `ops.ts:60-66`.

C'est aussi le coût de la validation d'un texte, de Ctrl+Z (une partie), et d'`appliquer` en MCP (495 ms à
20 000).

### 3. `findNode` / `walk` : parcours complet sans arrêt anticipé, et appelé partout

`src/core/tree.ts:14-31`. `findNode` passe toujours par `walk`, qui visite **tous** les éléments, même
après avoir trouvé le bon. En plus, il construit une chaîne `path` pour chacun (l.16). Il n'existe aucune
table identifiant → élément. Les appels se multiplient à chaque modification ou sélection :
- `useSelection` (`panels/design/shared.tsx:15`) : un parcours par section du panneau Design, soit jusqu'à 7 ;
- `Canvas.tsx:56-58` : un abonnement qui refait un `findNode` par élément sélectionné à chaque changement
  du document ;
- `selection.ts:18-30` : `ancestry` et `contextOf` font un `findNode` par niveau de parent ;
- `interaction.ts:97-116` : `selectable` et `ascend` ;
- `panels/props.ts:131` : `sizingChoices` ;
- `ops.ts:112/166/196/218`.

Dans site 5 000, glisser : 2,37 millions d'appels de `visitList`, soit ≈ 60 parcours complets par mouvement
de souris.

### 4. Déplacer ou zoomer la vue redessine tout le monde

C'est un coût du navigateur, pas du JavaScript. `src/renderer/app.css:5` : `.world` n'a pas de
`will-change`. Sans cette propriété, le navigateur ne met pas le monde sur une couche à part (« composée ») que
la carte graphique pourrait simplement décaler. Chaque nouvelle caméra le force donc à repeindre tout le
contenu visible. Dans le profil du déplacement (site 5 000), 289 ms sur 347 ms sont du travail natif
(`(program)` : styles, peinture, rastérisation, c'est-à-dire le calcul des pixels). React ne coûte que
≈ 30 ms. L'expérience ci-dessus le confirme : avec `will-change: transform`, le déplacement à 10 000 éléments
passe de 63 à 12 ms. À 20 000, le reste du coût vient du nombre de nœuds DOM : il n'y a aucun tri des
éléments hors écran.

### 5. Mesures dans le DOM : `querySelector` par attribut et `getBoundingClientRect` en série

- `src/renderer/canvas/rects.ts:6` : chaque `worldRectOf` (la position d'un élément dans le monde) relance un
  `document.querySelector('[data-node-id="…"]')`, qui parcourt tout le DOM.
- Au début d'un glisser, `interaction.ts:595-611` mesure **tous** les éléments voisins pour le magnétisme
  (l'alignement automatique sur les autres éléments). Dans la scène plate, ça fait 2 000 recherches et
  2 000 mesures, donc 873 ms de `querySelector` dans le profil plat 2 000.
- `Overlay.tsx:48-53` remesure la sélection à chaque changement de caméra ou de document, ce qui force un
  calcul de mise en page.
- Plus secondaire : chaque `NodeView` s'abonne lui-même aux styles (`NodeView.tsx:15`). Chaque `TextView`
  s'abonne aussi à `editingTextId` (`NodeView.tsx:38`). Ça fait N fonctions de lecture du store
  (« sélecteurs » Zustand) relancées à chaque changement d'état. C'est visible dans le profil du déplacement
  (`zustand/react.mjs:8`, `checkIfSnapshotChanged`, ≈ 15 ms sur 2 s), mais ce n'est pas bloquant.

Ce qui n'est **pas** un problème : le clonage Immer d'une modification validée et le re-rendu des `NodeView`.
Immer réutilise les branches inchangées et `memo` les ignore. Ça ne pèse que quand les points 2 et 3 forcent
des parcours complets.

## Pistes d'optimisation, de la plus rentable à la moins rentable

| # | Piste | Gain attendu | Effort |
|---|---|---|---|
| 1 | Calques : mettre le type et le mode de mise en page dans `LayerRow` (déjà calculé dans `layerRows`) au lieu de `findNode` dans `TypeIcon`. Sortir chaque ligne dans un composant `memo` qui reçoit `selected` et `hover` en booléens. | Supprime le coût quadratique : plat ×10 à ×50, ouverture plate 82 s → ≈ 1 s ; survol et sélection fluides | Très faible |
| 2 | Index identifiant → élément (`WeakMap<doc, Map<id, {node, parent, page, index}>>`, construit une fois par version du document). `findNode`, `contextOf`, `ancestry` et `useSelection` deviennent quasi instantanés. Garder `walk` pour les vrais parcours, et calculer `path` seulement quand on en a besoin. | −30 à −50 % sur sélection, glisser et annulation à 5 000+ | Faible |
| 3 | `will-change: transform` sur `.world` pendant un déplacement ou un zoom (le retirer à la fin du zoom pour retrouver un rendu net). | Pan et zoom fluides jusqu'à ≈ 10 000 (63 → 12 ms) | Très faible |
| 4 | Aperçu du geste rapide : pour un glisser ou un redimensionnement, ne valider et normaliser que les éléments touchés et leurs parents. Valider tout le document (zod) seulement au relâcher, voire seulement pour les opérations MCP. Lire `collectIds` depuis le document d'origine (ou l'index du point 2) plutôt que depuis la copie de travail d'Immer, pour ne plus créer d'intermédiaire par élément. | Glisser ÷3 à ÷5 à 5 000+ ; `appliquer` MCP et validation du texte bien plus rapides | Moyen |
| 5 | Registre identifiant → élément HTML (rempli par `ref` dans `NodeView`) à la place de `querySelector` par attribut. Ne mesurer pour le magnétisme que les voisins visibles à l'écran. | Début de glisser instantané quand les voisins sont nombreux | Faible |
| 6 | Virtualiser le panneau Calques (ne construire que les lignes visibles). | DOM ÷15 dans la scène plate, mémoire du processus de rendu | Moyen |
| 7 | Ne pas dessiner ce qui est hors écran : sauter les éléments de premier niveau hors de la vue, ou `content-visibility: auto` sur les planches. À un zoom très faible, afficher des planches simplifiées. | Pan et zoom au-delà de 10 000 ; mémoire | Élevé |
| 8 | Passer les styles du document par un contexte React plutôt que N abonnements ; un seul abonnement `editingTextId` dans `Canvas`. | Petit (≈ 1 % du temps pendant les déplacements) | Faible |

Avec les pistes 1 à 3 (une journée de travail au plus), la scène site devrait rester au moins
« acceptable » jusqu'à ≈ 5 000 éléments, et la scène plate ne serait plus un cas à part. Il faut la piste 4
pour un glisser fluide au-delà.

## Après optimisation (pistes 2, 3, 4 et 5a)

Ce qui a changé :
- **Piste 2** : un index identifiant → élément (`src/core/tree.ts`) est construit une fois par version du
  document. Une « version », c'est l'objet document gelé que produit chaque modification : il ne change plus,
  donc l'index reste juste. `findNode` répond sans parcourir l'arbre, partout (canevas, sélection, panneau
  Design, panneau Calques, MCP). Le chemin texte (`pages[0].children[2]…`) n'est calculé que s'il est lu.
- **Piste 3** : `will-change: transform` sur le monde, **seulement pendant** un déplacement ou un zoom de la
  vue (retiré 150 ms après le dernier mouvement). Vérifié par capture, texte d'un héros à 100 % et 200 %
  après un zoom continu depuis 25 % : au repos, l'image est identique au pixel près à celle sans
  `will-change`. Avec `will-change` permanent, le texte à 100 % perd le lissage sous-pixel (lettres plus
  grises et plus fines) : d'où le choix « seulement en mouvement ».
- **Piste 4** : pendant un geste (glisser, redimensionner, glisser une valeur du panneau Design), l'aperçu ne
  normalise et ne valide que les éléments touchés, leurs parents et leurs enfants directs (schéma zod de
  l'élément seul, sans descendre dans ses enfants, et règles locales). Le document entier est validé une
  seule fois, au relâcher. Toujours une seule entrée d'annulation. Des tests comparent l'aperçu au mode
  complet sur 13 cas (même document, mêmes patchs, mêmes refus).
- **Piste 5a** : un registre identifiant → balise HTML, rempli par les éléments du canevas à leur montage,
  remplace les `querySelector` par attribut (qui parcouraient tout le DOM à chaque mesure). Le magnétisme ne
  garde que les voisins à moins d'une vue de l'écran ; ceux dont la position et la taille sont fixées dans
  le document sont écartés sans même être mesurés.

Mesures du 17/10/2026, même machine, fenêtre de test hors de l'écran (`MAQUETTE_E2E=1`, depuis le commit
qui sort les fenêtres de test de l'écran). Les deux colonnes ont été mesurées dans ces mêmes conditions,
l'une juste après l'autre. Les chiffres « avant » diffèrent un peu du tableau du haut, mesuré fenêtre visible.
D'une série à l'autre, une même mesure varie de ± 30 % (un relancement de plat 2 000 donne un survol à
14 ms au lieu de 80 ms).

Temps en ms ; images : p95. Format : avant → **après**.

| Scène | N | Ouverture | Survol | Pan « tout voir » | Zoom | Sélection | Glisser | Relâcher | Ctrl+Z | Échap→validé | MCP appliquer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| site | 500 | 732 → **536** | 7,9 → **7,2** | 9,4 → **9** | 8 → **7,6** | 57 → **31** | 26,3 → **12,2** | 5 → **6** | 12 → **6** | 13 → **12** | 31 → **15** |
| site | 1 000 | 783 → **516** | 7,6 → **7,9** | 9,1 → **8,2** | 8,1 → **7,6** | 32 → **27** | 37,6 → **11,7** | 6 → **11** | 8 → **8** | 27 → **19** | 28 → **21** |
| site | 2 000 | 576 → **544** | 7,8 → **7,4** | 15,4 → **8,9** | 8,4 → **8,4** | 39 → **32** | 68,4 → **12,4** | 11 → **18** | 11 → **7** | 48 → **36** | 47 → **39** |
| site | 5 000 | 1 001 → **896** | 35,5 → **13,3** | 45,3 → **13,1** | 36,3 → **15,6** | 97 → **85** | 152,2 → **26,7** | 19 → **75** | 25 → **23** | 98 → **139** | 108 → **126** |
| site | 10 000 | 1 137 → **970** | 118,4 → **33** | 117,9 → **16** | 115,8 → **30** | 215 → **113** | 477,3 → **39** | 145 → **76** | 174 → **20** | 385 → **176** | 256 → **174** |
| plat | 500 | 745 → **836** | 9,3 → **7,7** | 9,8 → **9,3** | 8,4 → **8** | 120 → **56** | 70,1 → **24,8** | 47 → **17** | 53 → **26** | 65 → **23** | 76 → **37** |
| plat | 1 000 | 1 179 → **891** | 7,8 → **11,4** | 10,3 → **9,5** | 8 → **9,4** | 137 → **172** | 109,9 → **59,5** | 97 → **48** | 109 → **44** | 92 → **71** | 102 → **75** |
| plat | 2 000 | 1 915 → **1 248** | 11,4 → **80,1** | 9,2 → **11,6** | 8,1 → **12,6** | 323 → **191** | 498,2 → **82,3** | 319 → **119** | 269 → **76** | 346 → **121** | 301 → **107** |
| plat | 5 000 | 23 946 → **2 648** | 26,9 → **23,3** | 27,5 → **21,8** | 23,8 → **24,6** | 1 779 → **949** | 3 532 → **390** | 2 368 → **336** | 2 583 → **215** | 3 526 → **478** | 2 012 → **339** |
| plat | 10 000 | 87 329 → **5 434** | 3 207 → **39,7** | 28,4 → **37,3** | 40,5 → **48,2** | 6 173 → **1 835** | 9 094 → **1 369** | 10 126 → **1 126** | 13 584 → **855** | 9 370 → **1 062** | 13 982 → **1 222** |

Ce qu'on en retient :
- **Scène site** : le glisser reste **fluide jusqu'à 2 000 éléments** (p95 12 ms, contre 68) et
  **acceptable jusqu'à 10 000** (27 ms à 5 000, 39 ms à 10 000, contre 152 et 477). Déplacer et zoomer la
  vue restent fluides ou acceptables jusqu'à 10 000 (pan 16 ms, zoom 30 ms, contre ≈ 118). Le seuil
  « gênant » passe de ≈ 2 000 à **plus de 10 000** pour le glisser ; la sélection (113 ms) et la validation
  d'un texte (176 ms) sont maintenant ce qui décroche en premier à 10 000.
- **Scène plate** : l'ouverture à 10 000 passe de 87 s à 5 s, la sélection et le glisser sont divisés par
  3 à 9. Ce gain vient surtout de l'index : le panneau Calques appelle toujours `findNode` pour chaque ligne
  (point chaud 1), mais chaque appel ne coûte plus rien. La scène plate reste gênante dès 1 000 éléments
  tant que le panneau Calques est redessiné en entier (pistes 1 et 6, en cours ailleurs).
- **Relâcher** coûte un peu plus à 2 000-5 000 éléments sur la scène site (11 → 18 ms, 19 → 75 ms) : la
  validation complète du document, autrefois payée à chaque mouvement de souris, est payée une fois au
  relâcher. À 10 000, il baisse quand même (145 → 76 ms).
- Échap→validé et MCP « appliquer » passent toujours par la validation complète (une modification
  enregistrée) : ils gagnent sur la scène plate et à 10 000, et ne bougent pas au-delà du bruit ailleurs.
