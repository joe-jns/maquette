# Maquette + Claude au niveau de Pen ? Évaluation sur de vrais essais

Date : 2026-10-17. Spec : `docs/superpowers/specs/2026-10-17-niveau-design-pen.md`.

## Protocole

- **8 essais réels**, lancés avec le vrai `claude -p` de l'abonnement. Chaque essai tourne dans l'app construite, la fenêtre hors écran (`MAQUETTE_E2E=1`), avec des données isolées (`MAQUETTE_USER_DATA`, pipe à part). Chaque essai part d'un document neuf, enregistré dans un dossier temporaire. Le harnais Playwright ouvre le chat, tape le message et attend la fin. Il refuse toute permission hors lecture (aucune n'a été demandée). Il enregistre ensuite la conversation (`__chatStore`) et exporte les cadres en PNG avec `renderNode`.
- **Étalon** : les aperçus des styles livrés dans Pen (`out/editor/images/styles/{web,web-app,mobile}`). J'en ai regardé une dizaine, notamment Provenance, Cask & Current, Field Hour, Quiet Press et Fieldline. Ils ont des points communs : une seule grande photo cohérente par écran, des titres de 90 à 120 px sur deux lignes, peu de boîtes, de grands aplats, des boutons francs et un contenu précis. Selon la grille, je les note autour de **8 à 8,3**.
- **Notation** : grille `vendor/design/taste/critique.md` (design 40 %, ergonomie 30 %, créativité 20 %, contenu 10 %, avec les plafonds). Je note sur les captures, en juré qui n'a pas construit la page.
- **Références de l'essai 4** : 7 captures pleine largeur faites avec Chromium headless, sur des sites publics réputés pour leur design (Parsley Health ×3, Equinox ×2, Kinfolk ×2). Planche : `img/t4-references-planche.jpg`. Aesop, Hims, Oura, Calm et One Medical ont bloqué le navigateur headless (Cloudflare).

## Résultats

| Essai | Avant (consigne d'origine) | Après | Verdict face à Pen | Méthode suivie |
| --- | --- | --- | --- | --- |
| 1. Landing « Terre & Feu », céramique, Namur | **6,1** (581 s) | tour 1 : **6,9** (672 s) · tour 2 : **7,7** (613 s) | Proche de Pen. Le hero est franc : titre de 2 lignes, photo dans une arche, motif repris jusqu'au pied de page. Reste en dessous à cause des photos (potier indien, bols de musée). | Oui : direction tirée, guides lus, capture + `verifier_gout` après chaque section, critique notée (7,8 annoncé). |
| 2. Tableau de bord, chantiers de rénovation | **7,1** (341 s) | **7,3** (331 s) | Juste en dessous de Pen. Écran dense et juste, avec un vrai contenu métier. Mais il reste une mosaïque de tuiles d'égal poids, sans la grande région dominante de Quiet Press. | Avant : pas de critique finale. Après : `taste-critique` lu, `verifier_gout` en mode `app`, note donnée (7,6). |
| 3. Mobile padel, Charleroi | **7,3** (240 s) | **7,7** (170 s) | Au niveau de Pen ou presque (comparé à Fieldline) : une grande photo, une seule action à portée de pouce, une liste claire. Plus faible : une seule photo, utilisée deux fois. | Partielle : direction, guide et vérification faits, mais la critique notée a été sautée (Claude le dit lui-même). |
| 4. Références → kiné à Mons | **7,6** (331 s) | non relancé | Le plus proche de Pen : hero photo plein écran, serif fin, vert sapin et menthe repris de Parsley, mosaïque Equinox, grand nom en pied de page comme Kinfolk. Photos de soins dépareillées. | Oui : les 7 références sont analysées d'un coup (`capture({ids})`), il n'y a pas de tirage (comme prévu), couleurs et styles sont nommés, la critique est lue, les références ne sont pas touchées. |

Détail des notes (design · ergonomie · créativité · contenu) :

- 1 avant : 5,5 · 6,5 · 7 · 5,5. Hero centré dans une carte, navigation en bas du premier écran, cartes de cours à hauteur fixe pleines de vide, rangée « de la motte au four » qui sort du cadre à droite, photos de vitrines de musée présentées comme « pièces à vendre », texte de 13 px.
- 1 tour 1 : 6,5 · 7,5 · 7 · 6,5. Navigation en haut, titre énorme, grille de pièces cohérente (vraie sélection de photographe). En revanche, le hero n'a pas de photo, les onglets gris prennent le premier écran, et une pastille grise sert de portrait.
- 1 tour 2 : 7,5 · 8 · 8 · 6,5. Le contenu reste plafonné par les photos hors sujet.
- 2 avant : 7 · 7 · 7,5 · 7. 2 après : 7 · 7,5 · 7 · 8.
- 3 avant : 7 · 8 · 8 · 7,5, mais la photo est petite et vient d'un salon professionnel. 3 après : 7,5 · 8 · 7,5 · 7,5.
- 4 : 7,5 · 8 · 7 · 7,5.

**Verdict global** : avec la consigne corrigée, Maquette + Claude livre entre **7,3 et 7,7**, contre environ 8 pour Pen. La composition, la typo et le contenu sont au niveau, et la méthode est suivie. L'écart qui reste vient surtout des **photos** : les banques libres (Openverse et Wikimedia) donnent des clichés d'amateur ou de musée, souvent hors de Belgique et sans lumière commune. Pen, lui, a des images générées ou choisies, toutes de la même facture. Les captures avant/après sont dans `img/`.

## Ce qui a été changé

1. **Consigne** (`src/main/chat/consigne.ts`, toujours sous 3 000 tokens, test vert) :
   - un **hero web cadré** : barre en haut, titre de 88 à 120 px aligné à gauche, vrai bouton, premier écran de 900 px, en général une photo sur au moins la moitié de l'écran ;
   - des **photos choisies comme par un éditeur photo** : une seule lumière, un seul monde ; refuser les instantanés, les objets de catalogue et les photos d'un autre pays ; mieux vaut un aplat avec du grand texte qu'une mauvaise photo ; poser les photos une à une ;
   - **pas de trous** : pas de hauteur figée pour égaler une carte voisine, pas de `space-between` dans une carte, rien qui sort du cadre ;
   - une **critique finale obligatoire, aussi pour les écrans d'app**, faite sur des captures pleine largeur, section par section, avec le bloc ROUND noté ;
   - pour les **écrans d'app** : une région dominante sur au moins la moitié de l'écran, l'information secondaire posée sur le fond plutôt qu'en boîtes, une navigation sans rangée de boîtes égales, jamais de pastille grise.
2. **`verifier_gout` en mode écran d'application** (`ecran:"app"`) : les règles des pages publiques ne s'y appliquent plus (étiquettes, rangées de cartes, filets, photos, bouton du premier écran).
3. **Petits défauts d'outil révélés par les essais** :
   - la règle *first-action* restait toujours en alerte : une maquette n'a pas de `<button>`. Les cadres qui jouent le rôle de bouton sont maintenant marqués `role=button` avant la sonde ;
   - le premier lien du menu était pris pour une étiquette (*eyebrow*) au-dessus du titre du hero, et Claude a renommé la barre trois fois sans effet. Les cadres nommés Navigation, Nav, Barre du haut ou En-tête sont maintenant marqués `role=navigation` ;
   - les corrections citaient `scripts/assets.mjs` au lieu de l'outil `images` ;
   - les photos Wikimedia échouaient en **HTTP 429** (13 poses ratées sur 40 au premier essai). Il y a maintenant deux réessais après `Retry-After` (8 s au plus), et l'agent HTTP indique un contact. Aux essais suivants : 23 poses, 0 échec, aucun 429.

## Manques de l'outil, classés par impact (non codés : propositions)

1. **Qualité des photos (impact fort, c'est l'essentiel de l'écart avec Pen).** Openverse et Commons donnent des photos d'amateur, de musée ou d'un autre pays. Proposition : une source « photo de banque » de qualité, avec une clé fournie par l'utilisateur (Unsplash ou Pexels, licences commerciales, crédit gardé). En option, une génération d'images si l'utilisateur fournit une clé d'API. Dans `images`, on garderait le choix de la source et le crédit.
2. **Pas de traitement d'image (impact moyen).** Impossible d'harmoniser des photos disparates : noir et blanc, teinte, luminosité, grain, duotone. Proposition : une propriété `filters` sur `image` (`grayscale`, `brightness`, `contrast`, `tint`) rendue en CSS `filter` et à l'export.
3. **Pas de rotation (impact moyen).** La direction de l'essai 3 voulait une photo inclinée, et Claude a dû y renoncer. Proposition : `rotation` (en degrés) sur tous les éléments, gérée par le rendu, la sélection et l'export.
4. **`verifier_gout` mesure une page web (impact faible à moyen).** Sur une section, il applique encore des règles de page (*few-pictures*, *focal-point*, *first-action*) quand la section fait 1440 px de large. Un bouton placé au-dessus d'un titre passe encore pour une étiquette. Proposition : un mode `ecran:"section"`, et compter `role=button` dans les exclusions de la règle *eyebrow* (sonde de taste-skill).
5. **Couleur nommée devinée (impact faible).** Claude a utilisé « Aplat 1 », qui n'existait pas pour la palette tirée, et l'erreur était claire. Proposition : `direction` liste explicitement les couleurs réellement créées.
6. **Captures d'une longue page (impact faible).** `capture` d'une page de 7 000 px à 700 px de large ne montre ni les trous ni les petits textes. C'est corrigé par la consigne (critique section par section), mais un `capture({id, tranches:true})` qui découpe en écrans de 900 px serait plus sûr.

## Reproduire

Le harnais n'est pas versionné : il consomme l'abonnement. Il se résume ainsi : construire l'app (`npx electron-vite build`), puis lancer un spec Playwright qui ouvre l'app avec `MAQUETTE_E2E=1`, `MAQUETTE_USER_DATA`, `MAQUETTE_PIPE` et `MAQUETTE_FONTS_DIR` isolés, avec un document neuf. Pour l'essai 4, on y place des images avec leurs fichiers dans `assets/`, et elles sont sélectionnées. Le spec ouvre le chat (Ctrl+L), remplit « Message à Claude », attend que `__chatStore.getState().busy` soit faux deux fois de suite, puis exporte `items` et `renderNode` de chaque cadre.
