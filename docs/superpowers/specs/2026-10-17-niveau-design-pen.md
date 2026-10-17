# Niveau de design « comme Pen » — design

Date : 2026-10-17. Demande : « lance les 4 … je veux vraiment qu'on arrive au même niveau de design que quand j'utilise Pen ». On peut reprendre les skills de Pen (usage perso) et ajouter taste-skill.

## Constat (lecture de Pen 1.2.18)

Pen ajoute à chaque message de son chat ~50 Ko de consignes (`out/skills/pen-dev/SKILL.md` + `execute.md` + `pen-schema.md`), donne 26 styles prêts (`get_style` : identité, polices, palette, arrondis, imagerie, règles de composition et de « réduction »), génère ou cherche des images (IA, Unsplash, SVG, détourage), a des icônes (Lucide, Phosphor, Material) et des composants, et télécharge des skills de design (`~/.pencil/skills/better-*`, licence MIT, Jakub Krehel). Maquette n'avait qu'une consigne de 7 lignes ; taste-skill n'était ni chargé ni imposé (vrai essai : 0 appel au skill, 2 appels à `verifier_gout`).

## Les 4 chantiers

1. **Passage obligatoire par une direction** pour toute nouvelle page ou section : sujet → direction (style archétype façon Pen OU direction taste-skill tirée) → palette et typo appliquées au document (couleurs nommées, styles de texte) → construction section par section → `capture` + `verifier_gout` après chaque section → liste de contrôle finale.
2. **Consigne permanente du chat** (~2–3 k tokens) : méthode et règles de goût reprises de Pen (pen-dev adapté au schéma Maquette) + règles maison de taste-skill ; le détail (guides par type, styles, skills better-*, références taste-skill) est lu à la demande par un outil `guide`, pas injecté à chaque message. Les mêmes outils servent à Claude Code hors de l'app (MCP).
3. **Images réelles** : outil `images` (recherche Openverse / Wikimedia / musées via taste-skill `assets.mjs`, licences commerciales, crédits gardés) qui télécharge et pose l'image dans la maquette (dossier `assets/` du fichier). Pas de génération IA (pas d'API).
4. **Icônes** : type d'élément `icon` (jeu Lucide embarqué, licence ISC), rendu, export, calques, panneau, MCP. Avec, si le temps le permet, les **dégradés linéaires** en remplissage (souvent utilisés par les styles de Pen).

## Chantier 4 : ce qui est fait

- **Icône** : `{ type: 'icon', icon: 'arrow-right', set: 'lucide', color, strokeWidth }` (24 × 24 par défaut, `name` reste le nom du calque). Jeu `lucide-static` (ISC, version exacte) embarqué : noms et étiquettes (`tags.json`) pour la recherche, tracés (`icon-nodes.json`) pour le rendu SVG inline en `currentColor`, anciens noms Lucide/Feather dans `src/core/icons/lucideAliases.json` (`node scripts/update-lucide-aliases.mjs` après une mise à jour). Nom écrit autrement (`lucide:ArrowRight`, `arrowRight`), ancien (`home` → `house`) ou à suffixe (`trash-2` → `trash`) : ramené au jeu ; inconnu : icône de repli `circle-question-mark` avec une correction signalée, jamais de refus.
- **Dégradé** : un remplissage est une couleur ou `{ type: 'linear', angle, stops: [{ color, position }] }` / `{ type: 'radial', stops }` (angle CSS en degrés, position 0..1, au moins 2 arrêts, couleurs nommées permises dans les arrêts). Format inchangé (version 1) : les anciens fichiers restent valides. Lu aussi depuis `linear-gradient(…)` CSS, Figma (`GRADIENT_LINEAR`, `gradientStops`, couleurs `{r,g,b,a}`) et Pen (`{type:'gradient', gradientType, rotation, colors}`).
- **MCP** : outil `icones({cherche, limite?})` → `{noms:[…]}` (recherche anglais + français courant). Sa description porte aussi la syntaxe de l'icône et du dégradé, pour ne pas allonger celle d'`appliquer` (bornée à 400 caractères). `appliquer` accepte en plus `icon_font`/`iconFontName` (Pen), un nom d'icône dans `name`, `size`, la couleur en `fill`.
- **À la main** : section Icône du panneau (sélecteur avec recherche et grille virtualisée, couleur, épaisseur du trait), entrée « Icône… » du menu des formes et Maj+I (insertion dans le cadre sélectionné ou au centre de la vue) ; dégradé par le bouton de l'en-tête Remplissage (type, angle, arrêts).

## Objectif mesurable

Mêmes briefs que l'utilisateur donnerait à Pen (landing, app web, mobile) → rendu jugé au niveau de Pen par une relecture critique (grille taste-skill `references/critique.md`) sur captures ; itérer sur la consigne jusqu'à y arriver.
