# Maquette — spécification de conception

Date : 2026-10-16 · Statut : validée en brainstorming, à relire avant le plan d'implémentation.
Enquêtes de référence : [`docs/research/`](../../research/README.md).

## 1. But

Maquette est un éditeur de maquettes de bureau, au ressenti « Figma », pour un usage personnel.
Deux usages, par ordre d'importance égal :

- **A.** Dessiner les maquettes des sites clients, puis les convertir en pages Astro.
- **B.** Laisser Claude (via Claude Code) dessiner dans le document pendant que l'utilisateur
  retouche à la main, et voir les deux travailler sur le même document en direct.

Contrainte forte : **toute l'IA passe par l'abonnement Claude Code de l'utilisateur, jamais par
l'API facturée au token.**

Inspiration : Pen (pen.dev) pour l'expérience, Figma pour le modèle de mise en page. Aucun code de
Pen n'est repris ; les rapports d'enquête servent à comprendre leurs choix.

### Hors du but

- Ce n'est pas un produit pour d'autres utilisateurs. (Si cela change : une application tierce ne
  peut pas utiliser la connexion claude.ai de ses clients sans accord d'Anthropic ; il faudrait
  passer par des clés API.)
- Pas de collaboration à plusieurs, pas de cloud, pas de compte.
- Pas de compatibilité avec le format de Figma.

## 2. Découpage en versions

| Version | Contenu |
|---|---|
| **v1** | Canevas + panneaux + pages + 4 types d'éléments + mise en page automatique + styles nommés (couleurs, textes) + fichiers `.maquette` + serveur MCP pour Claude Code + export PNG + taste-skill (skill, panneau Direction, contrôle qualité) |
| **v2** | Export d'un cadre en page Astro + Tailwind ; panneau de chat intégré qui lance Claude Code par l'abonnement |
| **Plus tard** | Composants et instances, thèmes, versions responsive d'une page, dégradés, outil plume, rotation, règles graduées, import des fichiers `.pen` (qui sont du JSON lisible) |

La présente spec détaille la v1 et fixe les choix qui conditionnent la v2.

## 3. Choix techniques

| Sujet | Choix | Raison |
|---|---|---|
| Plateforme | Electron (dernière version stable au démarrage) | L'Agent SDK de Claude est un module Node ; il tourne directement dans le processus principal |
| Langage | TypeScript strict partout | Modèle de document riche, validation des commandes MCP |
| Interface | React | Écosystème le plus fourni pour ce type d'outil ; chaque élément du canevas s'abonne à ses seules données |
| Outillage | electron-vite | Compilation et rechargement à chaud des trois cibles (principal, preload, fenêtre) |
| État | Zustand + Immer (patchs) | Les patchs Immer donnent l'annuler/rétablir |
| Validation | Zod | Même schéma pour les fichiers, les opérations et les outils MCP |
| MCP | `@modelcontextprotocol/sdk` | Relais stdio standard |
| Tests | Vitest (noyau), Playwright pour Electron (app réelle) | |

Les versions exactes sont vérifiées avec `npm view <paquet> version` au moment de créer le
`package.json`.

**Rendu du canevas : en vrai HTML/CSS.** Chaque élément est une balise stylée ; la mise en page
automatique est le flexbox du navigateur. Pen dessine avec Skia/WebGL2 et refait la mise en page
dans un moteur JS séparé de son export HTML, d'où des écarts toile ≠ export (interlignes,
espacement des lettres, `fill_container`, contours). Ici, **la toile est le rendu final** : ce qui
est vu est ce qui sera exporté. Le prix accepté : moins fluide au-delà de quelques milliers
d'éléments visibles, ce qui dépasse l'usage visé (sites de 10 à 20 pages).

## 4. Architecture

```
┌──────────────── Processus principal (Node) ────────────────┐
│ fichiers (lecture/écriture sûre, secours, récupération)    │
│ passerelle MCP (pipe nommé + jeton)                         │
│ captures PNG (capturePage)        menus, fenêtres, réglages │
└───────────────▲─────────────────────────────▲──────────────┘
                │ IPC typé (preload)           │ pipe \\.\pipe\maquette
┌───────────────┴──────────── Fenêtre ─────┐  ┌┴──────────────────────┐
│ noyau document (TS pur)                   │  │ relais MCP (stdio)     │
│   opérations · validation · historique    │  │ lancé par Claude Code  │
│ canevas (DOM) + surcouche (SVG)           │  └────────────────────────┘
│ panneaux (calques, propriétés, Direction) │
└───────────────────────────────────────────┘
```

### Unités

1. **`core/`** — noyau document, TypeScript pur, sans React ni Electron.
   - Types du document, schémas Zod, règles de validité (§6).
   - Opérations (`créer`, `modifier`, `déplacer`, `supprimer`, `réordonner`, `styles.*`) et
     application **atomique** d'un lot d'opérations.
   - Historique : une entrée par lot, avec un libellé (« Déplacer », « Claude : créer le hero »).
   - Lecture/écriture du format et mises à niveau de version.
   - Testable seul ; réutilisé plus tard par l'export Astro.
2. **`renderer/canvas/`** — affichage du document en DOM, caméra, surcouche, interactions.
3. **`renderer/panels/`** — calques et pages, propriétés, Direction, contrôle qualité.
4. **`main/`** — fichiers, passerelle MCP, captures, menus, fenêtres, association `.maquette`.
5. **`mcp-relay/`** — petit programme stdio lancé par Claude Code, qui relaie vers l'app.
6. **`vendor/taste-skill/`** — copie non modifiée des fichiers de taste-skill utilisés (licence MIT
   conservée), mise à jour par un script.

### Le principe central

**Toute modification du document passe par le noyau, sous forme d'opérations**, quelle qu'en soit
la source : souris, clavier, panneau, Claude via MCP. Le document vit dans la fenêtre ; le
processus principal ne fait que router. Il n'existe jamais deux copies du document qui se
contredisent, et un `Ctrl+Z` annule aussi ce que Claude a fait.

## 5. Modèle de document

### Fichier

- Extension `.maquette`, contenu **JSON** lisible (indenté), encodage UTF-8.
- Images dans un dossier `assets/` à côté du fichier, nommées par empreinte SHA-256
  (`assets/3fa9….png`) pour dédoublonner. Le projet se partage en zippant le dossier.

```jsonc
{
  "format": "maquette",
  "version": 1,
  "styles": {
    "colors": [{ "id": "c1", "name": "fond", "value": "#F4F1EA" }],
    "text": [{ "id": "t1", "name": "titre", "fontFamily": "Fraunces", "fontWeight": 600,
               "fontSize": 64, "lineHeight": 68, "letterSpacing": -1.5 }]
  },
  "pages": [
    { "id": "p1", "name": "Accueil", "children": [ /* cadres de premier niveau */ ] }
  ]
}
```

- Identifiants : courts, aléatoires, uniques dans le fichier, **sans `/`** (réservé aux chemins).
- `version` entière ; chaque évolution du format ajoute une fonction de mise à niveau
  `n → n+1`, appliquée au chargement. Un fichier d'une version future est refusé avec un message.

### Éléments

Propriétés communes : `id`, `type`, `name`, `visible`, `locked`, `opacity` (0–1),
`width`/`height` (§5.3), `x`/`y` (seulement si le parent est en placement libre ou si l'élément est
`absolute`), `position` (`"flow"` par défaut, ou `"absolute"` dans un cadre automatique).

| Type | Propriétés propres |
|---|---|
| `frame` | `children`, `layout` (§5.2), `fills`, `stroke`, `radius`, `shadows`, `clip` (booléen) |
| `text` | `content` (texte brut, `\n` permis), `fontFamily`, `fontWeight`, `fontStyle`, `fontSize`, `lineHeight` (px), `letterSpacing` (px), `textAlign`, `color`, `textStyle` (référence facultative), `textSizing` (§5.4) |
| `shape` | `shape` (`"rectangle"` ou `"ellipse"`), `fills`, `stroke`, `radius` (rectangle), `shadows` |
| `image` | `src` (`assets/…`), `fit` (`cover`, `contain`, `fill`), `radius`, `stroke`, `shadows` |

Toutes les valeurs de longueur sont en **pixels**. Les couleurs sont des chaînes `#RRGGBB` ou
`#RRGGBBAA`, ou une référence `{ "style": "c1" }` à une couleur nommée.

- `fills` : pile de couleurs unies (le premier est **dessous**, comme Figma ; l'ordre est inversé
  à la génération du CSS `background`).
- `stroke` : `{ color, width, align: "inside" | "outside" | "center" }`. Les contours ne prennent
  **jamais** de place dans la mise en page (rendus en `box-shadow` / `outline`), pour que changer
  l'épaisseur d'un contour ne décale rien.
- `radius` : un nombre ou quatre (`[hg, hd, bd, bg]`).
- `shadows` : `{ x, y, blur, spread, color, inset }[]`.

### 5.2 Mise en page d'un cadre

`layout.mode` : `"free"` (enfants placés en x/y) ou `"auto"`. En mode `auto` :

| Propriété | Valeurs | CSS |
|---|---|---|
| `direction` | `row`, `column` | `flex-direction` |
| `gap` | px, ou `"auto"` (= space-between) | `gap` / `justify-content: space-between` |
| `padding` | `[haut, droite, bas, gauche]` px | `padding` |
| `justify` | `start`, `center`, `end`, `space-between`, `space-around`, `space-evenly` | `justify-content` |
| `align` | `start`, `center`, `end`, `stretch`, `baseline` (en `row` seulement) | `align-items` |
| `wrap` | booléen, + `rowGap` facultatif | `flex-wrap` |
| `reverseZ` | booléen (le premier enfant au-dessus) | `z-index` décroissant |

Par enfant d'un cadre automatique : `alignSelf` facultatif (`start`, `center`, `end`, `stretch`).

### 5.3 Tailles

Pour chaque axe, `width` et `height` valent :

- un nombre (**fixe**, en px) ;
- `{ "mode": "hug" }` — s'adapter au contenu ;
- `{ "mode": "fill" }` — remplir l'espace du parent ;

plus des bornes facultatives `minWidth`, `maxWidth`, `minHeight`, `maxHeight`.

Traduction CSS (la même pour le canevas et pour l'export) :

| Réglage | Axe principal du parent | Axe secondaire du parent |
|---|---|---|
| fixe | `width`/`height` px + `flex-shrink: 0` | `width`/`height` px |
| hug | aucune taille ; `flex: 0 0 auto` | aucune taille |
| fill | `flex: 1 1 0` + `min-width: 0` (ou `min-height`) | `align-self: stretch` |

Un cadre de premier niveau (posé sur la page) est fixe ou hug, jamais fill.

### 5.4 Texte

`textSizing` :

- `"auto"` — largeur et hauteur suivent le texte, pas de retour à la ligne ;
- `"auto-height"` — largeur fixée ou fill, retour à la ligne, hauteur qui suit ;
- `"fixed"` — boîte fixe, le texte peut déborder.

Interligne et espacement des lettres sont stockés en **px**. À la création, `lineHeight` vaut
`round(1,2 × fontSize)`. Les polices sont celles de Google Fonts ; l'app les met en cache dans
`%APPDATA%\Maquette\fonts` pour fonctionner hors connexion. `font-optical-sizing` est fixé
explicitement pour que le canevas et l'export rendent pareil.

### 5.5 Styles nommés

Version minimale des « variables » : des **couleurs nommées** et des **styles de texte nommés**
(famille, graisse, taille, interligne, espacement). Un élément y fait référence ; modifier le style
met à jour tous les éléments qui l'utilisent. Une valeur saisie à la main sur l'élément détache la
référence. Pas de thèmes en v1.

## 6. Règles de validité

**Principe : l'utilisateur, à la souris, ne rencontre jamais de refus.** Une action dont
l'intention est claire est **corrigée automatiquement**, comme le fait Figma (§6.1) ; une action
impossible n'est **pas proposée** par l'interface (choix grisé, raison au survol). Les refus ne
concernent que les demandes mal formées (fautes de frappe de Claude, types faux, références
inexistantes) et expliquent toujours quoi corriger.

Le noyau refuse un lot d'opérations qui produirait un document invalide, et renvoie le **chemin
exact** de chaque erreur (ex. `ops[3].width : "fill" impossible, le parent n'est pas en mise en
page automatique`). Les règles, reprises de Figma (`docs/research/figma-model-interactions.md`) :

1. `hug` n'est permis que pour un cadre automatique ou un texte.
2. `fill` n'est permis que pour un enfant direct (non `absolute`) d'un cadre automatique.
3. Un parent `hug` sur un axe qui reçoit un enfant `fill` sur ce même axe passe automatiquement en
   fixe (taille actuelle) sur cet axe — **correction automatique**, signalée dans le résultat.
4. Un élément ne peut pas être `fill` et `hug` sur le même axe.
5. `rowGap` n'a de sens qu'avec `wrap` ; `baseline` seulement en `row`.
6. `x`/`y` d'un enfant en flux dans un cadre automatique sont calculés : une écriture est refusée.
7. `min*`/`max*` : seulement sur un cadre automatique ou ses enfants directs ; `min ≤ max`.
8. `textSizing: "auto"` est incompatible avec une largeur fixe ou fill.
9. Un cadre ne descend jamais sous ses marges intérieures (plancher appliqué par le navigateur).
10. Un parent ne peut pas devenir son propre descendant ; un texte, une forme ou une image n'a pas
    d'enfants.
11. Les références (`style`, `src`) doivent exister ; les identifiants sont uniques.

Bascules d'interface (Figma) : redimensionner à la main ou taper une taille passe l'axe en fixe ;
double-clic sur un bord de la boîte → hug ; Alt + double-clic → fill.

### 6.1 Corrections automatiques (signalées dans `fixes`, jamais refusées)

- Règle 3 : parent `hug` + enfant `fill` sur le même axe → le parent passe en fixe.
- Texte : changer `width`/`height` sans préciser `textSizing` réaligne `textSizing` sur les
  tailles (`width` hug → `auto` et `height` hug ; `height` hug → `auto-height` ; sinon `fixed`).
- `x`/`y` fournis pour un enfant en flux d'un cadre automatique → ignorés.
- Supprimer un style nommé encore utilisé → les éléments sont **détachés** : ils gardent la
  valeur (couleur, propriétés de police) sans la référence.
- Couleurs : toute couleur CSS lisible (`white`, `#fff`, `#ffff`, `rgb(…)`, `rgba(…)`, les 148
  noms CSS) est convertie en `#RRGGBB` ou `#RRGGBBAA` majuscules.
- Changer de mode de mise en page, déplacer hors d'un cadre automatique : tailles `fill`/`hug`
  devenues impossibles figées à leur taille mesurée, positions reprises du rendu.

### 6.2 Ouverture tolérante d'un fichier

Un fichier n'est **refusé** que s'il est inutilisable : JSON invalide, autre format, version
absente ou plus récente, ou structure qu'aucune réparation ne rend valide (ex. une opacité
`"abc"`). Sinon il est **ouvert et réparé**, avec la liste des réparations affichée :
propriétés inconnues retirées, propriétés manquantes complétées par les valeurs par défaut,
couleurs converties, références de style inconnues détachées (couleur → `#FF00FF` visible),
identifiants en double renouvelés, et chaque règle du §6 ramenée à l'état valide le plus proche
(ex. `x`/`y` retirés d'un enfant en flux, `textSizing` réaligné, `rowGap` retiré sans `wrap`,
document sans page → une page vide ajoutée). Le fichier sur disque n'est modifié qu'au prochain
enregistrement.

## 7. Canevas et interactions

### Couches

1. **Monde** — la page infinie ; zoom et déplacement par une seule transformation CSS sur son
   conteneur. Les cadres de premier niveau y sont posés en x/y.
2. **Surcouche SVG** — survol, sélection, poignées, guides, distances, épingles du contrôle qualité,
   dessinée en coordonnées écran (taille constante quel que soit le zoom). **Les positions sont
   mesurées dans le DOM rendu** (`getBoundingClientRect` ramené en coordonnées du monde), jamais
   recalculées.
3. **Interface** — barre d'outils, panneaux.

Les interactions sont organisées en **machine à états** (repos, déplacement, redimensionnement,
sélection au lasso, édition de texte, création), chaque état gérant pointeur, clavier et sa part
de surcouche. La main (Espace, clic molette) passe avant l'état courant.

### Valeurs (reprises de Pen, `docs/research/pen-canvas-interactions.md`)

| Réglage | Valeur |
|---|---|
| Zoom | 2 % à 25 600 %, vers le curseur, multiplicatif (au plus ±36 % par cran) |
| Molette | défilement ×1,5, borné à 120 px par événement ; `Ctrl` + molette (et pincement) = zoom |
| `Ctrl +` / `Ctrl -` | puissances de 2 (25 %, 50 %, 100 %, 200 %…) |
| Tout voir / sélection | marge 40 px, animation 220 ms |
| Démarrage d'un glisser | 4 px écran |
| Double-clic | détecté par l'app : 300 ms, 4 px (pas l'événement `dblclick`) |
| Magnétisme | 5 px écran ; bords, centres, lignes de base du texte, du parent et des frères visibles ; **plus** les espacements égaux (absent de Pen) ; `Ctrl` le coupe |
| Poignées | carré visible 8 px, zone cliquable 15 px, bandes de bord 15 px ; masquées sous 10 px |
| Grille de pixels | visible à partir de 400 % |
| Flèches | 1 px, `Shift` 10 px |

Positions issues de la souris arrondies au pixel entier ; valeurs tapées au clavier conservées
telles quelles.

### Sélection (règles Figma)

Clic = élément de premier niveau dans le contexte courant ; double-clic ou `Entrée` = descendre ;
`Shift+Entrée` = remonter au parent ; `Tab` = frère suivant ; `Ctrl+clic` = l'élément le plus
profond ; `Shift+clic` = ajouter ; glisser dans le vide = lasso. Un enfant qui recouvre
entièrement son parent ne « vole » pas le clic du parent. `Alt` + survol = distances.

### Glisser dans un cadre automatique

Dans le même cadre : réordonnancement **en direct**, les frères s'animent (technique FLIP). Point
d'insertion = premier enfant dont le centre est au-delà du pointeur. Vers un autre cadre : trait
d'insertion, dépôt au relâchement ; on ne dépose que dans un cadre qui peut contenir l'élément.
Sortir l'élément du cadre le change de parent.

### Texte

Double-clic = édition sur place, directement dans l'élément (`contentEditable="plaintext-only"`).
Une session d'édition = une entrée d'historique. Un texte vidé est supprimé à la sortie.

### Outils et raccourcis

`V` déplacer · `F` cadre · `R` rectangle · `O` ellipse · `T` texte · image par glisser-déposer ·
`Ctrl+Alt+G` encadrer · `Shift+A` mise en page automatique · `Ctrl+D` dupliquer ·
`Ctrl+C/V` · `Ctrl+Z/Y` · `Suppr` · `Ctrl+]`/`Ctrl+[` ordre · `Ctrl+0` 100 % · `Shift+1` tout voir ·
`Shift+2` voir la sélection · `?` aide. Les raccourcis sont déclarés dans **une table** qui sert
aussi à la fenêtre d'aide.

### Historique

Une entrée par **geste** (un glisser complet, un redimensionnement, une session de texte), par
appui de flèche, et par lot MCP. Les entrées gardent un libellé lisible.

### Pièges connus (Electron)

- L'écouteur `wheel` doit être **non passif**, sinon le pincement zoome toute la fenêtre.
- Gérer la perte de capture du pointeur et la perte de focus de la fenêtre en plein geste.
- Recalculer ce qui dépend du zoom (épaisseurs, grille) 200 ms après la fin d'un mouvement.

## 8. Panneaux

**Gauche — Pages et calques.** Liste des pages (ajouter, renommer, réordonner) ; arbre des
éléments de la page (déplier, glisser pour réordonner ou changer de parent, renommer au
double-clic, masquer, verrouiller). Sélection synchronisée avec le canevas.

**Droite — Propriétés**, par sections affichées selon la sélection : position et taille (avec
fixe/hug/fill par axe, choix impossibles grisés avec la raison au survol) ; mise en page
automatique (direction, espacement, marges, grille d'alignement 3×3, retour à la ligne) ; texte
(recherche Google Fonts, taille, graisse, interligne, espacement, alignement) ; remplissage,
contour, arrondi, ombre, opacité. Champs numériques : glisser sur l'étiquette, calculs (`24*2`),
valeur « Mixte » en sélection multiple. Choix d'un style nommé ou valeur libre.

**Droite — onglet Direction** (taste-skill, §10).

## 9. Serveur MCP (Claude Code pilote Maquette)

### Branchement

- Le relais `mcp-relay` est livré avec l'app et exécuté par l'exécutable d'Electron en mode Node
  (`ELECTRON_RUN_AS_NODE=1`), donc sans dépendre d'un Node installé.
- Un bouton **« Connecter à Claude Code »** lance une fois
  `claude mcp add --scope user maquette -- <Maquette.exe> <relais>` (avec la variable d'environnement
  nécessaire). L'app n'écrit jamais d'elle-même dans les fichiers de configuration de Claude Code.
- Le relais rejoint l'app par le pipe nommé `\\.\pipe\maquette-<utilisateur>` et s'authentifie
  avec un **jeton** aléatoire stocké dans `%APPDATA%\Maquette\mcp-token` (fichier du profil
  utilisateur). Sans jeton valide, l'app refuse la connexion. Pas de port réseau.
- Si l'app n'est pas ouverte, chaque outil répond « Maquette n'est pas ouverte ».
- Le document visé est celui de la fenêtre active, ou celui désigné par son chemin.

### Outils v1

| Outil | Rôle |
|---|---|
| `lire_document` | Pages, cadres de premier niveau, styles nommés (résumé) |
| `lire_elements` | Détail d'éléments par identifiant, jusqu'à une profondeur donnée |
| `chercher` | Éléments par nom, type ou contenu de texte |
| `appliquer` | Lot d'opérations **atomique** ; identifiants temporaires `$1`, `$2`… pour créer un parent et ses enfants en un appel ; renvoie les vrais identifiants, les corrections automatiques et, en cas de refus, les erreurs avec leur chemin. Une entrée d'historique « Claude : … » |
| `capture` | PNG d'un cadre (échelle 1×, 2×) pour vérifier visuellement |
| `selection` | Ce que l'utilisateur a sélectionné |
| `verifier_gout` | Contrôle qualité taste-skill d'un cadre (§10) |

Les schémas des outils sont dérivés des schémas Zod du noyau. Pas d'outil qui exécute du
JavaScript arbitraire. Les éléments modifiés par Claude clignotent brièvement d'un contour coloré.

### Économie de tokens (exigence)

L'utilisateur a constaté que Pen consomme beaucoup de son abonnement. Causes observées dans Pen :
≈ 13 000 tokens de skill ajoutés au prompt de chaque conversation, effort `high` par défaut,
réponses d'outils volumineuses (état « riche » du document, captures jusqu'à 1568 px) qui restent
dans le contexte et sont relues à chaque tour. Maquette fait l'inverse :

- **Réponses compactes par défaut** : `lire_document` renvoie un résumé (pages, cadres de premier
  niveau, nombre d'éléments) ; `lire_elements` a une profondeur par défaut de 1 et omet les
  valeurs par défaut ; `appliquer` ne renvoie que les identifiants créés, les corrections
  (`fixes`) et les erreurs — jamais le document.
- **Captures sur demande seulement**, largeur par défaut 800 px, JPEG ; jamais renvoyées
  automatiquement après une modification.
- **Descriptions d'outils courtes** ; la documentation détaillée est dans le skill, chargé quand
  il sert (pas recopié dans le prompt système).
- **Chat intégré (v2)** : effort `medium` par défaut, réglable.
- Mesure : une session type (créer une section hero de 15 éléments, la corriger deux fois) doit
  coûter nettement moins que la même avec Pen ; le plan 4 inclut ce banc d'essai.

### v2 — chat intégré (fixé maintenant pour ne pas le bloquer)

- L'app lance Claude par l'Agent SDK (`query()`), avec l'exécutable `claude` déjà installé et
  connecté de l'utilisateur ; **`ANTHROPIC_API_KEY` et `ANTHROPIC_AUTH_TOKEN` sont retirées de
  l'environnement** transmis, et un test de connexion au démarrage du chat confirme le mode
  abonnement.
- Les mêmes outils sont fournis en processus (`createSdkMcpServer`), avec la même définition que
  le relais. Streaming, annulation, sessions reprenables.

## 10. taste-skill

taste-skill v2 (`design-taste-frontend`, licence MIT) est le système de design de l'utilisateur.
Trois niveaux d'intégration :

1. **Pour l'IA** — le skill est installé dans Claude Code (`~/.claude/skills/design-taste-frontend`,
   déjà fait). Quand Claude dessine dans Maquette, il suit sa méthode : inventaire, tirage d'une
   direction, construction, contrôle, critique.
2. **Panneau Direction** — l'utilisateur choisit un secteur ; l'app tire trois directions depuis la
   `library/` de taste-skill (même logique que `draw.mjs`, exécutée sur les fichiers de
   `vendor/`). Pour chacune : idée, polices, palette, modèles de hero et de sections. **Appliquer**
   crée les styles nommés du document (couleurs, styles de texte).
3. **Contrôle qualité** — bouton **Vérifier** sur un cadre : le cadre est rendu dans une fenêtre
   cachée à sa largeur, la sonde et les règles de taste-skill (`scripts/lib/probe.mjs`,
   `rules.mjs`) y sont exécutées, et les fautes sont épinglées sur les éléments concernés, avec une
   liste cliquable. Même mécanisme pour l'outil MCP `verifier_gout`.

Les fichiers repris sont copiés tels quels dans `vendor/taste-skill/` avec leur licence ; un
script de mise à jour les recopie depuis le dépôt d'origine et indique la version.

## 11. Fichiers

- **Écriture sûre** : fichier temporaire puis renommage ; nouvelles tentatives si un antivirus
  verrouille le fichier.
- **Copie de secours** toutes les 5 s en cas de changements, dans `%APPDATA%\Maquette\backup`.
  Le fichier de l'utilisateur n'est modifié qu'à l'enregistrement.
- **Récupération** : au démarrage, si une copie de secours est plus récente que le fichier,
  proposition de restaurer.
- **Modification extérieure** détectée (surveillance du fichier) : avertissement et proposition de
  recharger.
- Fichiers récents ; association de l'extension `.maquette` à l'app dans Windows.
- Images importées copiées dans `assets/` (empreinte SHA-256).

## 12. Export PNG

Capture du vrai rendu HTML d'un cadre, échelle 1×, 2× ou 3×, par la capture intégrée d'Electron.
Même mécanisme que l'outil `capture`.

## 13. Erreurs

- Fichier invalide ou d'une version future : message précis (chemin, raison), fichier intact.
- Image ou police introuvable : alerte sur l'élément, police de secours **visible** (jamais un
  remplacement silencieux).
- Lot MCP refusé : rien n'est appliqué, erreurs détaillées renvoyées à Claude.
- Plantage de la fenêtre : rechargement et reprise depuis la copie de secours.

## 14. Tests

- **Noyau (Vitest)** : chaque opération ; annuler/rétablir ; atomicité des lots ; chacune des
  règles de validité du §6 et les corrections automatiques ; lecture/écriture et mises à niveau du
  format ; traduction tailles → CSS (§5.3).
- **App réelle (Playwright pour Electron)** : scénarios — créer un cadre, passer en mise en page
  automatique, ajouter des enfants, glisser pour réordonner, annuler, enregistrer, rouvrir ;
  zoom/déplacement ; édition de texte.
- **MCP** : un client de test appelle chaque outil sur l'app lancée (lot valide, lot refusé,
  capture, jeton absent ou faux).
- Pas de comparaison au pixel systématique : seulement les scénarios importants.

## 15. Risques et points ouverts

- **Règles taste-skill sur un cadre isolé** : elles sont pensées pour des pages complètes
  (et taste-skill se déclare inadapté aux écrans d'application). Certaines règles pourront être
  désactivées pour un cadre qui n'est pas une page entière ; à trancher à l'implémentation du
  niveau 3.
- **Performance du DOM** : à mesurer tôt avec une page lourde (≈ 2 000 éléments) ; si besoin,
  ne pas rendre les cadres hors de l'écran.
- **Polices Google hors connexion** : la première utilisation d'une police demande internet.
- **Table tailles → CSS** : déduite (Figma ne la documente pas) ; validée par nos propres tests.
