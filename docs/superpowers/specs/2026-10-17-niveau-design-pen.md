# Niveau de design « comme Pen » — design

Date : 2026-10-17. Demande : « lance les 4 … je veux vraiment qu'on arrive au même niveau de design que quand j'utilise Pen ». On peut reprendre les skills de Pen (usage perso) et ajouter taste-skill.

## Constat (lecture de Pen 1.2.18)

Pen ajoute à chaque message de son chat ~50 Ko de consignes (`out/skills/pen-dev/SKILL.md` + `execute.md` + `pen-schema.md`), donne 26 styles prêts (`get_style` : identité, polices, palette, arrondis, imagerie, règles de composition et de « réduction »), génère ou cherche des images (IA, Unsplash, SVG, détourage), a des icônes (Lucide, Phosphor, Material) et des composants, et télécharge des skills de design (`~/.pencil/skills/better-*`, licence MIT, Jakub Krehel). Maquette n'avait qu'une consigne de 7 lignes ; taste-skill n'était ni chargé ni imposé (vrai essai : 0 appel au skill, 2 appels à `verifier_gout`).

## Les 4 chantiers

1. **Passage obligatoire par une direction** pour toute nouvelle page ou section : sujet → direction (style archétype façon Pen OU direction taste-skill tirée) → palette et typo appliquées au document (couleurs nommées, styles de texte) → construction section par section → `capture` + `verifier_gout` après chaque section → liste de contrôle finale.
2. **Consigne permanente du chat** (~2–3 k tokens) : méthode et règles de goût reprises de Pen (pen-dev adapté au schéma Maquette) + règles maison de taste-skill ; le détail (guides par type, styles, skills better-*, références taste-skill) est lu à la demande par un outil `guide`, pas injecté à chaque message. Les mêmes outils servent à Claude Code hors de l'app (MCP).
3. **Images réelles** : outil `images` (recherche Openverse / Wikimedia / musées via taste-skill `assets.mjs`, licences commerciales, crédits gardés) qui télécharge et pose l'image dans la maquette (dossier `assets/` du fichier). Pas de génération IA (pas d'API).
4. **Icônes** : type d'élément `icon` (jeu Lucide embarqué, licence ISC), rendu, export, calques, panneau, MCP. Avec, si le temps le permet, les **dégradés linéaires** en remplissage (souvent utilisés par les styles de Pen).

## Objectif mesurable

Mêmes briefs que l'utilisateur donnerait à Pen (landing, app web, mobile) → rendu jugé au niveau de Pen par une relecture critique (grille taste-skill `references/critique.md`) sur captures ; itérer sur la consigne jusqu'à y arriver.
