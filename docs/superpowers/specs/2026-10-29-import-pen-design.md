# Ouvrir les fichiers .pen — vecteurs, effets, composants, import

Validé par l'utilisateur le 2026-10-29 (« Ajoute tout », puis « fait les 3 étapes »). Trois étapes livrées
l'une après l'autre, chacune testée et fusionnée dans `main` avant la suivante.

Référence du format Pen : `docs/research/pen-document-model.md` (lire en entier avant l'étape 3).
Relevé sur les 31 fichiers .pen de l'utilisateur (46 000 calques) : frame 19 000, text 15 300,
icon 4 070 (lucide 3 800, phosphor 240, Material Symbols 24, feather 3), rectangle 3 400, path 3 300,
ellipse 690, ref 650 (143 nœuds `reusable`), note/prompt 12, group 2, line 1. Remplissages : variable
22 400, hex 9 600, gradient 760, image 390, shader 3. Effets : ombre externe 500, flou d'arrière-plan 34,
flou 4. 22 fichiers ont des `variables`, 2 des `themes`. Versions 2.6, 2.17, 2.19.

## Règles qui valent pour tout le chantier

- Le fichier .pen n'est **jamais** écrit, déplacé ni renommé : lecture seule.
- Interface en anglais, commentaires et messages de commit en français, un commit par changement,
  pas de ligne Co-Authored-By, jamais de push.
- Budget des définitions d'outils MCP : `tests/mcp/tokenBench.test.ts` (< 8000 caractères) doit rester vert.
- Tests GUI hors écran, jamais de focus, une suite e2e à la fois.

## Étape 1 — Ce qui manque au modèle

1. **Calque `vector`** : `{ type:'vector', path: string /* « d » SVG */, viewBox:[x,y,w,h], fillRule:'nonzero'|'evenodd',
   fills: Fill[], stroke?: Stroke, shadows, blur? }` + `BaseNode`. Rendu en SVG inline étiré dans sa boîte
   (`preserveAspectRatio="none"`), contour non mis à l'échelle (`vector-effect: non-scaling-stroke`).
   Déplacer, redimensionner, couleur, contour ; pas d'édition des points. Icône propre dans les calques.
2. **Remplissage image** : `Fill` gagne `{ type:'image', src, fit:'cover'|'contain'|'fill' }` pour cadres,
   formes, vecteurs exclus (couleur/dégradé seulement pour les vecteurs). `src` suit les règles des images
   existantes (`assets/…`, assets en attente pour un document jamais enregistré). Rangée « Image » dans le
   panneau Fill avec choix du fichier et du mode.
3. **Flous** : `blur?: number` (flou du calque, `filter: blur()`) et `backgroundBlur?: number`
   (`backdrop-filter: blur()`) sur cadre, forme, image, vecteur. Section « Effects » du panneau de droite
   (avec les ombres si c'est là qu'elles sont).
4. **Dégradé conique** : `{ type:'conic', angle, stops }` (`conic-gradient(from <angle>deg, …)`), dans le
   sélecteur de dégradé.
5. Schéma, règles, réparation (`repair.ts`), sérialisation, export PNG, rendu chat/MCP (`lire_elements`),
   outils de Claude (création/modification de ces propriétés) et description des outils mis à jour.

## Étape 1 bis — Jeux d'icônes Phosphor, Feather, Material Symbols Rounded

Demandé par l'utilisateur le 2026-10-29. Ses .pen utilisent 115 icônes hors Lucide (Phosphor en graisses
400/500/600/700 et sans graisse, Feather `clock`, Material Symbols Rounded `grass`, `content_cut`, `yard`,
`forest`, `compost`, `inventory_2`).
- `IconNode.set` : `'lucide' | 'phosphor' | 'feather' | 'material-rounded'`, plus `weight?` pour les jeux qui
  en ont (Phosphor : thin/light/regular/bold/fill/duotone ; Material : graisse et plein/contour). Les
  graisses numériques de Pen (100–700) sont converties vers la variante la plus proche.
- Tracés réels des paquets officiels (vérifier la dernière version avec `npm view` : @phosphor-icons/core,
  feather-icons, @material-symbols/svg-*), chargés sans alourdir le démarrage (paresseux ou par jeu).
- Sélecteur d'icônes : choix du jeu, recherche par nom, graisse. Rendu, export PNG, outils de Claude
  (créer une icône d'un jeu donné) et lecture.

## Étape 2 — Composants

Modèle « copie liée » :
- Un cadre devient maître avec `component: true` (n'importe quel cadre, n'importe où dans une page).
- Une instance est un `frame` avec `instanceOf: <id du maître>`. Ses enfants sont de vrais calques copiés ;
  chaque calque copié porte `source: <id du calque correspondant dans le maître>` et
  `overrides?: string[]` (noms des propriétés modifiées localement). La racine de l'instance a aussi ses
  `overrides` (sa position, sa taille et son nom sont toujours locaux).
- **Synchronisation** : après chaque lot d'opérations qui touche un maître ou ses descendants, chaque
  instance est remise d'accord : propriétés non surchargées recopiées, calques ajoutés/supprimés/réordonnés
  dans le maître reportés (un calque supprimé du maître disparaît des instances), nouveaux ids pour les
  calques ajoutés. Instances imbriquées (instance dans un maître) gérées ; une boucle (maître qui se contient
  lui-même) est refusée.
- Modifier une propriété d'un calque d'instance l'ajoute à ses `overrides`. Dans une instance on ne peut ni
  ajouter, ni supprimer, ni déplacer de calque (refus explicite, message clair) ; cacher (`visible`) est
  permis (override).
- **Reset changes** vide les `overrides` (racine : tout sauf position/taille/nom). **Detach** retire
  `instanceOf`/`source`/`overrides` du sous-arbre. Supprimer un maître détache ses instances.
- Copier-coller ou dupliquer un maître crée une instance ; copier une instance crée une instance.
- UI : clic droit « Create component » (Ctrl+Alt+K) ; maître en violet (contour de sélection, nom sur la
  toile, icône dans les calques) ; instance avec icône d'instance ; bouton « Components » dans la barre du
  bas → modal (même mécanique que Variables) listant les maîtres du document avec aperçu, clic = pose une
  instance au centre de la vue (ou dans le cadre sélectionné). Panneau de droite d'une instance :
  « Instance of <nom> », Go to main, Reset changes, Detach.
- Claude : créer un composant, poser une instance (`create` avec `instanceOf`), modifier, détacher ;
  `lire_elements` montre le lien. Le validateur de document vérifie la cohérence (maître existant, sources
  valides) et la réparation corrige un fichier abîmé (instance orpheline → détachée).
- Hors chantier : variantes, propriétés de composant, slots (le contenu d'un slot Pen devient des calques
  locaux sans `source`, autorisés dans une instance importée).

## Étape 3 — Ouvrir un .pen

- Conversion pure et testable dans `src/core/pen/` (`importPen(json, options) → { doc, report }`), sans
  accès disque ; le principal lit le fichier et fournit les images.
- **Open** (menu, Ctrl+O, glisser-déposer, ouverture depuis l'Explorateur, accueil) accepte `.pen`. Le
  document converti est **sans fichier** (titre = nom du .pen) ; Save propose `<nom>.maquette` dans le dossier
  du .pen. Les images référencées par le .pen (chemins relatifs) passent par les assets en attente et sont
  copiées dans `assets/` au premier enregistrement.
- Correspondances : frame → frame (layout horizontal par défaut, `none` = libre, gap, padding 1/2/4
  valeurs, justify/align, `fill_container`/`fit_content` → fill/hug avec repli numérique, `clip`,
  `layoutPosition:absolute`) ; group → cadre libre ; rectangle/ellipse → forme ; path/line/polygon →
  vector ; text (lineHeight ratio → px arrondi, « auto » → ratio par défaut de la police ou 1.2, textGrowth
  auto/fixed-width/fixed-width-height → auto/auto-height/fixed, fontWeight chaîne → nombre) ; icon → icon du
  même jeu (Lucide, Phosphor, Feather, Material Rounded) avec sa graisse ; jeu inconnu → carré gris signalé ; remplissages
  hex/variable/gradient (linear/radial/angular→conique)/image ; contours (alignement inner/center/outer,
  largeur par côté → plus grande valeur, signalée) ; ombres (sans spread) ; blur/background_blur ;
  `reusable` → composant ; `ref` + `descendants` (surcharges par chemin d'ids, remplacement de sous-arbre)
  → instance avec overrides ; `enabled:false` → caché ; opacité, rotation si le modèle la porte (sinon
  signalée).
- Variables : couleur → variables (styles de couleur) Maquette ; nombre/chaîne/booléen → valeur en dur ;
  thèmes → premier thème de chaque axe.
- Pas de pages dans Pen : une page « Page 1 », les cadres de premier niveau gardent leur x/y.
- note/prompt/context/script/browser, shader, mesh_gradient : retirés ou remplacés (couleur moyenne) et
  comptés dans le rapport.
- **Rapport** : après l'ouverture, une boîte de l'app liste ce qui n'a pas été repris tel quel (par
  catégorie, avec le nombre). Rien à signaler → pas de boîte.
- Vérification : tests unitaires sur des extraits ; e2e d'ouverture d'un .pen fixture ; puis ouverture des
  vrais fichiers de l'utilisateur (lecture seule) hors écran, captures comparées aux PNG de Pen quand ils
  existent, tous les fichiers s'ouvrent sans erreur et passent le validateur.
