# Figma : modèle de document et interactions (enquête pour l'app « Maquette »)

Date : 2026-10-16. Rien n'a été copié du code de Figma. Sources : doc d'aide publique (help.figma.com), doc développeurs (developers.figma.com), et le paquet npm `@figma/plugin-typings@1.142.0`, installé dans `research/figma-typings/` (fichier `plugin-api.d.ts`, 12 912 lignes ; les numéros de ligne cités renvoient à ce fichier).

Légende :
- **DOCUMENTÉ** : écrit dans une source officielle (citée).
- **DÉDUIT** : raisonnement à partir de sources officielles, ou comportement connu par l'usage mais sans texte officiel trouvé.
- **INCONNU** : aucune source trouvée.

Mots utilisés :
- **axe principal** : l'axe dans lequel les enfants se suivent.
- **contre-axe** : l'axe perpendiculaire.
- **nœud** : un calque.
- **mixin** : un groupe de propriétés partagé par plusieurs types de nœuds dans les typings.

---

## 1. Modèle de document

### Types de nœuds (DOCUMENTÉ, typings l. 12484 `type SceneNode`)
Les types de calques sont : `FRAME`, `GROUP`, `SECTION`, `COMPONENT`, `COMPONENT_SET`, `INSTANCE`, `TEXT`, `RECTANGLE`, `ELLIPSE`, `LINE`, `POLYGON`, `STAR`, `VECTOR`, `BOOLEAN_OPERATION` et `SLICE`.

S'y ajoutent des types propres à FigJam et Slides : `STICKY`, `CONNECTOR`, `SHAPE_WITH_TEXT`, `TABLE`, `SLIDE`, `SLOT`, `TEXT_PATH`, `TRANSFORM_GROUP`, entre autres. Au-dessus des calques, la racine est `DOCUMENT`, qui contient des `PAGE`.

### Composition par mixins (DOCUMENTÉ, l. 9418-9489)
- **`BaseFrameMixin`** (FRAME, COMPONENT, INSTANCE, COMPONENT_SET) réunit :
  - Base, Scene, Children, Container, Geometry (fills et strokes), ComplexStrokes ;
  - Corner + RectangleCorner (rayons), Blend (opacité, mode de fusion, effets, masque), Constraint ;
  - Layout, Export, IndividualStrokes, **AutoLayout**, GridLayout, AspectRatioLock ;
  - et en propre : `clipsContent`, `layoutGrids`, `guides`, `inferredAutoLayout`.
- **`DefaultShapeMixin`** (RECTANGLE, ELLIPSE…) : Base, Scene, Reaction, Blend, Geometry, Layout, Export.
- **`GroupNode`** (l. 10826) : Children, Blend, Layout, AspectRatioLock. Un groupe n'a **ni fills, ni strokes, ni constraints, ni rayons, ni clip, ni auto layout**.
- **`SectionNode`** (l. 12314) : Children, fills, strokes, rayons, `sectionContentsHidden`. Une section n'a **ni constraints, ni effets, ni clip**, et seulement `resizeWithoutConstraints`.
- `COMPONENT` = frame + propriétés de composant. `INSTANCE` = frame + `mainComponent`. Dans une instance, « Deleting a layer in an instance only hides it », et on ne peut pas y réordonner les calques (https://help.figma.com/hc/en-us/articles/360040451373).

### Propriétés communes (DOCUMENTÉ)
- **Base** : `id`, `name`, `parent`, `removed`, plugin data.
- **Scène** : `visible`, `locked`.
- **Mélange** : `opacity` (0-1), `blendMode` (dont `PASS_THROUGH`, réservé au calque), `isMask` + `maskType` (ALPHA / VECTOR / LUMINANCE ; un masque « masks its subsequent siblings »), `effects`.
- **Position et taille** :
  - `x`, `y` = `relativeTransform[0][2]` et `[1][2]`, c'est-à-dire la translation de la matrice de transformation ;
  - `width` et `height` sont en **lecture seule** et se changent par `resize()` ou `resizeWithoutConstraints()` (minimum 0,01) ;
  - `rotation` va de -180 à 180, autour du **coin haut-gauche** ;
  - `minWidth`, `maxWidth`, `minHeight`, `maxHeight`.
- **Repère des coordonnées** : `relativeTransform` est exprimé par rapport au **conteneur parent**, qui peut être la page, un frame, un composant ou une instance. Il n'est **pas** relatif à un groupe ni à une opération booléenne : « it is **not** relative to its direct parent if the parent is a group » (l. 7330 et suivantes). Raison donnée : un groupe se redimensionne d'après ses enfants. Si la position d'un enfant dépendait du groupe, déplacer l'enfant changerait le groupe, qui changerait à son tour l'enfant.
- **Pas d'échelle dans la matrice** : la matrice a toujours des axes unitaires et la taille vit dans `width` / `height` : « in 2D UI design, it's rare that you would want to scale the children when resizing a frame » (l. 7340 et suivantes).
- **Boîtes englobantes** :
  - `absoluteBoundingBox` exclut ombres et contours ;
  - `absoluteRenderBounds` inclut ombres et contours épais, et vaut null si le calque est invisible.
- **Calque caché** : un calque caché sort du flux de l'auto layout. Pour garder sa place, il faut mettre son opacité à 0 % (https://help.figma.com/hc/en-us/articles/31289464393751).

---

## 2. Auto layout

### Propriétés du conteneur (DOCUMENTÉ, typings l. 7694-8100)

| Propriété | Valeurs | Notes |
|---|---|---|
| `layoutMode` | NONE / HORIZONTAL / VERTICAL / GRID | Repasser à NONE **ne restaure pas** les positions d'origine. |
| `paddingTop/Right/Bottom/Left` | nombre | — |
| `itemSpacing` | nombre | L'aide évoque des espacements négatifs pour empiler. |
| `counterAxisSpacing` | nombre ou null | Seulement si WRAP. `null` le synchronise avec `itemSpacing`. Doit être positif. |
| `primaryAxisAlignItems` | MIN / MAX / CENTER / SPACE_BETWEEN / SPACE_EVENLY / SPACE_AROUND | Les trois SPACE_* correspondent au gap « Auto » de l'interface. |
| `counterAxisAlignItems` | MIN / MAX / CENTER / BASELINE | BASELINE seulement en HORIZONTAL. |
| `counterAxisAlignContent` | AUTO / SPACE_BETWEEN | Seulement si WRAP, sinon erreur. |
| `layoutWrap` | NO_WRAP / WRAP | Seulement en HORIZONTAL ou VERTICAL, sinon erreur. |
| `primaryAxisSizingMode` / `counterAxisSizingMode` | FIXED / AUTO | Ancien modèle. AUTO = HUG. |
| `strokesIncludedInLayout` | booléen | « behave like css `box-sizing: border-box` ». |
| `itemReverseZIndex` | booléen | `true` = le premier enfant est dessiné au-dessus. |

### Propriétés des enfants (DOCUMENTÉ, l. 8522-8580)
- **`layoutAlign`** : STRETCH ou INHERIT. MIN, CENTER et MAX sont dépréciés, car l'alignement sur le contre-axe est **commun à tous les enfants** et se règle sur le parent.
- **`layoutGrow`** : 0 ou 1, les seules valeurs supportées.
- **`layoutPositioning`** : AUTO ou ABSOLUTE. Passer en ABSOLUTE recalcule la taille du parent « as if this child did not exist ». Les constraints s'appliquent alors à nouveau à cet enfant.
- **`layoutSizingHorizontal` / `layoutSizingVertical`** : FIXED, HUG ou FILL. C'est un **raccourci** qui règle à la fois `layoutGrow`, `layoutAlign` et les `*SizingMode`.

### Combinaisons INVALIDES ou corrigées automatiquement

DOCUMENTÉ :

1. **HUG est réservé aux frames en auto layout et aux textes** : « `"HUG"` is only valid on auto-layout frames and text nodes » (l. 7464). Le régler ailleurs lève une erreur.
2. **FILL est réservé aux enfants directs d'un auto layout**, sinon erreur. Un frame de premier niveau ne peut pas être FILL : « Fill container can be applied only to child objects of auto layout frames » (https://help.figma.com/hc/en-us/articles/360040451373).
3. **Un parent HUG qui contient un enfant FILL sur le même axe** passe tout seul en FIXED sur cet axe : « will no longer hug contents » (même page). Côté API : « `"AUTO"` cannot be used in any axes where layoutAlign = "STRETCH" or layoutGrow = 1 » (l. 7781).
4. **Un frame ne peut pas être à la fois FILL et HUG sur le même axe** : « an auto-layout frame cannot simultaneously stretch to fill its parent and shrink to hug its children » (l. 8540).
5. **Pas de `layoutWrap` en GRID**, et pas de `counterAxisAlignContent` ni de `counterAxisSpacing` sans WRAP.
6. **`BASELINE` est réservé au mode HORIZONTAL.**
7. **Constraints interdites sur les enfants d'un auto layout**, sauf ceux en ABSOLUTE (« Ignore auto layout »). Les réglages de taille et de layout ne s'appliquent plus à ces enfants absolus.
8. **`x` et `y` d'un enfant d'auto layout ne s'écrivent pas** : l'écriture est ignorée sans erreur, car la position est calculée (l. 7299).
9. **min / max** ne valent que sur un frame en auto layout ou ses enfants directs (l. 7311).
10. **Texte** : on ne peut pas combiner max height et max lines (l'un retire l'autre). `targetAspectRatio`, le verrou de proportions, est incompatible avec un texte qui se redimensionne tout seul.
11. **Plancher de taille** : un frame ne descend jamais sous padding + contour intérieur inclus : « the frame grows to fit the padding » (https://help.figma.com/hc/en-us/articles/31289464393751).
12. **Gap Auto en débordement** : si les enfants débordent, le gap Auto tombe à 0 au lieu de devenir négatif (même page).
13. **Grille** : une piste `FLEX` est interdite si le conteneur est en HUG sur cet axe (l. 8205).

Bascules automatiques déclenchées par l'interface (DOCUMENTÉ, 360040451373) :
- **Taille saisie à la main** : redimensionner à la main ou taper une largeur ou une hauteur fait passer l'axe concerné en **FIXED**.
- **Retour à HUG** : double-cliquer sur un bord de la boîte englobante met l'axe en **HUG**.
- **Passage à FILL** :
  - Alt + double-clic sur un bord ;
  - ou redimensionner un enfant jusqu'à tout l'espace disponible du parent, ce qui le fait passer automatiquement en FILL.
- **Ajout d'un objet trop grand** : un objet plus grand que le frame ne s'y insère qu'en maintenant Ctrl.

Autres règles DOCUMENTÉES :
- **Contours et layout** (https://help.figma.com/hc/en-us/articles/31289464393751) : seuls les contours **INSIDE** comptent dans le layout, et c'est le réglage par défaut. OUTSIDE et CENTER sont peints mais n'entrent jamais dans le calcul. Ce réglage est propre à chaque frame.
- **Ordre d'empilement par défaut** : sans réglage, le **dernier** enfant est au-dessus. L'option « First on top » est purement visuelle : l'ordre du panneau Calques ne change pas.
- **WRAP vertical** : il s'appuie sur la hauteur du frame (« not a masonry layout ») et équivaut à `flex-direction: column; flex-wrap: wrap`.
- **Un seul enfant avec gap Auto** : il est aligné à gauche ou en haut (avant, il était centré).

### Correspondances Figma → CSS flexbox

Il n'existe **pas de table officielle** de la conversion CSS du Dev Mode. Ce qui est DOCUMENTÉ :
- `getCSSAsync()` renvoie « the same CSS that Figma shows in the inspect panel » (l. 6508) ;
- `strokesIncludedInLayout` équivaut à border-box ;
- `counterAxisAlignContent` AUTO équivaut à `align-content: stretch | start | center | end` ;
- une piste de grille HUG équivaut à `fit-content(100%)`, une piste FLEX à `fr` ;
- la rotation est inversée dans le Dev Mode : un objet tourné à 90° apparaît en `rotate(-90deg)` (https://help.figma.com/hc/en-us/articles/360039956914).

Les valeurs exactes émises par le Dev Mode, notamment `flex: 1 0 0`, n'ont été confirmées par **aucune** page officielle. Ce qui suit est **DÉDUIT** : c'est la forme couramment observée dans le panneau Code, à vérifier avec `getCSSAsync` sur un vrai fichier.

| Réglage Figma | CSS équivalent | Statut |
|---|---|---|
| `layoutMode` HORIZONTAL / VERTICAL | `display:flex; flex-direction: row / column` | DÉDUIT (évident) |
| `layoutMode` GRID | `display:grid` + `grid-template-*` (FIXED = px, FLEX = `fr`, HUG = `fit-content(100%)`) | DOCUMENTÉ (pistes) |
| `itemSpacing` | `gap` (`column-gap` en row, `row-gap` en column) | DÉDUIT |
| `counterAxisSpacing` (WRAP) | l'autre composante de `gap` (`row-gap` en row) ; `null` = même valeur | DÉDUIT |
| `padding*` | `padding: T R B L` | DÉDUIT |
| `primaryAxisAlignItems` MIN / CENTER / MAX | `justify-content: flex-start / center / flex-end` | DÉDUIT |
| SPACE_BETWEEN / SPACE_EVENLY / SPACE_AROUND | `justify-content: space-between / space-evenly / space-around` | DOCUMENTÉ (définitions identiques à CSS, l. 7905 et suivantes) |
| `counterAxisAlignItems` MIN / CENTER / MAX | `align-items: flex-start / center / flex-end` | DÉDUIT |
| `counterAxisAlignItems` BASELINE | `align-items: baseline` (ligne seulement) | DÉDUIT |
| `layoutWrap` WRAP | `flex-wrap: wrap` | DOCUMENTÉ (« like CSS flexbox ») |
| `counterAxisAlignContent` AUTO / SPACE_BETWEEN | `align-content: stretch` si tous les enfants sont STRETCH, sinon `flex-start / center / flex-end` ; `align-content: space-between` | DOCUMENTÉ (l. 8057) |
| Enfant FIXED (axe principal) | `width` ou `height` en px + `flex-shrink:0` | DÉDUIT : Figma ne rétrécit jamais un enfant FIXED, donc il faut empêcher le shrink de CSS |
| Enfant FIXED (contre-axe) | `width` ou `height` en px | DÉDUIT |
| Enfant FILL (axe principal) | `flex: 1 0 0` (grow 1, shrink 0, basis 0) ; ajouter `min-width:0` côté implémentation | DÉDUIT (forme du Dev Mode à vérifier) |
| Enfant FILL (contre-axe) | `align-self: stretch` (et aucune taille fixe sur cet axe) | DÉDUIT, cohérent avec `layoutAlign: STRETCH` |
| Conteneur HUG | aucune `width` / `height` (taille calculée d'après le contenu) ; pour un enfant de flex, `flex: 0 0 auto` ; hors flex, `width: fit-content` | DÉDUIT |
| Conteneur FIXED | `width` / `height` en px | DÉDUIT |
| `min/maxWidth/Height` | `min-width`, `max-width`, `min-height`, `max-height` | DÉDUIT |
| `layoutPositioning` ABSOLUTE | `position:absolute; left / top / right / bottom` selon les constraints ; le parent passe en `position:relative` | DÉDUIT |
| `strokesIncludedInLayout` true | `box-sizing:border-box` + contour en `border` (INSIDE) | DOCUMENTÉ (border-box) |
| `strokesIncludedInLayout` false, ou contour OUTSIDE / CENTER | contour hors layout : `outline` ou `box-shadow: 0 0 0 Npx` (OUTSIDE), ou `box-shadow inset` (INSIDE exclu) | DÉDUIT |
| `itemReverseZIndex` true | `z-index` décroissant sur les enfants (pas de propriété CSS directe) | DÉDUIT |
| `clipsContent` | `overflow:hidden` | DÉDUIT |
| Espacement négatif | `gap` négatif impossible en CSS : passer par des `margin` négatives sur les enfants à partir du 2e | DÉDUIT |
| Enfant caché | `display:none` (sort du flux) ; opacité 0 garde la place | DOCUMENTÉ (comportement) |

---

## 3. Contraintes en positionnement libre (DOCUMENTÉ)

- **API** : `ConstraintType = 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE'`, avec deux axes, `horizontal` et `vertical` (l. 4690).
- **Correspondance avec l'interface** : MIN = Left / Top, MAX = Right / Bottom, STRETCH = « Left and right » / « Top and bottom », CENTER, SCALE (https://help.figma.com/hc/en-us/articles/360039957734).
- **Valeur par défaut** : Top + Left.
- **SCALE** : le calque garde son pourcentage de la taille du frame (exemple de l'aide : 70 px dans 100 px donne 140 px dans 200 px).
- **Où elles s'appliquent** :
  - seulement sur les calques **dans un frame** (pas sur le canevas) ;
  - pas sur les enfants d'un auto layout, sauf les absolus ;
  - un frame en auto layout imbriqué dans un frame normal peut, lui, avoir des constraints.
- **Groupes et booléens** : ils n'ont pas de constraints. Ce sont leurs enfants qui portent les constraints, calculées par rapport au frame englobant (l. 7285).
- **Redimensionner sans appliquer les constraints** : maintenir Ctrl (Cmd sur Mac) pendant le redimensionnement. Côté API, `resizeWithoutConstraints()`.
- **Traduction CSS (DÉDUIT)** :
  - MIN = `left: x` ;
  - MAX = `right: parentW - x - w` ;
  - STRETCH = `left` + `right` sans width ;
  - CENTER = `left: calc(50% + décalage)` + `translateX(-50%)`, ou `left:50%; margin-left: …` ;
  - SCALE = `left` et `width` en %.

---

## 4. Texte (DOCUMENTÉ, typings l. 11002-11060 et 9800-10460)

### Redimensionnement automatique : `textAutoResize`
- `WIDTH_AND_HEIGHT` (« Auto width ») : le bloc s'adapte au texte dans les deux sens et ne revient à la ligne que sur Entrée.
- `HEIGHT` (« Auto height ») : largeur fixe, le texte passe à la ligne, la hauteur suit.
- `NONE` (« Fixed size ») : le texte peut déborder en hauteur.
- `TRUNCATE` est **déprécié**. Il est remplacé par `textTruncation: 'DISABLED' | 'ENDING'` + `maxLines` (≥ 1 ou null). En NONE, la troncature joue si la boîte est trop petite. En HEIGHT ou WIDTH_AND_HEIGHT, seulement avec `maxHeight` ou `maxLines`.

### Comportements de création et d'alignement
- Un simple clic crée un texte Auto width ; un cliquer-glisser crée un texte Fixed size (https://help.figma.com/hc/en-us/articles/27378154668951).
- Redimensionner à la main fait passer le texte en Fixed.
- L'alignement vertical (`textAlignVertical` TOP / CENTER / BOTTOM) **n'agit qu'en Fixed size**.
- Alignement horizontal : LEFT, CENTER, RIGHT, JUSTIFIED.

### Propriétés typographiques
- **`lineHeight`** : `{unit:'PIXELS'|'PERCENT', value}` ou `{unit:'AUTO'}`. AUTO = « the font's default line height » (interligne naturel de la police). PERCENT est un pourcentage de la taille de police (https://help.figma.com/hc/en-us/articles/360039956634).
- **`letterSpacing`** : `{unit:'PIXELS'|'PERCENT', value}`, où PERCENT est un pourcentage de la taille de police.
- **Paragraphes** : `paragraphSpacing` (px), `paragraphIndent` (px, seulement en alignement à gauche), `listSpacing`, `textWrapStyle` (AUTO / BALANCE / PRETTY, réglable **par paragraphe**), `hangingPunctuation`, `hangingList`.
- **`textCase`** : ORIGINAL, UPPER, LOWER, TITLE, SMALL_CAPS, SMALL_CAPS_FORCED. Le changement de casse n'altère pas le texte saisi (« non-destructive »).
- **`textDecoration`** : NONE, UNDERLINE, STRIKETHROUGH, plus style, épaisseur, décalage, `skipInk` et couleur.
- **`leadingTrim`** : CAP_HEIGHT ou NONE. C'est le « Vertical trim » de l'interface, affiché `leading-trim: both` dans le Dev Mode.
- **Listes** : ORDERED, UNORDERED, NONE, avec niveau de retrait.

### Styles mixtes dans un même texte
Un même calque texte peut porter plusieurs styles, par plage de caractères :
- Les propriétés renvoient `figma.mixed` quand la plage contient plusieurs valeurs.
- On lit et on écrit **par plage** avec `getRange*` / `setRange*(start, end, value)`, où `end` est exclu.
- `getStyledTextSegments([...champs])` renvoie des segments `{characters, start, end, ...}` (l. 5569, 10158).
- Propriétés réglables par caractère : fontSize, fontName, fontWeight, fontStyle, textDecoration (et ses sous-réglages), textCase, lineHeight, letterSpacing, fills, styles, hyperlien, listOptions, indentation.
- Propriétés de **paragraphe** : paragraphSpacing, paragraphIndent, textWrapStyle.
- Propriétés du **calque entier** : alignements, autoResize, troncature, leadingTrim.
- Dans le modèle CSS (DÉDUIT) : un `<p>` par paragraphe, des `<span>` pour les plages, et `line-height` au niveau des spans.

---

## 5. Remplissages, contours, effets, rayons (DOCUMENTÉ)

### Remplissages (fills)
- `fills` est une **pile** de `Paint`. Une `Paint` peut être :
  - **SOLID** : `color` RGB sans alpha, plus `opacity` séparée ;
  - **GRADIENT** : LINEAR, RADIAL, ANGULAR ou DIAMOND, avec `gradientTransform` (matrice 2×3) et `gradientStops` `{position 0..1, color RGBA}` ;
  - **IMAGE** : `scaleMode` FILL / FIT / CROP / TILE, `imageHash`, `imageTransform` (CROP), `scalingFactor` (TILE), `rotation` par pas de 90°, `filters` (exposure, contrast…) ;
  - et aussi VIDEO, PATTERN, SHADER.
- Chaque `Paint` a `visible`, `opacity` et `blendMode`.
- Pour un texte, `fills` peut être `mixed`.
- Traduction CSS (DÉDUIT) : plusieurs `background` superposés. **Attention** : le premier fill de la liste Figma est dessiné **en dessous**, alors que le premier `background` CSS est **au-dessus**. Il faut inverser l'ordre.

### Contours (strokes)
- `strokes` (une pile de `Paint`), `strokeWeight` (fractionnaire, `mixed` si les côtés diffèrent), `strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight`, `strokeLeftWeight` (frames et rectangles), `strokeAlign` CENTER / INSIDE / OUTSIDE, `dashPattern`, `strokeJoin`, `strokeCap`.
- INSIDE et OUTSIDE sont implémentés en doublant l'épaisseur puis en masquant par le remplissage (l. 8740).

### Effets
- `DROP_SHADOW` : `color` RGBA, `offset`, `radius` (flou ≥ 0), `spread`, `visible`, `blendMode`, `showShadowBehindNode`.
- `INNER_SHADOW` : mêmes champs. Pour cet effet, un spread positif **rétrécit** l'ombre.
- `LAYER_BLUR` et `BACKGROUND_BLUR`, normaux ou progressifs.
- NOISE, TEXTURE, GLASS.
- Le `spread` n'est accepté que sur rectangles, ellipses, et frames avec un remplissage visible **et** `clipsContent` activé.
- Traduction CSS (DÉDUIT) : `box-shadow` (ou `drop-shadow()` si `showShadowBehindNode` ou si la forme n'est pas rectangulaire), `filter: blur()`, `backdrop-filter: blur()`.

### Rayons d'angle
- `cornerRadius` (`mixed` si les angles diffèrent), plus `topLeftRadius`, `topRightRadius`, `bottomRightRadius`, `bottomLeftRadius`.
- `cornerSmoothing` (0 à 1 ; 0,6 donne la forme « squircle » d'iOS) : pas d'équivalent CSS natif.
- Règle de bornage : « If an edge length is less than twice the corner radius, the corner radius … will be clamped to half the edge length » (l. 9000). CSS réduit les rayons proportionnellement, avec un résultat proche mais pas identique (DÉDUIT).

### Opacité et clip
- `opacity` du calque est distincte de l'`opacity` de chaque `Paint`.
- `clipsContent` est disponible sur frames, composants et instances, pas sur les groupes.

---

## 6. Interactions documentées

### Sélection (https://help.figma.com/hc/en-us/articles/360040449873)
- **Clic** : sélectionne le **parent de plus haut niveau** (frame ou groupe).
- **Double-clic ou Entrée** : descend d'un niveau.
- **Ctrl+clic (Cmd+clic sur Mac)**, ou « deep select » : sélectionne directement l'élément le plus profond, ou le frame de premier niveau.
- **Maj+clic** : ajoute à la sélection ou retire de la sélection.
- **Clavier** : Entrée = enfants, **Maj+Entrée = parent**, **Tab / Maj+Tab = frère suivant / précédent**, Échap = désélectionner.
- **Clic droit → « Select layer »** : liste des calques sous le curseur, dans l'ordre du panneau Calques.
- **Sélection par rectangle (marquee)** :
  - un glisser sur le canevas vide prend les objets « across » lesquels on passe ;
  - avec Ctrl, le rectangle inclut les calques imbriqués ;
  - si le rectangle part d'un frame de premier niveau, il ne prend que des éléments de premier niveau ;
  - INCONNU : faut-il couvrir l'objet entièrement ou seulement le toucher ? DÉDUIT de l'usage : toucher suffit.
- **Ctrl+A** : tout sélectionner. **Ctrl+Maj+A** : inverser la sélection. **Ctrl+Alt+A** : sélectionner les objets similaires.
- **Calques verrouillés** : un clic ne les sélectionne pas, mais le menu « Select layer » le peut.

### Sélection intelligente (Smart selection, https://help.figma.com/hc/en-us/articles/360040450233)
- **Condition** : les calques sont à **égale distance** et se chevauchent sur un axe (1D) ou deux (2D). « Tidy up » crée cette condition.
- **Poignées roses** :
  - entre les calques, elles règlent l'espacement (bulle d'info en px) ;
  - un anneau au centre de chaque calque sert à **réordonner** par glisser, un indicateur bleu montre le point de dépôt ;
  - Ctrl pendant le glisser **échange** deux calques.
- **Comportements** :
  - réordonner ne modifie pas l'ordre du panneau Calques ;
  - dupliquer (Ctrl+D) ou supprimer fait se réorganiser les autres calques ;
  - Alt redimensionne depuis le centre ;
  - Maj+molette règle l'espacement par pas du « big nudge ».

### Mesures et guides
- **Mesures (Alt)** : sélectionner un calque, maintenir Alt puis survoler un autre affiche une ligne rouge et les distances H et V. **Ctrl+Alt** fait la même chose pour les éléments imbriqués (une seule mesure). Les mesures vont de **boîte englobante à boîte englobante** : contour exclu, et boîte du texte, pas sa ligne de base (https://help.figma.com/hc/en-us/articles/360039956974).
- **Magnétisme (snapping)** (https://help.figma.com/hc/en-us/articles/360039956914) :
  - « Snap to objects » aligne sur les centres et les bords extérieurs ;
  - **Ctrl maintenu désactive temporairement** le magnétisme ;
  - avec le magnétisme sur la grille de pixels, la répartition tolère 1 px d'arrondi (gaps de 20, 20, 19 affichés « 20 ») ; sans lui, des espacements comme 7,5 apparaissent.
  - La couleur et le style des guides magnétiques : INCONNU dans la doc ; à l'usage, rouge ou rose (DÉDUIT).

### Déplacement fin (nudge, https://help.figma.com/hc/en-us/articles/4404575206295)
- Flèches = 1, Maj+flèches = 10. Ces deux valeurs sont réglables dans Preferences > Nudge amount.
- L'unité est le « resolution-independent points », c'est-à-dire indépendante du niveau de zoom.
- Aucun « nudge 1/10 px » n'est documenté : le pas est **configurable**, pas fixé au dixième.
- Sans sélection, les flèches font défiler le canevas.

### Autres manipulations (360039956914)
- **Maj pendant un redimensionnement** : force les proportions.
- **Ctrl pendant un redimensionnement** : désactive le verrou de proportions s'il est actif, et ignore les constraints.
- **Alt pendant un redimensionnement** (depuis le centre) : documenté seulement dans la sélection intelligente, connu par l'usage ailleurs (DÉDUIT).
- **Rotation** :
  - Maj = pas de 15° ;
  - Ctrl+Alt+↑/↓ = 1° (Maj = 15°) ;
  - Alt+R déplace le pivot ;
  - **pivot par défaut = centre de la sélection** dans l'interface, alors que l'API fait tourner autour du coin haut-gauche.
- **Champs numériques** : ils acceptent des calculs (+, -, *, /, ^, parenthèses), et on peut écrire « Mixed+100 » sur une sélection aux valeurs différentes.

### Raccourcis principaux (Windows ; sur Mac, Ctrl devient Cmd et Alt devient Option)

| Action | Raccourci | Source |
|---|---|---|
| Ajouter un auto layout | **Maj+A** | 360040451373 |
| Retirer l'auto layout | Alt+Maj+A | idem |
| Suggérer un auto layout | Ctrl+Alt+Maj+A | idem |
| Gap Auto ↔ valeur (dans la boîte d'alignement) | X | 31289464393751 |
| Alignement par la ligne de base | B (boîte d'alignement) | idem |
| Alignement sur un bord | W / A / S / D (boîte d'alignement) | idem |
| **Frame selection** (encadrer la sélection) | **Ctrl+Alt+G** | 360041539473 |
| Dégrouper ou supprimer le frame | Ctrl+Maj+G | idem |
| Outil Frame | F ou A | idem |
| Dupliquer | Ctrl+D | 31289464393751 |
| Aligner gauche / droite / haut / bas | Alt+A / D / W / S | 360039956914 |
| Centres H / V | Alt+H / Alt+V | idem |
| Retourner (H / V) | Maj+H / Maj+V | idem |
| Zoom + / - | Maj+= / Maj+- ou Ctrl+molette ou Ctrl+= / Ctrl+- | 360041065034 |
| Tout voir / zoom sur la sélection | Maj+1 / Maj+2 | idem |
| Afficher la grille de pixels | Ctrl+' | idem |
| Magnétisme sur la grille de pixels | Ctrl+Maj+' | idem |
| Aperçu pixel (pixel preview) | Ctrl+Alt+P | idem |
| Guides de mise en page | Ctrl+Maj+4 | idem |
| Cacher / afficher un calque | Ctrl+Maj+H | 360039956974 |
| Panneau de tous les raccourcis | Ctrl+Maj+? | 360040328653 |
| Grouper / section | Ctrl+G / Ctrl+S (« wrap in section », source forum) | DÉDUIT |
| Insérer en ignorant l'auto layout | glisser + Ctrl (Mac) ; touche Windows mal rendue dans la page | 360040451373 |

Il n'existe **aucune liste officielle complète** en HTML sur l'aide : la page renvoie au panneau intégré à l'application (Ctrl+Maj+?).

### Glisser dans un auto layout (DOCUMENTÉ, 31289464393751)
- Pour **ajouter** un objet, on le glisse au-dessus du frame et un **indicateur bleu** montre où il sera inséré.
- Pour **réordonner**, on glisse, ou on utilise les **flèches**. Il faut Ctrl pour viser un enfant imbriqué. Ce n'est possible que dans un composant principal ou un auto layout hors composant.
- Pour **sortir** un objet, on le glisse hors du frame.
- Ctrl permet aussi de viser un auto layout imbriqué comme cible de dépôt.
- DÉDUIT : pendant le glisser, l'élément reste dans le flux (les autres s'écartent), puis il est retiré quand le pointeur quitte le frame.

### Zoom
- `figma.viewport.zoom` vaut 1 à 100 % (l. 3324).
- Les **limites min et max ne sont pas documentées** (INCONNU). La valeur connue par l'usage, 1 % à 25 600 %, n'a été confirmée nulle part (DÉDUIT, non vérifié).
- Les pas de zoom doublent (25 → 50 → 100 → 200 %) selon le forum, et on peut saisir une valeur libre.

---

## 7. Poignées, grille de pixels, arrondi

- **Positions fractionnaires** : DOCUMENTÉ. `x`, `y` et `width` sont des `number`, l'épaisseur de contour « can be fractional », tout comme les rayons, et la taille minimale est 0,01. L'outil Scale « can produce fractional font sizes and subpixel positions » (27378154668951). Le modèle stocke donc des décimales.
- **Magnétisme sur la grille de pixels** : DOCUMENTÉ (360041065034).
  - Il est activé par défaut (DÉDUIT de l'usage) et bascule avec Ctrl+Maj+'.
  - « Frames, sections, and components always snap to the pixel grid. »
  - Les autres calques s'accrochent aux pixels entiers quand on les déplace ou les redimensionne à la souris.
  - La grille de pixels n'est **visible qu'à partir de 400 %** de zoom.
- **Arrondi à l'affichage** : DÉDUIT. Le panneau affiche jusqu'à 2 décimales et les valeurs saisies sont conservées. La doc ne précise pas d'arrondi pour les champs X, Y, W, H (INCONNU).
- **Taille des poignées** : INCONNU, aucune doc. DÉDUIT de l'usage : les poignées, contours de sélection et étiquettes de mesure gardent une **taille constante à l'écran** quel que soit le zoom. Sur un objet minuscule, certaines poignées sont masquées, et on peut redimensionner en saisissant les bords hors des poignées.
- **Coordonnées affichées** : X et Y désignent le coin haut-gauche de la boîte, même après rotation. Ils sont relatifs au conteneur parent, pas aux groupes (typings l. 7330).

---

## Recommandations pour Maquette

1. **Reprendre le modèle de taille par axe** (FIXED / HUG / FILL) comme **source unique de vérité**, et générer le CSS à partir de lui :
   - HUG = aucune taille posée ;
   - FILL sur l'axe principal = `flex: 1 1 0; min-width:0` (ou `1 0 0` pour coller à Figma) ;
   - FILL sur le contre-axe = `align-self: stretch` ;
   - FIXED = taille en px + `flex-shrink:0`.
   Ne jamais stocker ensemble les deux formes, l'ancienne (layoutGrow / layoutAlign) et la nouvelle (sizing).
2. **Valider les combinaisons dans le modèle**, pas dans l'interface, avec les règles 1 à 13 de la section 2 :
   - HUG seulement pour un conteneur flex ou un texte ;
   - FILL seulement pour un enfant de flex ;
   - parent HUG + enfant FILL ⇒ le parent passe en FIXED automatiquement (comme Figma), plutôt qu'une erreur ;
   - wrap ⇒ ni grille ni baseline vertical.
3. **Alignement du contre-axe sur le parent seulement**, comme Figma : `align-items` du conteneur, et `align-self` uniquement pour `stretch`. Cela simplifie énormément.
4. **`x` / `y` ignorés pour les enfants de flex.** Les positions affichées sont **lues dans le DOM** (`getBoundingClientRect` converti à l'échelle du zoom). Pour sortir un enfant du flux (« absolute »), recalculer le parent comme s'il n'existait pas.
5. **Contours** :
   - INSIDE + « inclus » = `border` + `box-sizing:border-box` ;
   - INSIDE exclu = `box-shadow inset` ;
   - OUTSIDE = `box-shadow 0 0 0 Npx` ou `outline` ;
   - CENTER = une demi-épaisseur de chaque côté (`outline` avec `outline-offset:-N/2`).
   Seul INSIDE compte dans le layout, ce qui correspond exactement à `border` CSS : c'est un bon alignement.
6. **Fills** : inverser l'ordre pour `background` (le premier fill Figma est dessous). Couleur sans alpha + `opacity` de paint séparée, comme dans Figma, pour éviter les ambiguïtés.
7. **Texte** :
   - trois modes, NONE / HEIGHT / WIDTH_AND_HEIGHT, plus une troncature séparée (`-webkit-line-clamp` pour maxLines) ;
   - styles mixtes en plages `{start, end, style}` rendues en spans ;
   - le paragraphe porte paragraphSpacing (`margin-bottom` du `<p>`) ;
   - lineHeight AUTO = `normal` ;
   - letterSpacing PERCENT = `em/100`.
8. **Constraints hors auto layout** : 5 valeurs par axe, traduites en `left` / `right` / `width` / `%`. Un groupe n'a pas de constraints : ses enfants se positionnent par rapport au frame englobant, ce qui suppose des coordonnées relatives au **conteneur** et non au groupe. Plus simple encore pour Maquette : pas de vrais groupes, seulement des frames.
9. **Sélection** :
   - clic = parent de plus haut niveau, double-clic ou Entrée = descendre ;
   - Maj+Entrée = remonter, Tab / Maj+Tab = frères ;
   - Ctrl+clic = sélection profonde ;
   - Échap = désélectionner ;
   - clic droit « Choisir le calque » sous le curseur.
10. **Nudge 1 / 10** configurable, en unités de document, pas en pixels écran. Magnétisme sur la grille de pixels activé par défaut : **arrondir à l'entier les positions et tailles issues de la souris**, garder les décimales saisies au clavier. Les frames de premier niveau sont toujours sur des entiers.
11. **Mesure avec Alt** (boîte à boîte, ligne rouge) et **Ctrl maintenu pour couper le magnétisme** pendant un glisser.
12. **Raccourcis** : Maj+A (auto layout), Ctrl+Alt+G (encadrer la sélection), Alt+Maj+A (retirer l'auto layout), Ctrl+D, Alt+W/A/S/D/H/V, Maj+1/2, Ctrl+' (grille de pixels).
13. **Poignées et overlay** dans un calque HTML séparé, **non mis à l'échelle** par le zoom : coordonnées multipliées par le zoom, taille constante à l'écran. Cacher les poignées latérales sous une taille minimale à l'écran.
14. **Glisser dans un flex** : indicateur bleu d'insertion calculé d'après les centres des frères. Sortie du parent quand le pointeur quitte sa boîte. Ctrl pour forcer la cible imbriquée ou l'insertion d'un objet trop grand.
15. **Zoom** : borner à environ 2 %-25 600 % (choix produit, les valeurs Figma ne sont pas documentées). Grille de pixels affichée à partir de 400 %.
