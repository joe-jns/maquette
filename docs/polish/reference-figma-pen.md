# Référence de polish : Figma UI3 et Pen

Ce document est la référence pour le polish de l'interface de Maquette. Il compare trois choses :

- **Maquette** telle qu'elle est aujourd'hui (commit `2447d3f`) ;
- **Figma UI3**, l'interface actuelle de Figma ;
- **Pen** (pen.dev 1.2.18), l'application de bureau installée sur ce PC.

Chaque valeur est suivie de sa source. Les mots techniques sont expliqués la première fois qu'ils apparaissent.

> **Petit lexique.**
> - **Token** : une variable de couleur ou de taille, définie une fois et réutilisée partout (`--panel-bg` par exemple).
> - **Graisse** : l'épaisseur d'une police. 400 = normal, 600 = demi-gras.
> - **Interligne** : la hauteur d'une ligne de texte.
> - **Rayon** : l'arrondi des coins.
> - **Élévation** : l'ombre qui fait « flotter » un élément au-dessus du reste.
> - **Îlot** : un panneau flottant, aux coins arrondis, posé sur le canevas.

---

## 1. D'où viennent les chiffres

| Source | Ce qu'on en a tiré | Fiabilité |
|---|---|---|
| **Maquette** : CSS lu dans `src/renderer/**.css` et captures `e2e-shots` | Toutes les valeurs actuelles | Exactes |
| **Figma** : feuille de style et script de l'éditeur, téléchargés depuis `https://www.figma.com/webpack-artifacts/assets/` (`auth-*.min.css`, `figma_app-*.min.css`, `figma_app-*.min.js`) en ouvrant un fichier public sans compte | Couleurs, polices, élévations ; constantes de mise en page (`rightNavWidth:"240px"`, `ui3RowHeight:"32px"`, `ui3InputHeight:"24px"`) | Exactes (version d'octobre 2026) |
| **Figma** : https://developers.figma.com/docs/plugins/css-variables/ | Noms et valeurs des couleurs, clair et sombre | Documenté |
| **Figma** : https://www.figma.com/blog/our-approach-to-designing-ui3/ et https://help.figma.com (« Navigating UI3 ») | Principes : panneaux fixes, barre d'outils en bas, pas de barre du haut | Documenté |
| **Figma** : images du blog | Proportions | Estimation |
| **Pen** : feuille de style `out/editor/assets/index-CLJLRweK.css`, extraite en lecture seule de `app.asar` | Tokens (zinc, rayon 10 px, îlot 20 px, tailles de texte) | Exactes |
| **Pen** : mesures `getComputedStyle` dans une instance isolée de Pen (voir § 7) | Hauteurs des champs, des rangées, de l'en-tête de section, largeur du panneau | Exactes |

Une limite côté Figma : sans compte, le panneau de droite (Design/Prototype) ne s'ouvre pas. Ses valeurs viennent donc des constantes du script et des images, pas d'une mesure directe. Les poignées et repères du canevas sont dessinés par le moteur de rendu de Figma et ne figurent pas dans le CSS. Leurs valeurs sont marquées « estimé ».

---

## 2. Images de référence

Les images légères sont copiées dans `docs/polish/img/`. Les captures Maquette et Pen sont faites à l'échelle d'affichage 110 % : 1 px CSS = 1,1 px d'image.

| Sujet | Maquette | Figma UI3 | Pen |
|---|---|---|---|
| Vue générale | `img/maquette-05-cadre-auto.png` | `img/figma-ui3-hero-blog-editor-overview.jpg` | `img/pen-22-enfant-selectionne.png` |
| Calques + sélection | `img/maquette-03-texte.png` | `img/figma-live-ui3-left-panel-layers-selected.png` | `img/pen-22-enfant-selectionne.png` |
| Panneau de propriétés | `img/maquette-05-cadre-auto.png` | `img/figma-ui3-left-navigation-panel-fixed.jpg`, `img/figma-ui3-autolayout-properties-tooltips.jpg` | `img/pen-22-enfant-selectionne.png` |
| Barre d'outils | `img/maquette-05-cadre-auto.png` (en bas) | `img/figma-live-ui3-bottom-toolbar.png` | `img/pen-25-infobulle-outil.png` (verticale, à gauche) |
| Menu contextuel | `img/maquette-09-menu-contextuel.png` | (valeurs CSS § 4.8) | `img/pen-24-menu-contextuel.png` |
| Infobulle | aucune (infobulle du système) | `img/figma-ui3-autolayout-properties-tooltips.jpg` | `img/pen-25-infobulle-outil.png` |
| Étiquette de dimensions | `img/maquette-03-texte.png` | `img/figma-live-ui3-canvas-selection-dimension-pill-2x.png` | `img/pen-22-enfant-selectionne.png` |
| Liste déroulante de polices | `img/maquette-07-polices.png` | — | — |
| Chat | `img/maquette-13-chat-conversation.png` | — | `scratch/pen/pen-01-general.png` |

Les captures complètes sont dans le dossier temporaire `C:\Users\micro\AppData\Local\Temp\claude\C--Users-micro\47c1e772-4410-4ff1-aafc-85eb7e222422\scratchpad\polish-ref\` :

- `maquette\` : les 14 vues de `e2e-shots`, de `01-nouveau` à `14-chat-saisie` ;
- `pen\` : vue générale, tableau de bord, calques, cadre sélectionné, enfant sélectionné, survol, menu contextuel, infobulle, fenêtre de question, mode sombre ;
- `figma\` : 10 images ;
- `raw\` : CSS et JS de Figma, pour chercher d'autres tokens.

---

## 3. Ce qui frappe au premier coup d'œil

1. **Maquette est en gris chaud, Figma et Pen sont neutres.**
   - Maquette : canevas `#e4e4e1`, bordures `#e8e8e6`, champs `#f3f3f1`. Ces gris tirent vers le beige, ce qui donne un air terne et « fait maison ».
   - Figma : `#F5F5F5` / `#E6E6E6`.
   - Pen : la gamme zinc, `#f4f4f5` / `#e4e4e7` et un canevas `#f6f6f6`.
2. **Tout est un cran trop grand dans Maquette.**
   - Texte : 12 px en Segoe UI, contre 11 px chez Figma (Inter) et chez Pen.
   - Champs : 28 px de haut, contre 24 px chez les deux autres.
   - Panneau de droite : 280 px de large, contre 240 px chez Figma.
   - Résultat : une densité de « formulaire web », pas d'outil pro.
3. **La barre d'outils en encre noire jure avec le reste.** Figma utilise une barre blanche de 48 px, avec une ombre douce, des séparateurs et des chevrons de sous-menu. Pen utilise un îlot blanc vertical. Chez Maquette, c'est le seul gros bloc sombre de l'écran : il attire l'œil au mauvais endroit.
4. **Les infobulles sont celles du système.** Maquette utilise l'attribut `title`, donc l'infobulle grise de Windows, qui apparaît après environ 1 s. Figma et Pen affichent une petite pastille sombre, en 11 px, avec le raccourci clavier.
5. **Le menu contextuel et les dialogues sont des cartes noires sans raccourcis.**
   - Le menu de Pen est blanc : rangées de 30 px, raccourcis à droite, séparateurs, chevrons de sous-menu, « Delete » en rouge.
   - Le menu de Figma est `#1E1E1E`, mais il a lui aussi les raccourcis, les séparateurs et un rayon de 13 px.

---

## 4. Valeurs cibles détaillées (Figma UI3, Pen à côté)

### 4.1 Typographie

| Élément | Figma UI3 | Pen | Maquette aujourd'hui |
|---|---|---|---|
| Police | Inter (repli : système) ; normal **450**, fort **550** [CSS] | Police système (`ui-sans-serif`, donc Segoe UI) ; Inter seulement pour certains éléments [CSS Pen] | `system-ui, 'Segoe UI'` |
| Texte courant du panneau | **11 px / 16 px**, interlettrage +0,055 px [CSS] | 11 px (`--text-xxs` : 0,6875rem / 16 px) [mesuré] | **12 px** / 1.4 (`--fs`) |
| Titre de section | 11 px, graisse 550 [mesuré] | 11 px, graisse 500 [mesuré « Appearance »] | 12 px, 600 |
| Petit libellé (sous-titre de groupe) | 9 px / 14 px | **9 px**, gris `#71717a` [mesuré « Dimensions »] | 11 px |
| Grand texte (nom de fichier, titres) | 13 px / 22 px, 550, interlettrage −0,032 px | 13 px (`text-[13px]`) | 14 px (`--fs-large`) |
| Titre de dialogue | 15 px / 25 px, 550 | ~17 px, 600 [image] | 15 px, 600 |
| Chiffres | `font-variant-numeric: tabular-nums` | idem | déjà fait |

**Cible pour Maquette** : 11 px / 16 px pour tout le panneau, 13 px pour les titres de fenêtre, 9 ou 10 px pour les sous-libellés. Choix de police à trancher : Inter (comme Figma, à embarquer dans l'app) ou Segoe UI (comme Pen, qui reste sur la police système). Dans les deux cas : **11 px**. Graisses : 400/450 pour le normal, 550/600 pour le fort. Pas plus de trois tailles en tout.

### 4.2 Couleurs (thème clair)

| Rôle | Figma UI3 [CSS + doc plugins] | Pen [CSS] | Maquette (`panels.css :root`) |
|---|---|---|---|
| Fond des panneaux | `#FFFFFF` | `#fafafa` (îlot) | `#ffffff` |
| Fond secondaire / survol | `#F5F5F5` | `#f4f4f5` | `#f1f1ef` (survol), `#f3f3f1` (champ) |
| Fond appuyé / tertiaire | `#E6E6E6` | `#e4e4e7` | — |
| Bordure | `#E6E6E6` | `#e4e4e7` | `#e8e8e6` |
| Texte | `rgba(0,0,0,.9)` | `#18181b` | `#1c1d21` |
| Texte secondaire | `rgba(0,0,0,.5)` | `#71717a` | `#75767c` |
| Texte tertiaire / désactivé | `rgba(0,0,0,.3)` | — | (opacité .35–.6 selon l'endroit) |
| Accent (sélection, focus) | `#0D99FF` (survol `#007BE5`) | `#3b82f6` (`--accent-active`) ; poignées bleues | `#0d99ff` ✔ |
| Texte / icône sélectionnés | `#007BE5` | bleu | `--accent` |
| Fond sélectionné | `#E5F4FF` | bleu clair (≈ `#dbe7fb`) [image] | `#e6f4ff` ✔ |
| Fond sélectionné, survol | `#BDE3FF` | — | absent |
| Enfants de la sélection | `#F2F9FF` | — | **absent** |
| Composant (violet) | `#9747FF` fond / `#8638E5` texte | violet `#9747ff`-like [image] | absent |
| Danger | `#F24822` (texte `#DC3412`) | `#ef4444` | `#d92d20` |
| Menus et infobulles | `#1E1E1E`, bordure `#383838` | menu blanc `#fff` ; infobulle sombre | `--ink #16181d` |
| Fond de dialogue (voile) | `rgba(0,0,0,.5)` | voile clair (blanc à ~60 %) [image] | `#0006` |
| Canevas | réglable par fichier ; `#F5F5F5` par défaut (estimé ; mesuré `#F2F2F2`) | `#f6f6f6` | **`#e4e4e1`** |

### 4.3 Thème sombre

Maquette n'a **pas** de thème sombre. Pour mémoire :

- **Figma** : fond `#2C2C2C`, secondaire `#383838`, bordure `#444444`, texte `#FFFFFF`, secondaire `rgba(255,255,255,.7)`, sélection `#394360`, accent `#0C8CE9`, canevas `#1E1E1E`.
- **Pen** : fond `#18181b`, secondaire `#27272a`, bordure `#202020`, canevas `#18181b`.

Capture : `scratch/pen/pen-27-sombre.png`.

### 4.4 Ombres (élévations) [CSS Figma]

| Niveau | Usage | Valeur |
|---|---|---|
| 100 | îlots, barre d'outils | `0 1px 3px #00000026, 0 0 .5px #0000004d` |
| 200 | listes déroulantes | `0 1px 3px #0000001a, 0 3px 8px #0000001a, 0 0 .5px #0000002e` |
| 300 | infobulles | `0 1px 3px #0000001a, 0 5px 12px #00000021, 0 0 .5px #00000026` |
| 400 | menus | `0 2px 5px #00000026, 0 10px 16px #0000001f, 0 0 .5px #0000001f` |
| 500 | dialogues | `0 2px 5px #00000026, 0 10px 24px #0000002e, 0 0 .5px #00000014` |

Barre d'outils, mesurée : `0 0 1px rgba(0,0,0,.18), 0 3px 8px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.1)`.

Pen : ombres Tailwind (`shadow-sm` `0 1px 3px #0000001a, 0 1px 2px -1px #0000001a`, `shadow-lg`). Ses îlots ont un liseré de 1 px (`island-shine`) plutôt qu'une grosse ombre.

Maquette : `0 4px 14px #0003`, `0 8px 24px #0005`, `0 10px 40px #0008`. C'est trop sombre et trop flou : une seule couche, sans le fin liseré de 0,5 px qui donne le côté net.

### 4.5 Rayons et espacements

| | Figma | Pen | Maquette |
|---|---|---|---|
| Rayons | **2 / 5 / 13 px** + pilule | 6 px (champs), 10 px (`--radius`), 14 px (panneau mesuré), 20 px (îlot) | 1, 2, 4, 5, 6, 7, 8, 10, 12 px et 999 : **neuf valeurs** |
| Grille | base **8 px** ; espacements 4/8/12/16/24/32/40 | base 4 px (`--spacing: .25rem`) | 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 20… (sans grille) |
| Marge du panneau de droite | 16 px à gauche, 8 px à droite ; grille de 28 colonnes × 8 px | 16 px de chaque côté [mesuré] | 12 px |

**Cible** : trois rayons (`--radius-sm: 2px`, `--radius: 5px`, `--radius-lg: 12px`) et des espacements multiples de 4.

### 4.6 Panneaux

| | Figma UI3 | Pen | Maquette |
|---|---|---|---|
| Disposition | Panneaux fixes collés aux bords, pas de barre du haut. Nom du fichier en haut du panneau gauche ; avatars, Lecture, Partager en haut du panneau droit. | Îlots flottants arrondis (14 px) à 10 px des bords, sur le canevas | Panneaux collés, sans en-tête de fichier |
| Largeur gauche | **240 px** (redimensionnable) | ~376 px (agent + calques) | 240 px ✔ |
| Largeur droite | **240 px** (`rightNavWidth`) | **221 px** [mesuré] | **280 px** |
| En-tête du panneau droit | 40 px : onglets Design/Prototype à gauche, **zoom %** à droite | Nom + icône du type de l'élément sélectionné, puis « Create Component » | Onglets soulignés (38 px) + « Claude » |
| Hauteur d'une rangée | **32 px** (`ui3RowHeight`) | 30–33 px entre champs [mesuré] | 34 px (28 + 6) |
| Mode « interface réduite » | Panneaux en îlots de 48 px, rayon 13 px | — | absent |

### 4.7 Champs, boutons, contrôles

| | Figma UI3 | Pen | Maquette |
|---|---|---|---|
| Champ numérique | **24 px**, fond `#F5F5F5`, rayon 5, marges 3/7. Survol : contour `#E6E6E6`. Focus : **1 px** `#0D99FF`. | **24 px**, fond noir à 4,5 % sur `#fafafa`, rayon 6, marge gauche 24 px pour l'icône [mesuré] | **28 px**, rayon 5, survol bordure, focus bordure bleue + fond blanc |
| Libellé glissable (X, Y, W, H) | Dans le champ, 14 px de large, gris secondaire, curseur `ew-resize` | Dans le champ (« X », « W », icônes) | Dans le champ, 24 px ✔ ; mais les libellés « L » / « H » des lignes Fixe/Contenu sont **dehors**, mal alignés |
| Bouton icône | 24 px (gros : 32), icône 16 px, rayon 5. Sélectionné : `#E5F4FF` + icône `#007BE5`. | 24–28 px | 24 px ✔, sauf `small` à 20 px |
| Bouton texte | 24 px (gros : 32), marge 0 8 / 0 12, rayon 5. Secondaire : contour `rgba(0,0,0,.1)`. | 24–32 px | 28 px, rayon 6 |
| Segmenté (choix exclusif) | Petits boutons icônes 24 px | Onglets 22 px (Freeform/Vertical/Horizontal) | 22 px dans un rail de 26 px ✔, mais texte 11 px tronqué (« Contenu », « Remplir ») |
| Liste déroulante | Menu maison (sombre, élévation 400) | Menu maison | **`<select>` natif Windows** (« Comme le cadre », « Bold 700 ») |
| Case à cocher | 12–16 px, maison | 16 px, maison, noire | case native |
| Barre de défilement | 6 px, flottante | 10 px, pouce `#00000038`, marge 2 px | **native Windows avec flèches** (visible dans la liste des polices) |
| Focus clavier | contour 1 px `#0D99FF` (décalé de 1 px pour les boutons) | anneau `--ring #d4d4d8` | 2 px, à l'intérieur ou à l'extérieur selon l'endroit |

### 4.8 Menu contextuel, infobulle, dialogue

| | Figma UI3 [CSS/JS] | Pen [capture] | Maquette |
|---|---|---|---|
| Menu : fond | `#1E1E1E` | `#fff` + bordure + `shadow-lg` | `#16181d` |
| Menu : rayon et marges | rayon **13 px**, 8 px en haut et en bas | rayon ~8–10 px | rayon 8, marge 4 |
| Menu : rangée | **24 px**, rayon 5, marges 4/8 | ~28 px, texte 13 px | ~28 px (7 + texte + 7) |
| Menu : survol | fond `#0D99FF`, texte blanc | gris clair | fond accent ✔ |
| Raccourci | aligné à droite, `rgba(255,255,255,.7)` | aligné à droite, gris (« Ctrl C ») | **absent** |
| Séparateur | 1 px `#383838`, 7 px au-dessus et en dessous | 1 px gris clair | **absent** |
| Sous-menu | chevron `›` | chevron `›` (« Copy as », « Settings ») | absent |
| Infobulle | `#1E1E1E`, 11/16 blanc, marges 4/8, rayon 5, élévation 300, 6 px de la cible ; raccourci 12 px plus loin, en gris | pastille sombre, rayon ~6, « Rectangle  R » (raccourci gris) | **infobulle native Windows** (`title`) |
| Délai d'infobulle | ~500 ms (seulement trouvé pour les bibliothèques) | ~700 ms (estimé) | ~1 000 ms (Windows) |
| Dialogue | fond blanc, rayon **13 px**, élévation 500, en-tête 40 px, voile `rgba(0,0,0,.5)` | carte blanche, rayon ~16, deux boutons (secondaire contour / principal noir) | **carte noire**, rayon 12, voile `#0006` |
| Aide raccourcis (`?`) | panneau dédié en bas, clair | — | carte noire qui couvre seulement le canevas (les panneaux ne sont pas assombris) |

### 4.9 Calques

| | Figma UI3 | Pen | Maquette |
|---|---|---|---|
| Hauteur d'une rangée | **32 px** de pas, surbrillance 24 px, retrait de 8 px | **28 px** [mesuré] | 28 px |
| Retrait par niveau | 16 px (24 px mesuré marges comprises) | ~13 px [image] | **14 px** (`6 + depth * 14`) |
| Icône de type | 16 px, `rgba(0,0,0,.3)` | 16 px, icônes distinctes (cadre flex, composant ◇) | 14 px, trait 1,2, `#75767c` |
| Survol | `#F5F5F5`, rayon 5 | gris clair | `#f1f1ef`, rayon 5 ✔ |
| Sélection | `#E5F4FF` ; le nom passe en 550 | fond bleu clair **+ nom et icône en bleu** | `#e6f4ff`, icône bleue, nom inchangé |
| Enfants de la sélection | **`#F2F9FF`**, en un seul bloc arrondi en haut et en bas | — | **rien** |
| Composants | nom et icône violets `#8638E5` | violets | — |
| Actions (œil, cadenas) | à droite, au survol, 48 px | œil au survol | ✔ au survol |
| Page courante | fond `#F5F5F5` + 550, **pas en bleu** | — | **fond bleu** (même couleur que la sélection : confusion) |

### 4.10 Barre d'outils

| | Figma UI3 [mesuré] | Pen | Maquette |
|---|---|---|---|
| Position | en bas, centrée, 12 px du bord | verticale, à gauche du canevas | en bas, centrée ✔ |
| Fond / taille | **blanc**, 48 px de haut, rayon **13 px**, élévation de barre | blanc, rayon pilule, 28 px par bouton | **encre `#16181d`**, 42 px, rayon 10 |
| Boutons | 32 × 32, rayon 5, écart 8 px, marge 8 px | 28 × 28 | 34 × 34, rayon 7, écart 2 |
| Outil actif | fond `#0D99FF`, icône blanche | icône foncée sur fond gris | fond accent ✔ |
| Sous-menus | chevron séparé de 16 × 32 à côté de l'outil (formes, plume) | chevron de 12 px sous l'outil | **absent** |
| Séparateurs | 1 px `#E6E6E6`, toute la hauteur | — | **absent** |
| Icônes | 24 px, trait 1 px | 16–18 px, trait ~1,5 (Lucide) | 18 px, trait 1,7 |

### 4.11 Canevas

| | Figma UI3 | Pen | Maquette |
|---|---|---|---|
| Contour de sélection | 1 px `#0D99FF` (estimé) | 1,5 px bleu | 1,5 px bleu ✔ |
| Poignées | carrés blancs de 6–8 px, bord bleu de 1 px (estimé) | carrés blancs ~6 px | 8 px, blancs, bord bleu ✔ |
| Étiquette de dimensions | pastille `#0D99FF`, texte blanc 11 px, sous la sélection | pastille bleue arrondie (~4 px), 12 px, « 390 × 41 » | pastille 18 px, rayon 3 ✔ ; mais affiche « 339.9 × 48 » (décimale avec un point) |
| Repères de distance | rouges `#F24822` (estimé) | — | `#F24E1E` (`GUIDE`, `Overlay.tsx`) ✔ proche |
| Survol | contour bleu 1 px | contour bleu | 1,5 px |
| Zoom | menu « 100 % ▾ » dans l'en-tête du panneau droit | pilule `− 53 % +` en bas à droite | chip « 79 % » non cliquable, en bas à droite |

---

## 5. Comparaison point par point et priorités

Les colonnes :
- **Impact** : à quel point ça fait « pro » une fois corrigé (★ à ★★★).
- **Effort** : S = moins d'une heure, M = une demi-journée, L = plus.

Les 15 premiers points sont classés : impact d'abord, puis effort.

| # | Écart dans Maquette | Valeur cible | Fichier / sélecteur | Impact | Effort |
|---|---|---|---|---|---|
| 1 | Gris chauds (beige) partout : canevas `#e4e4e1`, bordures `#e8e8e6`, champs `#f3f3f1`, survol `#f1f1ef` | Neutres Figma : canevas `#F5F5F5`, bordure `#E6E6E6`, champ/survol `#F5F5F5`, appuyé `#E6E6E6`, texte `rgba(0,0,0,.9)` / `.5` / `.3` | `panels.css :root` (`--canvas-bg`, `--panel-border`, `--field-bg`, `--panel-hover`, `--panel-muted`) | ★★★ | S |
| 2 | Texte du panneau en 12 px | **11 px / 16 px** partout ; titres de section 11 px 600 ; petits libellés 9–10 px | `panels.css --fs`, `--fs-small`, `--panel-font` ; `design.css .design-heading h3` ; `panels.css .panel-heading h2` | ★★★ | S |
| 3 | Champs de 28 px, rangées de 34 px | Champs **24 px**, pas de 32 px (écart de 8 px) | `design.css .number-field`, `.select-field select`, `.hex-field`, `.name-field`, `.font-button` (30 → 24), `.field-grid gap` | ★★★ | S |
| 4 | Barre d'outils noire, sans séparateurs ni sous-menus | Blanche, 48 px, rayon 13, élévation de barre, boutons 32 px, actif bleu + icône blanche, séparateurs 1 px `#E6E6E6`, chevrons pour les groupes | `app.css .toolbar`, `.toolbar button` ; `canvas/Toolbar.tsx` | ★★★ | M |
| 5 | Infobulles natives (`title`), sans raccourci mis en forme | Composant `Tooltip` : `#1E1E1E`, 11 px blanc, rayon 5, marges 4/8, élévation 300, délai ~500 ms, raccourci en gris à 12 px du libellé | nouveau `src/renderer/ui/Tooltip.tsx` ; tous les `title=` (une cinquantaine) | ★★★ | M |
| 6 | Menu contextuel sans raccourcis, sans séparateurs, sans sous-menus | Rangées 24 px, raccourci aligné à droite, séparateur 1 px, rayon 13 (Figma) — ou menu blanc façon Pen ; un seul style pour tous les menus | `panels.css .context-menu*` ; `panels/ContextMenu.tsx` | ★★★ | M |
| 7 | Listes déroulantes `<select>` natives, cases à cocher natives, barres de défilement Windows avec flèches | Menus et cases maison ; barre de défilement fine (6–10 px, pouce `#00000038`, sans flèches) | `design.css .select-field select`, `.check-row` ; `app.css` (`::-webkit-scrollbar`) | ★★★ | M |
| 8 | Panneau droit de 280 px | **240 px** ; marges 16 px à gauche, 8 px à droite | `panels.css .layout` ; `chat.css .layout.has-chat` | ★★ | S |
| 9 | Neuf rayons différents | Trois : 2 / 5 / 12–13 px (+ pilule) | tous les CSS (`border-radius`) | ★★ | S |
| 10 | Dialogues et aide en cartes noires dans une interface claire ; l'aide n'assombrit que le canevas | Dialogue blanc, rayon 13, élévation 500, voile `rgba(0,0,0,.5)` sur toute la fenêtre ; boutons 24/32 px | `dialog/dialog.css .dialog*` ; `app.css .help*`, `.help-backdrop` (le mettre en `position: fixed`) | ★★ | S |
| 11 | Calques : pas de teinte pour les enfants de la sélection ; nom sélectionné pas mis en avant ; page courante en bleu comme la sélection | Enfants `#F2F9FF` en bloc ; nom sélectionné en 600 ; page courante `#F5F5F5` + 600, sans bleu ; rangées de 32 px avec surbrillance de 24 px (ou garder 28 comme Pen) | `panels.css .layer-row.is-selected`, nouveau `.is-in-selection`, `.page-list li.is-current` ; `LayersPanel.tsx` | ★★ | M |
| 12 | Icônes dessinées à la main, tailles 12–18 px, traits 1,2 à 1,8 | Un seul jeu : boîte 24 px, glyphe 16 px, trait 1 px (Figma) ou Lucide 16 px trait 1,5 (Pen) ; même couleur `--icon` | `Toolbar.tsx`, `LayersPanel.tsx`, `panels/design/*.tsx` | ★★ | M |
| 13 | Panneau droit sans en-tête de sélection, sans rangée d'alignement | En-tête : icône du type + nom de l'élément (« Cadre ▾ ») ; rangée « Alignement » (6 boutons 24 px) en haut, comme Figma et Pen | `panels/RightPanel.tsx`, `panels/design/PositionSection.tsx` | ★★ | M |
| 14 | Ombres lourdes à une seule couche (`#0003`–`#0008`) | Élévations Figma 100–500 en tokens (`--elevation-100`…) | `app.css .toolbar`, `.notice`, `.help` ; `panels.css .context-menu` ; `design.css .font-picker` | ★★ | S |
| 15 | Zoom « 79 % » : simple étiquette, ni menu ni − / + | Bouton zoom avec menu (Ajuster, 50/100/200 %, raccourcis) dans l'en-tête du panneau droit (Figma), ou pilule `− 79 % +` (Pen) | `app.css .zoom-badge` ; `canvas/Canvas.tsx` | ★★ | S |
| 16 | Lignes « L / H : Fixe · Contenu · Remplir » : libellés à l'extérieur, texte tronqué, présentes même pour un rectangle (choix grisés) | Comme Figma : un menu dans le champ L/H (« Fixe / Contenu / Remplir »), ou comme Pen : cases « Remplir la largeur / Contenu » ; cachées quand elles ne s'appliquent pas | `design.css .mode-rows`, `.segmented` ; `PositionSection.tsx` | ★★ | M |
| 17 | Onglets Design/Direction soulignés de 2 px | Onglets « pilule » : texte 11 px ; actif = fond `#F5F5F5`, rayon 5, 600 ; en-tête de 40 px | `panels.css .panel-tablist button` | ★ | S |
| 18 | Le champ de recherche de la liste des polices déborde : contour de focus coupé, texte rogné en haut | Champ de 24 px dans une marge de 8 px, focus 1 px qui reste à l'intérieur | `design.css .font-picker input` (et `overflow` du parent) | ★ | S |
| 19 | Focus clavier variable (2 px dedans, 2 px dehors) | Un seul style : 1 px `#0D99FF` (contour du champ) / anneau 2 px décalé de 1 px pour les boutons | `panels.css .panel button:focus-visible…`, `app.css .toolbar button:focus-visible`, `dialog.css` | ★ | S |
| 20 | Étiquette de dimensions « 339.9 × 48 » : point décimal anglais, chiffres non tabulaires | Entier si l'écart est < 0,5, sinon une décimale avec virgule (« 339,9 ») ou entier comme Pen ; `tabular-nums` | `canvas/Overlay.tsx` (`round`, `SizeLabel`) | ★ | S |
| 21 | Pas de thème sombre | Jeu de tokens `.dark` (valeurs § 4.3) | `panels.css :root` → `:root[data-theme=dark]` | ★★ | L |
| 22 | Pas de nom de fichier ni de menu principal dans l'interface (seulement dans le titre de la fenêtre) | En-tête du panneau gauche : logo/menu ▾ + nom du fichier 13 px 550 (Figma) | `panels/LeftPanel.tsx` | ★ | S |
| 23 | Bouton « Claude » isolé à droite des onglets ; le chat ouvert pousse le panneau Design au milieu | Le chat est un panneau à part entière : à gauche (comme l'onglet Agent de Pen), ou à la place du panneau droit avec un onglet | `chat.css .layout.has-chat` ; `RightPanel.tsx` | ★ | M |
| 24 | Couleur « needs » orange `#b26a00`, épingles `#d32f2f` / `#ef8c00`, `#c62828` codés en dur | Passer par des tokens `--warning`, `--danger` | `direction.css` | ★ | S |

---

## 6. Manques d'interface qui font « amateur »

- **Infobulles absentes ou natives.** Voir le point 5. Figma et Pen montrent le nom **et** le raccourci de chaque bouton.
- **Raccourcis invisibles dans les menus.** Ils n'existent que dans l'aide `?`. Il faut les afficher dans le menu contextuel et dans les infobulles.
- **Icônes incohérentes** : cinq épaisseurs de trait, six tailles.
- **Contrôles natifs du système** : `<select>`, cases à cocher, barres de défilement. Ce sont eux qui trahissent le plus vite un « formulaire web ».
- **Tailles de police mélangées** : 11, 12, 14, 15, 16, 18 et 22 px dans les CSS. Cible : trois tailles.
- **Alignements hors grille** : marges de 6, 10, 14 px, rayons de 7 px, `padding: 7px 10px`. Tout aligner sur 4/8 px.
- **États vides** : ils existent (« Aucune. Une couleur nommée… »), c'est bien. Mais ils sont en 12 px gris sur deux lignes ; Figma met une ligne courte en gris tertiaire. Le canevas vide (`01-nouveau`) a un message central : à garder.
- **Bleu de sélection utilisé pour autre chose** : page courante, onglet Claude actif. Chez Figma, le bleu est réservé à la sélection, au focus et à l'action principale.
- **Pas de mode « interface réduite »** (Figma : `Ctrl+\`). Pas non plus d'en-tête de fichier.
- **Commentaire faux dans le code** : `Toolbar.tsx` dit « Barre d'outils flottante en haut du canevas » alors qu'elle est en bas.

---

## 7. Comment les captures ont été faites (et incident)

- **Maquette** : `npx electron-vite build` puis `SHOTS=… npx playwright test -c e2e-shots`. Les 2 tests passent ; 14 captures.
- **Pen, vue générale** (`pen-01-general.png`) : capture de la fenêtre déjà ouverte (`untitled.pen`) avec `PrintWindow`, sans aucun clic.
- **Pen, autres vues** : pour ne pas toucher à la fenêtre de l'utilisateur ni à ses fichiers, on a lancé **une deuxième instance isolée** de Pen :
  - le code de `app.asar` est extrait en lecture seule ;
  - elle tourne sous l'Electron du projet, avec un dossier de données à part (`scratch/pen-userdata`) ;
  - elle a ouvert une **copie** de `autolog/mockups/pen/autolog.pen` (`scratch/pen-copy/autolog-copie.pen`) ;
  - elle a été pilotée par Playwright. Aucun fichier .pen d'origine n'a été ouvert ni modifié.
  - Effet de bord possible : la liste « Recents » de Pen, partagée entre les instances, peut maintenant afficher `autolog-copie.pen`.
- **Incident** : une première tentative de clic sur la vraie fenêtre de Pen n'a pas pu la mettre au premier plan. Le clic est tombé sur Edge (YouTube ouvert), en haut à gauche, près du logo YouTube : il a peut-être ramené la page d'accueil de YouTube. La capture accidentelle a été supprimée. Ensuite, plus aucun clic n'a été fait sur une fenêtre de l'utilisateur.
- **Figma** : pages publiques et fichier communautaire public ouverts sans compte avec Playwright ; feuilles de style téléchargées. Rien n'a été enregistré sur un compte.
