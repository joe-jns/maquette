# Pen 1.2.16 : canevas et interactions (enquête en lecture seule)

Source : `out/editor/assets/index.js` (7,6 Mo, minifié) de l'app.asar de Pen 1.2.16. Les noms de classes minifiés (`aa`, `fHe`, `ian`…) sont cités pour qu'on puisse les retrouver ; ils changeront à la prochaine version. Les extraits sont courts et servent seulement de preuve. On ne reprend aucun code.

Légende : **OBSERVÉ** = lu dans le code. **DÉDUIT** = conclusion tirée de ce qu'on a lu. **INCONNU** = pas trouvé ou pas vérifié.

---

## 0. Architecture en une minute

- **OBSERVÉ** : un objet central, le *sceneManager*, possède ces morceaux : `camera` (classe `atn`), `input` (`y9n`), `stateManager` (`nln`), `selectionManager` (`Cln`), `snapManager` (`ian`), `resizeHandles` (`Jnn`), `measurementManager` (`bin`), `textEditorManager` (`iln`), `undoManager` (`Tin`), `skiaRenderer` (`Tcn`), `scrollbars` (`Ian`) et `guidesGraph` (`Ain`).
- **OBSERVÉ** : les interactions passent par une **machine à états**. Un seul état est actif à la fois (`stateManager.state`) et on change d'état avec `transitionTo(new X(...))`, qui appelle `onExit()` puis `onEnter()`. Chaque état fournit `onPointerDown/Move/Up`, `onKeyDown/Up`, `onDoubleClick`, `onUndo/onRedo`, `onWindowBlur`, `refreshHover` et **`render(renderer, canvas)`** : chaque état dessine sa propre surcouche. Les états vus :
  - `aa` : au repos / sélection ;
  - `fHe` : déplacement ;
  - `g6e` : redimensionnement ;
  - `B7` : sélection au rectangle (*marquee*) ;
  - `Ttn` : rotation ;
  - `p6e` : rayon des coins ;
  - `trn` : dessin d'une forme ;
  - `cqe` : création de texte ;
  - `O5e` : édition de texte ;
  - `Qd` : édition de tracés ;
  - `LE` : recadrage d'image ;
  - `zk` : présentation ;
  - `R5e` : commentaires.
- **OBSERVÉ** : deux **quasi-états transverses** sont superposés à l'état courant : `handState` (main, `oin`) et `zoomState` (zoom maintenu par Z, `tln`). Ils interceptent le pointeur avant l'état courant.
- **OBSERVÉ** : les primitives mathématiques viennent de **PixiJS 8.3.4** : `Matrix` (`rn`), `Point` (`ea`) et `Bounds` (`En`), reconnaissables à leurs `toString()` du type `[pixi.js:Matrix ...]`. `browserAll.js` et `webworkerAll.js` sont les morceaux de Pixi chargés à la demande (« lazy chunks »). Ce ne sont **pas** des workers de rendu propres à Pen.

---

## 1. Caméra

### Limites de zoom
- **OBSERVÉ** : `constrainZoom(e){… return zn(.02,e,256)}`, où `zn` borne une valeur entre un minimum et un maximum. Le zoom va donc de **2 % à 25 600 %**.

### Molette et pincement (`handleContainerWheel`, OBSERVÉ)
- Le gestionnaire est posé sur le conteneur du canevas avec `{passive:false}` et appelle `preventDefault()` à chaque fois. Un second gestionnaire sur `window` fait `preventDefault` si `ctrlKey` est enfoncé, pour bloquer le zoom natif d'Electron.
- **Zoom** si `ctrlKey`, `metaKey` ou l'option `scrollWheelZoom` sont actifs. Le pincement du pavé tactile arrive dans le navigateur comme une molette avec `ctrlKey=true` ; c'est donc le même chemin.
  - Le `deltaY` est borné à **±30**, ou **±15** avec Cmd.
  - Le facteur vaut `a = clamp(deltaY) * -0.012`. Le nouveau zoom vaut `zoom + a*zoom`, ce qui fait au plus **±36 % par événement** (±18 % avec Cmd). Le zoom est **multiplicatif**.
  - Une option `invertZoomDirection` existe.
- **Zoom vers le curseur** : `zoomTowardsPoint(wx, wy, z)` garde fixe le point du monde situé sous la souris. Il change le zoom puis applique la translation `translate(e - i/zoom - left, …)`.
- **Panoramique** à la molette, sans modificateur :
  - le déplacement vaut `deltaX*1.5` et `deltaY*1.5` ;
  - la longueur du vecteur est **bornée à 120 px écran** par événement ;
  - le résultat est divisé par le zoom ;
  - hors Mac, **Shift échange les axes** pour un défilement horizontal.
- **Inertie : aucune côté app.** La main (espace+glisser) translate directement de l'écart de la souris (`oin.handlePointerMove`). L'inertie qu'on ressent sur Mac vient du système, qui continue d'envoyer des événements de molette.

### Déplacement de la vue
- **OBSERVÉ** (`nln.handlePointerDown`) :
  - `e.button===1` (clic molette) active la main ;
  - `pressedKeys.has("Space") && button===0` aussi ;
  - l'outil `hand` (touche H) aussi.
- **OBSERVÉ** : la main capture le pointeur, affiche les curseurs `grab`/`grabbing` et appelle `camera.translate(-dx/zoom, -dy/zoom)`. Au relâchement d'Espace, on revient à l'outil précédent, sauf si un glisser est en cours.

### Outil zoom maintenu (touche Z, `tln`, OBSERVÉ)
- Clic : zoom **×2**, ou **÷2** avec Alt.
- Glisser de plus de **4 px écran** : on passe en « zoom sur une zone ». Le rectangle est agrandi jusqu'à au moins 1 unité, puis `zoomToBounds(r, 0, {animate:true, duration:120})`.

### Raccourcis de zoom (OBSERVÉ)
- **Mod+= / Mod+-** : on passe à la **puissance de 2 suivante**, avec `2**(floor(log2(zoom))+1)`. Les paliers sont donc 25 %, 50 %, 100 %, 200 %…
- **Mod+0** = 100 %.
- **Shift+1** = tout afficher : `zoomToBounds(docBBox, 40, {animate:true})`, avec une marge de 40 px.
- **Shift+2** = zoom sur la sélection.
- **Au chargement**, la vue s'ajuste au document avec `maxZoom:1` : jamais de grossissement au-delà de 100 %.

### Animations de caméra (OBSERVÉ)
- `zoomToBounds` dure **220 ms par défaut**, avec un easing. Le zoom est interpolé de façon cohérente avec l'échelle, via `1/zoom`.
- `ensureVisible` (par exemple après une duplication) utilise un lissage exponentiel. `nw(a,b,15,dt) = b + (a-b)·e^(-15·dt)` est appliqué au **log du zoom** et au centre. L'animation s'arrête quand on est à moins de 0,5 px écran.

### Bornes de la vue
- **OBSERVÉ** : `constraint` et `reachableBounds` limitent la zone qu'on peut atteindre.
- **DÉDUIT** : la contrainte ne sert qu'en présentation ou en zoom verrouillé. En édition, le canevas est infini.
- **OBSERVÉ** : des barres de défilement sont dessinées dans le canvas (`Ian`) et se calent sur la boîte englobante du document.

### Ne dessiner que le visible (culling)
- **OBSERVÉ** : `beginRender(...)` sort tout de suite si `!renderBounds.intersects(this.getVisualWorldBounds())`. Les bornes « visuelles » incluent les effets (ombres, flous).
- **OBSERVÉ** : le magnétisme (snap) ne considère que les nœuds visibles (`camera.bounds.intersects(...)`). Le contour pointillé des enfants d'un auto-layout n'est lui aussi dessiné que pour les enfants visibles.

---

## 2. Trouver le nœud cliqué (hit-testing)

- **OBSERVÉ** : il n'y a **aucun index spatial**. On ne trouve ni `rbush`, ni quadtree, ni BVH, ni grille de hachage.
- **OBSERVÉ** : `findNodeAtWorldPosition(x, y, deep, allowedNested, root, opts)` parcourt l'arbre :
  - `scenegraph.updateLayout()` est appelé d'abord ;
  - si l'option `includeFrameTitle` est active, on teste d'abord les **titres des cadres** (le nom au-dessus de chaque artboard) ;
  - puis on parcourt les enfants du viewport **du dernier au premier**, c'est-à-dire du plus haut en z-order au plus bas, et chaque enfant fait `child.pointerHitTest(...)` ;
  - le premier résultat non nul gagne.
- **OBSERVÉ** : chaque type de nœud a son propre test :
  - **nœud de base** : le point est ramené en coordonnées locales par la matrice inverse, puis on teste le rectangle local (`localBounds().containsPoint`). Ça marche donc avec la rotation.
  - **forme** : on teste d'abord le rectangle englobant, puis la boîte visuelle. Ensuite seulement on teste le **chemin du contour**, avec `strokePath.containsPoint`.
  - **cadre (frame)**, c'est là que sont les règles de sélection :
    - un cadre racine sans enfants est touché par son rectangle ;
    - en mode profond (Mod enfoncé), on teste les enfants d'abord et le fond du cadre ensuite ;
    - en mode normal, **un cadre imbriqué est renvoyé en entier** si on est dans son rectangle et qu'il n'appartient pas à l'ensemble `allowedNested`.
    - `allowedNested` = les cadres racines sélectionnés plus **tous les ancêtres des nœuds sélectionnés**. C'est ce qui permet de « descendre d'un cran » quand on clique près de la sélection actuelle.
    - **un cadre racine qui a des enfants n'est pas sélectionné par un clic dans son fond** : on tombe sur ses enfants. Il se sélectionne par son titre, sauf si l'option `selectBackground` est active (clic droit ou Alt pour mesurer).
  - **enfants** (`_pointerHitTestChildren`) : si le parent coupe son contenu (`clip`), on vérifie d'abord que le point est dans son remplissage. **Règle maligne** : si l'enfant touché recouvre entièrement le parent (`u.includesNode(this)`) et qu'on n'est pas en mode profond, on renvoie le **parent**. Un fond pleine taille ne « vole » donc pas le clic.
- **DÉDUIT** : le coût est en O(nœuds visités). Il est atténué parce que le test du rectangle est fait en premier et que le parcours s'arrête au premier résultat. Ça tient pour des documents de taille raisonnable, mais ça ne passera pas à 100 000 nœuds.

---

## 3. Règles de sélection (OBSERVÉ, état `aa` et tableau des raccourcis)

| Geste | Effet |
|---|---|
| Clic | Sélectionne le nœud trouvé au pointer-down **s'il n'est pas déjà dans l'arbre de la sélection**. Sinon la sélection est reportée au relâchement (`selectNodeOnMouseUp`), ce qui permet de glisser une sélection multiple sans la perdre. |
| Shift+clic | Ajoute ou retire de la sélection (bascule). |
| Mod+clic | « Sélection profonde » : on descend jusqu'à la feuille, en ignorant les groupes et les cadres. |
| Mod+glisser | **Rectangle de sélection profond**. Mod au pointer-down vide la sélection (sauf avec Shift) et arme le rectangle, même si on part d'un nœud. |
| Glisser dans le vide | Rectangle de sélection (`B7`). |
| Shift+glisser | Ajoute à la sélection du rectangle. Le comportement est en fait un **OU exclusif** avec la sélection initiale : un nœud déjà sélectionné et touché par le rectangle en sort. |
| Double-clic sur un groupe ou un cadre | Sélectionne l'enfant sous le pointeur dans ce conteneur (on descend d'un niveau). |
| Double-clic sur un texte, une note ou un titre de cadre | Démarre l'édition du texte. |
| Double-clic sur un rectangle ou un cadre (sans enfant touché) | Mode recadrage ou image (`LE`). Sur un vecteur, mode édition de tracé (`Qd`). |
| Entrée | Sélectionne les enfants ; sur une forme, édite ses points. |
| Shift+Entrée | Sélectionne le parent. |
| Échap | Désélectionne, ou revient à l'outil Déplacer. |
| Clic dans le vide sans Shift | Vide la sélection au relâchement. |

- **Double-clic détecté par l'app** (`Qan`, OBSERVÉ) : deux pressions en moins de **300 ms** et à moins de **4 px écran**. Bouger de plus de 4 px pendant l'appui désarme la détection. L'app n'utilise pas l'événement `dblclick` du DOM.
- **Rectangle de sélection** (`findNodesInRectRecursive`, OBSERVÉ) :
  - critère = **intersection** avec la matrice, et non inclusion complète ;
  - exception : un groupe ou un cadre **entièrement contenu** dans le rectangle est pris en entier ;
  - un cadre racine qui a des enfants n'est pas pris en entier (il n'est pas contenu) : on descend dans ses enfants ;
  - en mode profond, on descend dans tous les groupes et cadres.
- **Survol** : le nœud sous le curseur est mis en évidence par un contour de 2 px écran. Si le nœud survolé est en **auto-layout**, chacun de ses enfants visibles reçoit en plus un contour **pointillé** (tirets de 1,5 px).

---

## 4. Déplacement, redimensionnement, magnétisme, mesures

### Démarrage d'un glisser
- **OBSERVÉ** : `ucn = 4`. On passe en état « déplacement » ou « rectangle de sélection » dès que le pointeur a bougé de **4 px écran** (la distance au carré est comparée à `(4/zoom)²` en coordonnées monde).
- **OBSERVÉ** : un clic sur une sélection existante suivi d'un glisser déplace toute la sélection. Si on part d'un nœud non sélectionné, il est sélectionné au moment où le glisser démarre.

### Déplacement (`fHe`, OBSERVÉ)
- Au début du glisser, un seul bloc d'annulation (*undo block*) est ouvert : il photographie `x`, `y` et le parent de chaque nœud. Pendant le mouvement, **chaque image est écrite avec `commitBlock(…, {undo:false})`**. À la fin, **un seul** `commitBlock(original, {undo:true})` est poussé. Le résultat : **une seule entrée d'annulation par glisser**.
- Les positions sont arrondies au pixel si `roundToPixels` est actif (c'est le cas par défaut).
- **Alt pendant le glisser** = duplication à la volée. Relâcher Alt annule la duplication **après 700 ms** (`brn=700`), ce qui évite un clignotement si on le relâche brièvement.
- **Ctrl** = pas de magnétisme (`snap = !ctrlKey`). **Cmd ou Ctrl** = « n'importe quelle taille » pour choisir le cadre de dépôt.
- **Changement de parent** (`findDropFrame`) :
  - on prend le cadre le plus profond sous le pointeur qui `canAcceptChildren` ;
  - sans Cmd, on remonte jusqu'au premier cadre **assez grand pour contenir les éléments déplacés** (`width>=dragW && height>=dragH`) ;
  - le niveau racine est toujours accepté.
  - **DÉDUIT** : c'est ce qui évite de « tomber » dans un petit bouton en survolant.
- **Auto-layout** :
  - **si on reste dans le conteneur d'origine**, on fait un **réordonnancement en direct** (`reorderNodes`) : on change l'index de l'enfant, les frères bougent tout de suite et l'élément tiré suit la souris grâce à un `visualOffset` (décalage visuel, sans modifier le modèle) ;
  - **si on entre dans un autre conteneur en auto-layout**, on a un **dépôt différé** : l'élément reste flottant, on dessine l'indicateur, et le changement de parent n'est fait qu'au relâchement ;
  - **indice d'insertion** (`NKt`) : c'est le premier enfant dont le **centre**, sur l'axe principal, est au-delà du pointeur. Les éléments tirés et les enfants hors layout sont ignorés ;
  - **indicateur** : contour du conteneur cible de 3 px écran, plus une **ligne pointillée de 2 px** (tirets de 8/8 px écran). La ligne est placée au milieu de l'espace entre les deux enfants voisins, ou entre le bord et le premier ou le dernier enfant.
- **Animation de reflow** (OBSERVÉ) : `animateLayoutChange` mémorise les positions, recalcule le layout, puis donne à chaque nœud un `visualOffset = ancienne position − nouvelle`. Ce décalage revient à 0 au fil des images. C'est la technique **FLIP**.

### Magnétisme (`ian`, OBSERVÉ)
- **Seuil** : `h5e = 5`, soit **5 px écran** (`5/zoom` en monde). Le magnétisme se règle séparément sur chaque axe et garde le plus petit écart (`bestDeltaPerAxis`).
- **Points du rectangle déplacé** : 4 coins et le centre.
- **Points cibles** d'un nœud (`getSnapPoints`) : 4 coins et 4 milieux de bords. Les centres sont donc présents en X et en Y. Pour un **texte**, on ajoute les **lignes de base** (récupérées par `getLineMetrics`).
- **Cibles** :
  - le **parent** (si c'est un cadre) ;
  - les **frères visibles** dans le même parent ;
  - les groupes sont parcourus récursivement ;
  - les nœuds hors du même parent ne sont **pas** pris en compte.
- **Aucun magnétisme quand un élément est en auto-layout.**
- **Pas d'« espacements égaux »** : on ne trouve aucune trace d'un magnétisme par gap ou par distribution.
- **Désactivation** : option `snapToObjects` (activée par défaut), ou touche **Ctrl** maintenue.
- **Affichage** : des lignes de 1 px écran, couleur `SNAP`, et une **petite croix (×) de 4 px** sur chaque point aligné, côté cible comme côté élément tiré.
- **Redimensionnement** : le magnétisme ne s'applique qu'au point de la poignée. Une poignée de coin aimante sur les deux axes. Une poignée de bord n'aimante que sur son axe, et seulement si l'élément n'est pas tourné.

### Poignées (`Jnn.getView`, OBSERVÉ, tailles en px écran)
- **Contour de sélection** : 1,25 px, à l'extérieur. Pas de contour sur une frontière d'instance de composant.
- **Coins** :
  - carré visible de **8 px**, blanc avec bord de couleur ;
  - zone cliquable de **15 px** ;
  - derrière chaque coin, une zone de **rotation** de **35 px**, avec un curseur de rotation orienté.
- **Bords** : zones cliquables de **15 px** d'épaisseur sur toute la longueur.
- **Pas de poignées si la sélection mesure moins de 10 px** dans les deux dimensions. **En dessous de 25 px**, une zone de déplacement couvre tout le corps de l'élément, pour qu'on puisse encore le glisser.
- **Rayon des coins** : 4 pastilles de 9 px apparaissent sur un rectangle de plus de 100×100 px écran.
- **Étiquette de taille** : `« W x H »` (arrondi à 0,01) sous la sélection, dans une pastille arrondie (Inter 12 px), qui suit la rotation.
- Les poignées sont échangées si l'élément est retourné (`flipX`/`flipY`).
- **Curseurs** : générés selon l'angle (`Rp("resize"|"rotate", dirX, dirY, rotation)`).

### Redimensionnement (`g6e`, OBSERVÉ)
- **Shift** = proportionnel. **Alt** = symétrique, depuis le centre. **Ctrl** = sans magnétisme.
- Le calcul est fait dans le **repère de la boîte englobante**. Une sélection multiple est traitée comme une boîte alignée sur les axes. La transformation est appliquée récursivement aux enfants des groupes.
- Redimensionner un élément en taille « fit/fill » le **passe en taille fixe** sur l'axe concerné (`H7`). Un texte en largeur automatique passe en `fixed-width` ou `fixed-width-height`.
- Les écritures passent par un **`UpdateBatch`** (`Lcn`). Chaque propriété n'est photographiée qu'une fois, puis appliquée directement. Au relâchement, `end()` produit **une seule entrée d'annulation**.

### Rotation
- **OBSERVÉ** (recadrage d'image) : `crn = π/12`. Shift aligne la rotation sur des pas de **15°**.
- **DÉDUIT** : la rotation des formes utilise probablement le même pas.

### Mesures de distance (`bin`, OBSERVÉ)
- **Alt** maintenu avec l'outil Déplacer et une sélection : on affiche les distances entre la sélection et le **nœud survolé**. Pendant une duplication avec Alt, on affiche les distances entre l'original et la copie.
- Lignes de 1 px couleur `SNAP`. Des prolongements pointillés (3/3) apparaissent quand les éléments ne se chevauchent pas.
- Les étiquettes sont en Inter 11 px blanc, sur une pastille couleur `SNAP` avec 3 px d'arrondi, arrondies à 0,01.

### Flèches du clavier (OBSERVÉ)
- Déplacement de `smallNudge = 1` px, ou `bigNudge = 10` px avec Shift (les deux se règlent).
- **Une entrée d'annulation par appui** : rien ne regroupe les appuis successifs.
- **Dans un auto-layout**, les flèches **réordonnent** l'élément (en avant / en arrière). Avec Alt, l'élément va tout au début ou tout à la fin.

---

## 5. Édition de texte sur le canevas

- **OBSERVÉ** : l'édition passe par un **vrai éditeur DOM posé par-dessus le canevas**. Il n'y a pas d'éditeur de texte fait maison dans Skia.
  - **Texte multiligne** : **Quill** (`class Dcr extends smt`, `new en(div, {modules:{toolbar:false}, formats:["text"]})`). C'est un contentEditable limité au **texte brut**.
  - **Une seule ligne** (titre de cadre, URL…) : un `<input>`. Un `<span>` caché mesure le texte pour que l'input s'élargisse en même temps.
  - **Conteneur** : `<div data-pencil-canvas-text-editor data-pencil-canvas-overlay class="absolute inset-0 pointer-events-none z-10">`.
- **OBSERVÉ (alignement)** :
  - le nœud fournit `getTextAreaInfo()`, qui renvoie la boîte, un style CSS (police, taille, interligne, espacement) et la **ligne de base** ;
  - l'éditeur DOM est placé avec `transform: matrix(caméra × monde du nœud) translate(...)` ;
  - un **« baselineProbe »** mesure la ligne de base réelle du DOM et compense l'écart avec Skia ;
  - la position est recalculée à chaque `afterUpdate` (zoom ou défilement) et à chaque `document.fonts` `loadingdone`.
- **OBSERVÉ** : pendant l'édition, le texte Skia est **masqué** (`node.hideText()`), si bien que seul le texte DOM est visible.
- **OBSERVÉ (validation)** :
  - à chaque frappe, `commitText` écrit dans la scène avec `{undo:false}`, et le rendu du nœud se met à jour en direct ;
  - à la fin, **une seule entrée d'annulation** est créée à partir de la photo `textContent` prise à l'entrée ;
  - un texte **vide à la sortie est supprimé** ;
  - **Échap** ou un clic à l'extérieur termine l'édition. **Cmd/Ctrl+Entrée** la valide en multiligne, Entrée la valide pour une seule ligne ;
  - l'historique interne de Quill est vidé : on garde l'annulation de l'app et pas celle de l'éditeur.
- **OBSERVÉ** : le gestionnaire de clavier global ignore les touches si `activeElement` est un INPUT, un TEXTAREA ou un `contenteditable`. Un écouteur dédié empêche aussi que **Mod+Z** dans un champ texte soit capté par l'annulation globale.
- **OBSERVÉ** : un texte créé par un glisser de plus de 30×10 px a une largeur fixe ; un simple clic crée un texte en largeur automatique. La taille par défaut est de **16 px**, et la couleur est **lue dans le pixel sous le clic** pour contraster.

---

## 6. Annuler / rétablir

- **OBSERVÉ** : le modèle repose sur des **opérations inverses**, enregistrées au moment de la modification. Ce n'est ni un instantané complet du document, ni un patch JSON.
  - `scenegraph.beginUpdate()` ouvre un **bloc**, qui contient une liste `rollback`.
  - Avant de modifier une propriété, `block.snapshotProperties(node, ["x","y"])` pousse dans `rollback` une fermeture qui **restaure les anciennes valeurs**. Il en va de même pour `snapshotParent`, l'ajout ou la suppression de nœuds, les variables, les thèmes…
  - `commitBlock(block, {undo:true})` pousse `block.rollback` (un tableau d'opérations) sur `undoStack` et **vide `redoStack`**. Avec `{undo:false}`, rien n'est poussé.
  - **Annuler** (`applyFromStack`) : on prend le dernier tableau et on exécute ses opérations **en ordre inverse**. Chaque `perform(manager, inverses)` **produit elle-même son opération inverse**, et ces inverses forment l'entrée de rétablissement.
  - `rollbackBlock` annule un bloc sans toucher à l'historique (utile pour un geste abandonné).
- **OBSERVÉ (regroupement)** : on regroupe **par geste**, pas avec un minuteur :
  - un glisser, un redimensionnement ou une rotation donne un seul bloc ouvert à `onEnter` et validé à `onExit` ;
  - un `UpdateBatch` (`Lcn`) photographie chaque propriété **une seule fois** pendant un geste continu, puis `end()` valide et `cancel()` revient en arrière ;
  - une session d'édition de texte donne un seul bloc.
- **OBSERVÉ** : l'état courant peut **intercepter** l'annulation (`stateManager.handleUndo()` → `state.onUndo?.()`). Par exemple, l'éditeur de tracés gère sa propre annulation tant qu'il est ouvert.
- **OBSERVÉ** : les surcharges des **instances de composants** sont aussi photographiées (`overriddenProperties`).
- **INCONNU** : une éventuelle limite de taille de la pile. Aucune n'a été vue.

---

## 7. Raccourcis clavier (OBSERVÉ)

Deux couches se superposent :
1. **Une table d'actions déclarative.** Chaque action est un objet `ur({label, flags, analytics, shortcuts:[{keyCode, modifiers, ignoredModifiers}], enabled(ctx), run(ctx)})`. Les modificateurs sont un masque de bits : **1 = Mod (Cmd sur Mac, Ctrl ailleurs), 2 = Shift, 4 = Alt**. `ignoredModifiers` permet d'accepter par exemple Mod+= avec ou sans Shift. La table est indexée par `keyCode` (`Zsn`). L'état courant reçoit la touche **en premier** et peut la consommer.
2. **Les touches d'outils et de modes** gérées dans les états : Espace pour la main, Z pour le zoom maintenu, et les lettres des outils.

La même liste sert à afficher la fenêtre « Keyboard Shortcuts », ouverte avec `?`.

| Domaine | Raccourcis |
|---|---|
| Outils | V Déplacer · K Échelle · H Main · C Commentaire · Z Zoom (maintenu) · A/F Cadre · T Texte · N Note · R Rectangle · O Ellipse · P Plume |
| Édition | Mod+D dupliquer · Suppr/Retour arrière supprimer · Mod+G grouper · Mod+Retour arrière ou Mod+Shift+G dégrouper · **Mod+Alt+G encadrer la sélection** · **Shift+A ajouter un auto-layout** · Shift+Alt+A le retirer · Shift+H / Shift+V retourner · Mod+Z / Mod+Shift+Z |
| Composants | Mod+Alt+K créer · Mod+Alt+X détacher l'instance · Alt+Shift+R remplacer dans l'instance |
| Presse-papiers | Mod+C/X/V · Mod+Shift+R coller en remplaçant · Mod+Shift+C copier en PNG · Mod+Alt+C copier en HTML |
| Alignement | Alt+A gauche · Alt+D droite · Alt+W haut · Alt+S bas · Alt+H centre horizontal · Alt+V milieu vertical |
| Ordre | Mod+] avancer · Mod+[ reculer · ] premier plan · [ arrière-plan |
| Sélection | Mod+A tout · Échap · Entrée enfants · Shift+Entrée parent · Mod+clic profond · Shift+clic ajouter · glisser = rectangle · Mod+glisser = rectangle profond |
| Vue | Mod+molette zoom · Mod+= / Mod+- / Mod+0 · Shift+1 tout afficher · Shift+2 sélection · Z+clic / Z+Alt+clic / Z+glisser · molette = défilement · Shift+molette horizontal · Espace+glisser · clic molette+glisser |
| Divers | Mod+' grille de pixels · Mod+Shift+' magnétisme sur la grille de pixels · Shift+C repères de commentaires · Mod+Entrée présentation · ? aide |
| Tracés | P plume · V points · X couper · Entrée éditer / valider · Mod+J joindre · Alt+glisser dupliquer · double-clic lisse/angle, etc. |

- **Grille de pixels** (OBSERVÉ) : affichée à partir de **zoom > 4** (400 %), en fondu entre 4 et 5,5. C'est un shader appliqué au rendu du contenu.

---

## 8. Surcouche : dans le même canvas, avec quelques éléments DOM

- **OBSERVÉ** : presque toute la surcouche est **dessinée dans la même surface Skia**, *après* le contenu. Cela comprend :
  - les poignées, les contours, le rectangle de sélection et les guides de magnétisme ;
  - les mesures, l'indicateur d'insertion, les titres de cadres et les barres de défilement ;
  - les curseurs des agents IA.

  L'ordre de `Tcn.render()` est :
  1. `displayContentCanvas()` (le contenu en cache) ;
  2. `sceneManager.render()`, qui dessine en coordonnées monde le survol, puis `state.render`, le zoom et le magnétisme ;
  3. `renderScreenspace()`, qui dessine en coordonnées écran les poignées et les étiquettes ;
  4. les curseurs des agents, puis les barres de défilement.
- **OBSERVÉ** : les poignées et les étiquettes utilisent une **petite bibliothèque d'interface maison** dessinée dans Skia : `Or` est une boîte avec padding, fond, contour, rayon, `cursor` et `onPointerDown`, et `no` est un texte. On y trouve donc un **mini système de layout et de hit-test pour la surcouche elle-même**. Les épaisseurs restent constantes à l'écran parce qu'elles sont divisées par le zoom (`1/zoom`), ou parce que le dessin se fait directement en coordonnées écran.
- **OBSERVÉ** : **le DOM sert seulement pour** :
  - l'éditeur de texte (voir §5) ;
  - les **pastilles de commentaires**, placées en `translate3d` dans une couche « monde » ;
  - les menus et panneaux React ;
  - les vues de navigateur intégrées (webviews).

---

## 9. Performance

- **Cache du contenu** (`Tcn`, OBSERVÉ) :
  - la scène est dessinée dans une **surface hors écran** (« contentSurface ») de la taille du viewport, **plus 512 px de marge** de chaque côté, avec un multi-échantillonnage d'au plus 4 ;
  - à chaque image, l'écran est rempli en **réutilisant cette image**, via `makeImageSnapshot()` et un shader avec la matrice inverse de la caméra du moment du rendu. Le rééchantillonnage est **cubique** si le zoom a changé et au plus proche (*nearest*) sinon ;
  - le contenu est redessiné si :
    - un nœud a changé (`invalidateContent(node)` → `dirtyNodes`) ;
    - le zoom actuel dépasse **3×** le zoom du dernier rendu ;
    - la vue sort de la zone déjà rendue ;
    - ou **200 ms après la fin d'un mouvement de caméra** (`debouncedMoveEnd`), pour un rendu net au zoom exact.
  - **DÉDUIT** : pendant un zoom ou un défilement rapide, on étire une image au lieu de redessiner la scène. C'est le principal levier de fluidité.
- **OBSERVÉ** : il n'y a **pas de tuiles** : une seule surface pour tout le viewport. Quand quelque chose a changé, **tout le viewport est redessiné**. `dirtyNodes` sert surtout à invalider les caches de flou d'arrière-plan et de filtres (`backdropManager`), avec propagation aux voisins qui se chevauchent.
- **OBSERVÉ** : la boucle de rendu est **à la demande**. `requestFrame()` lance une boucle requestAnimationFrame seulement si nécessaire. Les animations (caméra, FLIP) redemandent une image tant qu'elles tournent.
- **OBSERVÉ** : les calculs de bornes sont mis en cache par nœud, avec des drapeaux de validité (`_flags & 4/8/16/32/64`) pour les bornes locales, monde, visuelles et transformées.
- **OBSERVÉ** : les pointermove utilisent `getCoalescedEvents()`, mais seul le **dernier** événement est traité.
- **OBSERVÉ (workers)** :
  - il y a une petite infrastructure de workers générique (`Tfe`), qui crée un Worker depuis un Blob et retombe sur le fil principal en cas d'échec ;
  - elle sert à des tâches annexes : l'« image-stitch » (assemblage de captures en JPEG via `OffscreenCanvas`) et l'encodage PNG ;
  - **le rendu et le layout restent sur le fil principal.**
- **DÉDUIT** : WebGL2 sert de backend à CanvasKit. On voit une gestion de perte de contexte : `webglcontextlost`/`restored` vide les assets et retaille la surface.

---

## Recommandations pour Maquette

Le contexte est différent : chez nous le **rendu est fait en vrai HTML/CSS** et la surcouche est en SVG. Certaines techniques de Pen ne se transposent pas, notamment le cache d'image de la scène. Les comportements et les seuils, eux, se reprennent tels quels.

### Valeurs à adopter
| Paramètre | Valeur | Origine |
|---|---|---|
| Zoom min / max | 0,02 – 256 (on peut se limiter à 0,05 – 64 au départ) | Pen |
| Molette + Ctrl ou pincement | `delta = clamp(deltaY, ±30)` ; `zoom *= 1 - 0.012*delta`, centré sur le curseur | Pen |
| Défilement à la molette | `delta*1.5`, longueur bornée à 120 px par événement ; Shift échange les axes hors Mac | Pen |
| Raccourcis +/- | paliers en puissances de 2 | Pen |
| Tout afficher | marge de 40 px, animation de 220 ms ; au chargement, `maxZoom = 1` | Pen |
| Seuil de démarrage du glisser | 4 px écran | Pen |
| Double-clic | 300 ms et 4 px, mesurés par l'app (pas `dblclick`) | Pen |
| Seuil de magnétisme | 5 px écran, par axe, on garde le plus petit écart | Pen |
| Poignées | carré visible 8 px ; zone cliquable 15 px ; bord 15 px ; rotation 35 px aux coins ; pas de poignées sous 10 px, zone de déplacement sous 25 px | Pen |
| Pas de rotation avec Shift | 15° | Pen |
| Flèches | 1 px / 10 px avec Shift | Pen |
| Rendu net après mouvement | 200 ms d'inactivité | Pen (voir le point 2 de « Idées à reprendre ») |

### Idées à reprendre
1. **Machine à états d'interaction** où chaque état gère `onEnter/onExit/pointer/key/render`, plus des quasi-états transverses (main, zoom maintenu). Ça évite les `if (isDragging && !isResizing …)` en cascade. En React, on garde ça **hors de React** (classes TS simples) et on n'expose que ce dont l'interface a besoin.
2. **Transformation CSS unique** pour la caméra. Pendant un zoom en continu, on applique seulement `transform: translate() scale()` au calque du monde. Après **200 ms sans mouvement**, on peut recalculer ce qui dépend du zoom : épaisseurs de la surcouche, passage de `will-change` à `auto` pour récupérer un texte net. C'est l'équivalent HTML du cache d'image de Pen, avec le même délai.
3. **Hit-testing en deux temps.**
   - (a) Pour la *sélection*, on refait l'algorithme de Pen sur notre propre arbre : parcours du dernier enfant au premier, point ramené en coordonnées locales, règles « cadre imbriqué entier sauf s'il est ancêtre de la sélection », « enfant pleine taille = parent », « cadre racine avec enfants : on traverse ».
   - (b) Pour la géométrie, on peut s'appuyer sur `document.elementsFromPoint()`, puisque le rendu est du vrai DOM, puis appliquer nos règles. Il faut se méfier de `pointer-events` et des éléments en `overflow:hidden`.
   - Pas besoin de rbush tant qu'on reste sous quelques milliers de nœuds. Pen n'en a pas.
4. **Un geste = une entrée d'annulation.** On ouvre un bloc au début du geste, on écrit sans historique à chaque image, puis on valide à la fin. Un `UpdateBatch` qui ne photographie chaque propriété qu'une fois sert pour les champs qu'on fait glisser dans le panneau. Pour le modèle, des **opérations inverses** construites au moment de l'écriture (comme Pen) ou des patchs Immer (`produceWithPatches`, qui donne les inverses directement) : les deux sont valables. Avec React, les patchs Immer sont plus naturels.
5. **Changement de parent par taille.** En remontant les ancêtres, on ne dépose que dans un cadre **assez grand pour l'élément tiré** ; Cmd force le dépôt dans le plus profond.
6. **Réordonnancement dans un auto-layout** :
   - dans le conteneur d'origine, en direct ; dans un autre, en différé avec indicateur ;
   - indice d'insertion = premier enfant dont le centre est au-delà du pointeur ;
   - ligne d'insertion pointillée au milieu du gap.
   Avec un rendu CSS, on obtient le reflow gratuitement. Il reste à faire un **FLIP** : mesurer avant, mesurer après, animer le décalage vers 0.
7. **Magnétisme simple d'abord** : coins et centre de l'élément tiré contre coins et milieux de bords du parent et des frères visibles, plus les lignes de base des textes. Ctrl le désactive. On l'affiche avec des lignes et des croix de 4 px. Les espacements égaux viendront plus tard : Pen ne les a même pas.
8. **Mesures avec Alt** : distances entre la sélection et le nœud survolé, avec des pastilles d'étiquettes.
9. **Édition de texte** : un contentEditable en texte brut placé par `transform: matrix(...)`. Chez nous, c'est encore plus simple : **éditer directement l'élément HTML rendu** (le passer en `contentEditable="plaintext-only"`), sans couche à superposer. On garde les règles de Pen :
   - écriture en direct sans historique, une seule entrée d'annulation à la sortie ;
   - texte vide supprimé ;
   - Échap ou un clic à l'extérieur pour finir ;
   - neutraliser les raccourcis globaux quand le focus est dans un champ texte.
10. **Raccourcis déclaratifs** : une table `{label, shortcuts:[{key, mods, ignoredMods}], enabled(ctx), run(ctx)}`, qui sert à la fois au clavier, aux menus et à la fenêtre d'aide `?`. Utiliser `e.code` ou `keyCode` plutôt que `e.key`, pour ne pas dépendre de la disposition du clavier, sauf pour `?`.

### Pièges relevés
- **`wheel` passif** : sans `{passive:false}` sur le conteneur, `preventDefault` ne marche pas, et Electron zoome toute la page au pincement. Il faut aussi un écouteur sur `window` qui bloque `ctrlKey+wheel`.
- **Pas de zoom additif** (`zoom += 0.1`), sinon il paraît trop lent à fort zoom et trop brutal à faible zoom. Toujours multiplicatif, et dans le repère du point sous le curseur.
- **Borner les deltas** : certaines souris envoient des deltas énormes (en mode « lignes » ou « pages »), d'où les bornes ±30 et 120 px de Pen.
- **Capture du pointeur** : `setPointerCapture` au pointerdown, plus la gestion de `lostpointercapture` et de `blur` de la fenêtre (Pen remet à zéro modificateurs, touches et gestes). Sinon un Alt-Tab au milieu d'un glisser laisse l'état bloqué.
- **Garder seulement le dernier événement fusionné** (`getCoalescedEvents`), pour ne pas recalculer le layout plusieurs fois par image.
- **Épaisseurs de la surcouche en px écran** : en SVG, `vector-effect: non-scaling-stroke`, ou une surcouche SVG **non transformée** dont les coordonnées sont converties monde → écran. La seconde option est plus simple pour les poignées à taille fixe.
- **Double-clic natif** : ne pas s'appuyer sur `dblclick` ; le compter soi-même (300 ms / 4 px), sinon il se mélange avec la logique de sélection au relâchement.
- **Sélection au relâchement** quand on clique dans une sélection existante : sinon il devient impossible de glisser plusieurs éléments sélectionnés.
- **Texte et polices** : repositionner l'éditeur ou relancer les mesures au `document.fonts` `loadingdone`. C'est déjà noté en mémoire : `fonts.ready` ment.
- **Annulation pendant un geste ou une édition de texte** : laisser l'état courant intercepter Mod+Z. L'historique du contentEditable doit être neutralisé.
- **PixiJS** : sa présence dans le paquet est un détail d'implémentation (primitives mathématiques). Elle ne veut pas dire qu'il faut un moteur de rendu WebGL ; avec un rendu HTML, un simple `DOMMatrix` suffit.
