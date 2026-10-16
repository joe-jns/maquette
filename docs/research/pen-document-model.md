# Pen (pen.dev 1.2.16) — modèle de document et mise en page

Enquête en lecture seule sur l'app.asar extrait (`out/`). Sources : `skills/pen-dev/pen-schema.md`,
`SKILL.md`, `execute.md`, `guide/*.md`, et le bundle minifié `editor/assets/index.js`.
Légende : **OBSERVÉ** = lu dans la doc ou le code ; **DÉDUIT** = conclusion raisonnable tirée
de ce qui est observé ; **INCONNU** = pas tranché.

Les noms de fonctions minifiées (`Pse`, `Nse`, `F$e`…) sont cités pour qu'on puisse les
retrouver, pas pour être réutilisés.

---

## 0. Vue d'ensemble (le point le plus important)

- **OBSERVÉ — la toile n'est PAS du HTML.** Elle est dessinée par Skia compilé en wasm
  (`pencil-Br_J6WLw.wasm`, 9,5 Mo, fonctions exposées `_pencil_text_style_set_letter_spacing`,
  etc. ; `t.skiaRenderer`, `renderSkia(...)`, `xe.ParagraphBuilder.MakeFromFontCollection`).
  Le texte est mis en forme par **SkParagraph** puis converti en **tracé vectoriel**
  (`getParagraph(e).getPath()`), pas en texte DOM.
- **OBSERVÉ — la mise en page est un moteur maison en JavaScript**, pas Yoga, pas Taffy,
  pas le wasm (zéro occurrence de `yoga`/`YGNode`/`taffy` ; le moteur tient en ~40 lignes,
  voir §4).
- **OBSERVÉ — l'export HTML est un TROISIÈME chemin de code** (`exportCode(e)`, `dZt`, `WI`,
  `xZt`…) qui traduit les propriétés en CSS flexbox. Il n'exécute pas le moteur de la toile :
  le navigateur refait sa propre mise en page.
- **DÉDUIT — c'est la cause racine de tous les écarts toile ↔ export** : deux moteurs de
  mise en page (JS maison / flexbox navigateur) et deux moteurs de texte (SkParagraph /
  moteur de texte de Chromium) qui ne partagent que les valeurs d'entrée.

---

## 1. Types de nœuds, tailles, mise en page

### 1.1 Types (OBSERVÉ, `pen-schema.md`)

`Child = Frame | Group | Rectangle | Ellipse | Path | Polygon | Text | Note | Prompt | Context | Icon | Script | Browser | Ref`

| Type | Rôle | Particularités |
|---|---|---|
| `frame` | conteneur + mise en page | seul porteur de `layout`, `gap`, `padding`, `justifyContent`, `alignItems`, `clip`, `slot`, `placeholder` |
| `group` | regroupement sans layout | pas de taille propre, effets seulement |
| `rectangle` | forme | `cornerRadius` (1 ou 4 valeurs) |
| `ellipse` | forme | `innerRadius` (anneau), `startAngle`, `sweepAngle` (arcs) |
| `polygon` | forme | `polygonCount`, `cornerRadius` |
| `path` | vecteur | `geometry` (chemin SVG), `viewBox`, `fillRule` |
| `text` | texte | voir §2 |
| `icon` | icône de bibliothèque | `library` (lucide, feather, Material Symbols…, phosphor), `icon`, `weight` |
| `ref` | instance de composant | `ref`, `descendants` (voir §5) |
| `note` / `prompt` / `context` | annotations pour l'IA, sur la toile | `content` + style de texte |
| `script` | génère des enfants depuis un fichier JS | `scriptUri`, `inputs` |
| `browser` | page web vivante sur la toile | `url`, `deviceId`, `zoom`, `scroll*` |

- **OBSERVÉ — il n'y a PAS de nœud image** : « There is NO `image` node type. Images are
  applied as FILLS to existing nodes » (`execute.md`). Une image = un `fill` de type `image`
  sur un frame/rectangle, avec `mode: cover|contain|stretch` et une matrice de recadrage.
- **OBSERVÉ — propriétés communes (`Entity`)** : `id`, `name`, `context`, `reusable`, `theme`,
  `enabled` (visible), `opacity`, `flipX/flipY`, `rotation` (degrés, sens anti-horaire, autour du
  coin haut-gauche), `layoutPosition: auto|absolute`, `metadata`, `x`, `y`.

### 1.2 Tailles (OBSERVÉ)

```ts
width?:  number | "$variable" | SizingBehavior
height?: number | "$variable" | SizingBehavior
// SizingBehavior = "fit_content" | "fill_container", avec repli optionnel : "fit_content(100)"
```

- Trois modes : **fixe** (nombre), **`fit_content`** (épouse les enfants, exige un `layout` sur
  le nœud), **`fill_container`** (prend la place du parent, exige un `layout` sur le parent).
- La valeur entre parenthèses est un **repli** utilisé quand le mode n'a pas de sens (pas
  d'enfants, pas de parent en layout, position absolue).
- **Aucune unité relative** : « `width` and `height` do not support percentage or viewport CSS
  values » (`SKILL.md`).
- **Pas de min/max** (pas de `minWidth`, `maxWidth`) dans le schéma.
- En interne (OBSERVÉ) : `horizontalSizing`/`verticalSizing` ∈ `Fixed=0, FitContent=2, FillContainer=3`,
  et la taille **calculée** est réécrite dans `width`/`height` (`layoutCommitSize` →
  `this._properties.width = n`). Le fichier garde le mode ; le nœud vivant garde aussi le nombre.

### 1.3 Auto-layout (OBSERVÉ)

```ts
layout?: "none" | "vertical" | "horizontal"   // défaut frame : horizontal
gap?: number | $var
padding?: n | [vert, horiz] | [top, right, bottom, left]
justifyContent?: "start" | "center" | "end" | "space_between" | "space_around"
alignItems?: "start" | "center" | "end"
layoutIncludeStroke?: boolean                   // défaut false
```

- **Un seul axe, pas de wrap** : « Flexbox layout is single-axis only with no item wrapping.
  For grid-like layouts, manually create separate row frames » (`SKILL.md`).
- **Pas de `stretch`** dans `alignItems` : on étire un enfant avec `fill_container` sur l'axe
  secondaire.
- **Pas d'`align-self`, pas de `flex-grow` pondéré, pas d'`order`, pas de marges.** Pour décaler
  un seul enfant : « wrap it in a flexbox frame with padding ».
- `padding` et `layout` n'existent que sur `frame` (pas de padding sur un texte).
- **Défauts frame** : `layout=horizontal, width=fit_content, height=fit_content, clip=false`.

### 1.4 Positionnement libre

- `x`/`y` relatifs au parent, **ignorés** quand le parent a un layout (`SKILL.md` : « x and y
  properties are completely ignored when the node is in layout »).
- `layout: "none"` sur le parent = enfants positionnés en absolu.
- `layoutPosition: "absolute"` sur un enfant = il sort du flux du parent (comme un
  `position:absolute`), garde `x/y`.
- **Pas de contraintes** à la Figma (pas de « pin left/right », « scale ») : OBSERVÉ, aucune
  propriété `constraints` dans le schéma. Seule exception (DÉDUIT) : un nœud **`group`** qui
  change de taille redimensionne ses enfants **proportionnellement** (`layoutCommitSize` du
  groupe multiplie positions et tailles des enfants par le ratio).

---

## 2. Texte

### 2.1 Données (OBSERVÉ, `pen-schema.md`)

```ts
fontFamily, fontSize, fontWeight (chaîne : "400", "bold"…), fontStyle, letterSpacing (px),
lineHeight  /** Multiplier of fontSize. Defaults to font's built-in. */,
textAlign: left|center|right|justify, textAlignVertical: top|middle|bottom,
underline, strikethrough, href, content,
textGrowth: "auto" | "fixed-width" | "fixed-width-height"
```

- **Interligne = ratio** de la taille (1.5 = 150 %). **`0` ou absent = « auto »** (métriques
  de la police). OBSERVÉ dans le code : `lineHeight !== 0 ? Math.round(lineHeight * fontSize) : undefined`.
- **`letterSpacing` en pixels absolus.** À l'import Figma, les pourcentages sont convertis
  (`value/100 * fontSize`).
- **Pas de texte riche** : un seul style par nœud texte (pas de « spans » mélangés). OBSERVÉ :
  aucune structure de plages dans le schéma.
- **Auto-largeur / auto-hauteur = `textGrowth`** :
  - `auto` : largeur et hauteur dérivées du contenu, **jamais de retour à la ligne** ;
    `width/height` ignorés.
  - `fixed-width` : largeur imposée (nombre ou `fill_container`), retour à la ligne, hauteur
    calculée.
  - `fixed-width-height` : boîte fixe, le texte peut déborder ; `textAlignVertical` n'agit qu'ici.
- **Défauts** (OBSERVÉ) : `fontSize:14, fontFamily:"Inter", fontWeight:"400", letterSpacing:0,
  lineHeight:0, textGrowth:"auto", textAlign:"left", textAlignVertical:"top"`.

### 2.2 Polices (OBSERVÉ)

- Index intégré = **catalogue Google Fonts complet** embarqué dans le bundle (`pQt=[{name:"ABeeZee",styles:[{url:"https://fonts.gstatic.com/…ttf",weight:400}…`), avec axes variables.
- **Polices du document** : racine `fonts: [{name, url, style, weight, axes}]` → bibliothèque
  prioritaire (`documentFontLibrary.matchFont` avant `builtInFontLibrary`).
- Choix de la graisse = **la plus proche** dans les styles disponibles (`Math.abs(weight - n)`).
- **Repli = Noto Sans** (`dQt=[{name:"Noto Sans",…}]`) pour les glyphes manquants ou une
  police non trouvée/pas encore chargée.
- Fontes variables : seuls les axes **`wght` et `slnt`** sont réglés
  (`fontVariations:[{axis:"wght"…},{axis:"slnt"…}]`). **Aucun réglage `opsz`.**

---

## 3. Remplissages, contours, effets

### 3.1 Fills (OBSERVÉ)

`fill` = une valeur ou un **tableau** (empilement) de :
- couleur hex `#RGB/#RRGGBB/#RRGGBBAA` ou `$variable` (forme courte), ou `{type:"color", color, enabled, blendMode}` — « Fill opacity can only be set via the hex alpha channel » ;
- `gradient` : `gradientType: linear|radial|angular`, `center` et `size` **normalisés à la
  boîte** (0..1), `rotation` en degrés (0° = haut, sens anti-horaire), `colors:[{color, position}]`, `opacity` ;
- `image` : `url` relative au .pen, `mode: cover|contain|stretch`, `transform` (matrice affine de recadrage), `opacity` ;
- `shader` (GLSL WebGL 1) et `mesh_gradient` (grille de Bézier).

Chaque entrée a `enabled` et `blendMode` (18 modes).

### 3.2 Contours (OBSERVÉ)

```ts
stroke?: Fills            // le contour est lui-même une pile de fills
strokeWidth?: n | {top,right,bottom,left}
strokeAlignment?: "inner" | "center" | "outer"
strokeLinecap, strokeLinejoin
```
- **Le contour ne pousse pas la mise en page** par défaut (`layoutIncludeStroke=false`) : la
  boîte du nœud est la boîte géométrique, le trait est peint par-dessus.
- Pas de pointillés (`dash`) dans le schéma.

### 3.3 Effets (OBSERVÉ)

`effect` = un ou un tableau de :
- `{type:"shadow", shadowType: inner|outer, offset:{x,y}, blur, color, blendMode}` — **pas de
  `spread`** ;
- `{type:"blur", radius}` (flou du calque), `{type:"background_blur", radius}` ;
- `{type:"shader", url, uniforms}`.

### 3.4 Rayons, opacité

- `cornerRadius` : nombre ou `[tl, tr, br, bl]`. Pas de lissage type « squircle ».
- `opacity` au niveau du nœud ; l'opacité d'une couleur passe par l'alpha hex.
- Toute propriété numérique / couleur / booléenne / chaîne peut être un **`$variable`**.

---

## 4. Le moteur de mise en page (OBSERVÉ dans `index.js`)

Moteur maison, en JS, **cinq passes** déclenchées sur l'arbre « sale » :

```
B$e(root): Pse(root, X); Nse(root, X); Pse(root, Y); Nse(root, Y); F$e(root)
```

1. **`Pse(t, axe)` — fit_content, du bas vers le haut.** Récursion d'abord sur les enfants,
   puis si le nœud est en `FitContent` : somme des tailles externes des enfants sur l'axe
   principal (+ `gap × (n−1)`) ou maximum sur l'axe secondaire, + padding. **Les enfants en
   `fill_container` sont ignorés** ; s'il n'en reste aucun, la taille ne bouge pas (= repli).
2. **`Nse(t, axe)` — fill_container, du haut vers le bas.** Sur l'axe principal : espace
   intérieur − tailles des enfants fixes − gaps, **divisé à parts strictement égales** entre
   les enfants `fill_container` (`On(n[e], i)`), plancher `Math.max(1, r)`. Sur l'axe
   secondaire : chaque enfant `fill_container` reçoit toute la taille intérieure.
3. Même chose pour l'axe Y. **Ordre X puis Y** : la largeur est fixée avant la hauteur, ce qui
   permet au texte `fixed-width` de reflower (`layoutCommitSize` sur l'axe horizontal met
   `dirtyParagraphLayout = true`) avant le calcul des hauteurs.
4. **`F$e(t)` — positionnement.** Curseur au padding gauche/haut ; `justifyContent` :
   `end` = décale de l'espace libre, `center` = moitié, `space_between` = `gap` remplacé par
   `libre/(n−1)`, `space_around` = `libre/n` avec demi-marge en tête. `alignItems` décale sur
   l'axe secondaire. Les enfants `absolute` ou masqués (`affectsLayout()` faux) sont ignorés.
5. Taille « externe » d'un enfant = **boîte englobante transformée** (`getTransformedLocalBounds`)
   → une rotation agrandit la place occupée.

Propriétés notables (OBSERVÉ / DÉDUIT) :
- **Pas de contrainte de contenu minimum** : contrairement à CSS (`min-width:auto`), un enfant
  `fill_container` n'est jamais élargi par son contenu ni par son padding ; un texte peut
  déborder.
- **Pas de rétroaction** : un seul passage par axe, pas d'itération jusqu'à stabilité.
- Une dépendance circulaire (parent `fit_content`, tous les enfants `fill_container`) est
  documentée comme interdite ; le moteur garde simplement l'ancienne taille.
- `hasFixedSize()` sert à l'export : un `fit_content` dont tous les enfants sont
  `fill_container` est traité comme fixe.

Texte dans le layout (OBSERVÉ) : la boîte d'un texte = `ceil(maxWidth)` × `ceil(hauteur)`
(arrondi au pixel **supérieur**) ; en `fixed-width`, reflow à `Math.ceil(width)`.

---

## 5. Composants, instances, overrides, variables, thèmes

### 5.1 Composants (OBSERVÉ)

- **N'importe quel nœud** devient composant avec `reusable: true`. Pas de type « component » séparé.
- Instance = nœud `{type:"ref", ref:"<id du composant>", ...overrides de la racine, descendants:{...}}`.
- `descendants` : clé = **chemin d'ids** dans le composant (`"childId"`, ou
  `"instanceImbriquée/childId"` pour les instances imbriquées), ou **nom unique**.
  - sans `type` → **surcharge de propriétés** ;
  - avec `type` → **remplacement complet** du sous-arbre.
- On ne peut pas supprimer un descendant d'instance : on le masque (`enabled:false`).
- **Slots** : un `frame` marqué `slot: [ids de composants recommandés]` est une zone où l'on
  insère des enfants dans l'instance (`Insert(instanceId + "/slotId", ...)`).
- `placeholder: true` : marque un cadre « en construction » (utilisé par l'agent).

### 5.2 Mécanique interne (OBSERVÉ)

- L'instance est un **vrai sous-arbre cloné** rattaché à son prototype :
  `_prototype = { node, overriddenProperties: Set<nom>, childrenOverridden: bool }`.
- Quand le composant change, `onPropertyAssigned` notifie chaque instance
  (`prototypePropertyChanged`) ; seules les propriétés **absentes** du `Set` d'overrides sont
  recopiées. Toute écriture sur une instance ajoute la propriété au `Set` (override par
  propriété, granularité fine).
- `childrenOverridden` = la liste d'enfants de l'instance a divergé (slot rempli, remplacement).

### 5.3 Variables et thèmes (OBSERVÉ)

```ts
themes?: { [axe]: string[] }          // ex. { mode: ["light","dark"], device: ["phone","desktop"] }
variables?: { [nom]: { type: "color"|"number"|"string"|"boolean",
                       value: V | { value: V, theme?: {axe: valeur} }[] } }
```
- Référence par `"$nom"` dans n'importe quelle propriété compatible.
- **Thèmes multi-axes** ; un nœud porte `theme: {mode:"dark"}` et le thème **se propage aux
  descendants** (`inheritedTheme` ← `effectiveTheme` du parent).
- `imports: { alias: "./autre.pen" }` : bibliothèques partagées entre fichiers.

---

## 6. Identifiants, pages, racine

- **Racine** (OBSERVÉ, validateur) : clés autorisées `version, fileToken, fonts, themes,
  imports, variables, children`. `version: "2.21"`, avec une **chaîne de migrations** version
  par version (`2.10 → 2.11 → … → 2.21`, ex. renommage `icon_font` → `icon`).
- **Pas de pages** : une seule toile infinie ; les écrans sont des frames de premier niveau
  positionnés en `x/y` (`FindEmptySpace` pour en placer un sans chevauchement).
- **Ids** : chaînes courtes aléatoires (ex. `"Xk9f2"`), **sans `/`** car `/` sert de
  séparateur de chemin d'instance. Toujours générés par Pen (« Never set `id` »). Copier = nouveaux ids pour tout le sous-arbre.
- `name` = nom de calque humain, distinct de l'id.
- Le `.pen` est **chiffré** sur disque (instruction du serveur MCP : « .pen files are
  encrypted ») ; `fileToken` à la racine y est probablement lié (DÉDUIT).
- DÉDUIT : **deux modèles** coexistent — le format fichier (noms « jolis » : `layout`, `gap`,
  `fill`, `effect.blur`) et le modèle vivant (`layoutMode`, `layoutChildSpacing`, `fills[]`,
  `effects[].radius`, `horizontalSizing`) avec un sérialiseur entre les deux (`q_` pour les effets).

---

## 7. Écarts toile ↔ export HTML : explications

| Écart constaté | Toile (Skia) | Export HTML | Statut |
|---|---|---|---|
| Interligne « auto » | strut SkParagraph forcé, métriques de la police, `halfLeading:true` | `line-height: normal` (règles du navigateur) | OBSERVÉ (code) ; écarts de 1–3 px/ligne attendus |
| Interligne déclaré | `Math.round(ratio × taille)` px, strut **forcé** (toutes les lignes identiques) | `Math.round(ratio × taille)` px | OBSERVÉ : mêmes valeurs, mais le strut forcé ignore les glyphes plus hauts, le CSS non |
| `letterSpacing` | passé à Skia, **et le texte est décalé de −letterSpacing/2** (`getParagraphPosition` : `r=[-1*letterSpacing/2,0]`) | `letter-spacing: Npx` ajouté après chaque caractère | OBSERVÉ ; décalage d'un demi-tracking + chasse finale différente |
| Ligatures sous tracking | SkParagraph les garde | Chromium les coupe dès qu'un `letter-spacing` est posé | OBSERVÉ côté mémoire utilisateur ; cohérent |
| Axe optique (`opsz`) | jamais réglé → valeur par défaut de la police | navigateur : `font-optical-sizing:auto` | OBSERVÉ (`fontVariations` = `wght`,`slnt` seulement). Fait révélateur : l'éditeur de texte en place de Pen pose lui-même `fontOpticalSizing="none"` pour coller à la toile |
| Police absente | repli **Noto Sans** | pile `"Police", system-ui, sans-serif` | OBSERVÉ |
| `fill_container` | parts **strictement égales**, sans plancher de contenu | `flex: 1 1 0` (si axe principal) sinon `width:100%` ; CSS garde `min-width:auto` et le padding | OBSERVÉ (`WI`) |
| `fit_content` | somme calculée | `fit-content` ou px figés si `hasFixedSize` | OBSERVÉ |
| Contour `inner` | peint à l'intérieur, **n'occupe pas de place** | `border` → occupe de la place dans la boîte CSS | OBSERVÉ (`sSe`/`gZt`) ; `center/outer` → `outline` ou marges négatives |
| Dégradés | direction appliquée dans le carré unité puis étirée à la boîte | angle CSS sans correction du rapport L/H | DÉDUIT du schéma (« Normalized to bbox ») + mémoire utilisateur |
| Ombres | `blur` → sigma = blur/2 | `box-shadow … blur` (aller-retour `pd(r)*2`) | OBSERVÉ ; équivalent |
| Texte `auto` | aucun retour à la ligne | `white-space: nowrap` | OBSERVÉ ; cohérent |
| Arrondis | boîtes texte arrondies au px **supérieur** (`ceil`) ; positions décimales | valeurs arrondies à 3 décimales (`Gr`) | OBSERVÉ |

**Le cas « letterSpacing appliqué aux nœuds Inter mais pas aux nœuds Switzer » : INCONNU.**
Dans le code, le `letterSpacing` est passé à SkParagraph sans condition sur la police. Pistes :
(a) Switzer n'est pas dans l'index Google Fonts ; si elle n'était pas déclarée dans `fonts`
du document, la toile a pu dessiner en **Noto Sans** (repli), et l'écart mesuré mélange alors
chasse de police et tracking ; (b) comportement propre à SkParagraph sur certaines fontes
(chemin de mise en forme différent). À vérifier en lisant `fonts` à la racine du fichier en
question. L'explication générale, elle, est OBSERVÉE : deux moteurs de texte distincts.

---

## Recommandations pour Maquette

### Idées à reprendre

1. **Trois modes de taille par axe** (`fixe | fit | fill`) avec **repli** explicite
   (`fit(100)`). C'est simple, ça couvre 95 % des cas, et ça se traduit 1:1 en flexbox.
2. **`textGrowth` à trois états** (auto / largeur fixe / boîte fixe) plutôt que des cases
   « auto-largeur / auto-hauteur » séparées : impossible de créer un état incohérent.
3. **Interligne en ratio** dans le modèle (avec « auto » = absent), **tracking en px**.
4. **Pile de fills** (couleur / dégradé / image) au lieu d'un nœud image dédié, et un contour
   qui est lui-même une pile de fills.
5. **Composant = n'importe quel nœud `reusable`**, instance = `ref` + `descendants` indexés par
   **chemin d'ids**, override **par propriété** (Set des propriétés surchargées), remplacement
   de sous-arbre quand `type` est présent, slots déclarés. Modèle clair et sérialisable.
6. **Variables typées + thèmes multi-axes** hérités dans l'arbre, référencées par `$nom`
   partout. Se mappe directement sur des custom properties CSS.
7. **Ids courts aléatoires sans `/`** + `name` séparé ; chemin `instance/enfant`.
8. **`version` + chaîne de migrations** dès la v1 du format.
9. **Un validateur de schéma** qui renvoie des chemins d'erreur précis (`/children/3/width`) :
   Pen s'en sert pour son API agent, utile aussi pour nous.

### À faire différemment

1. **Une seule vérité de rendu.** Pen dessine en Skia et exporte en CSS : deux moteurs, des
   écarts partout. Maquette rend la toile **en vrai HTML/CSS** : l'export doit être **le même
   DOM** que la toile (sérialisé), jamais une re-traduction. Aucun calcul de layout en JS :
   on laisse le navigateur faire, on **lit** les boîtes (`getBoundingClientRect`) pour la
   sélection et les poignées.
2. **Définir la sémantique dans les termes de CSS**, puisque c'est notre moteur :
   - `fill` = `flex: 1 1 0` **+ `min-width: 0` / `min-height: 0`** (sinon le padding et le
     contenu cassent le partage égal) ; sur l'axe secondaire `align-self: stretch` ;
   - `fit` = taille auto (`fit-content` / pas de `flex-grow`) ;
   - contours **sans encombrement** par défaut → `box-shadow: inset` (inner) ou `outline`
     (center/outer), pas `border` ; option « inclure le contour » = `border` + `box-sizing`.
3. **Interligne : stocker le ratio, émettre le ratio** (`line-height: 1.5`) ou figer en px de
   façon explicite et identique partout. Ne pas utiliser « auto » = `normal` sans le dire :
   afficher dans l'inspecteur la valeur résolue.
4. **Polices** : déclarer chaque police utilisée dans le document (url + graisses + axes), pas
   de repli silencieux ; avertir quand une police manque. Régler `font-optical-sizing` de façon
   explicite et le stocker si l'on veut un `opsz` figé.
5. **Combler les trous du modèle Pen** que flexbox donne gratuitement : `wrap` (avec
   `row-gap`), `align-self`, `min/max` largeur/hauteur, `stretch`, et le texte riche (plages de
   style) si besoin. Pen les exclut parce que son moteur maison ne les gère pas ; nous n'avons
   pas cette contrainte.
6. **Dégradés** : stocker l'angle CSS directement (sémantique CSS), pas un carré normalisé
   étiré, pour éviter la conversion faussée selon le format.
7. **Ombres** : ajouter `spread` (CSS le supporte, Pen non).
8. **Pages** : Pen n'en a pas (toile infinie) ; si on veut des pages, les mettre au niveau
   racine du format dès le départ.
