# Annuler toute la réponse de Claude + historique de versions

Validé par l'utilisateur le 2026-10-31 (« fait ça »). Chantier 1 de `docs/roadmap.md`.

## Règles du chantier

- Interface en anglais, commentaires et messages de commit en français, un commit par changement,
  pas de ligne Co-Authored-By, jamais de push.
- Tests GUI hors écran, jamais de focus, une suite e2e à la fois.
- Budget des définitions d'outils MCP (`tests/mcp/tokenBench.test.ts`, < 8000 caractères) : rien à ajouter côté MCP.

## A. Annuler toute la réponse de Claude

1. **Groupes dans l'historique** (`src/core/history.ts`) : `HistoryEntry` gagne `group?: string`. `push`
   fusionne l'entrée avec la précédente si elles ont le même `group` (patchs = anciens puis nouveaux ;
   patchs inverses = nouveaux inverses puis anciens inverses), le libellé reste celui du groupe. Une entrée
   sans groupe, ou d'un autre groupe, ferme le groupe. `undo`/`redo` restent d'une entrée : un Ctrl+Z annule
   toute la réponse, Ctrl+Y la refait. Ajouter de quoi savoir où est un groupe dans la pile (ex.
   `depthOf(group)` : nombre d'entrées au-dessus, `null` s'il n'est plus dans `past`).
2. **Groupe d'une réponse du chat intégré** : chaque envoi de l'utilisateur ouvre un groupe
   `claude:<id du tour>` ; toutes les modifications faites par les outils pendant ce tour (host.apply dans
   `src/renderer/mcp/host.ts`) y vont, avec le libellé « Claude: <début de la demande> ». Le groupe se
   termine à la fin du tour (`busy` à false). Trouver dans `src/renderer/chat/chatStore.ts` et le
   principal (`src/main/chat/*`) comment savoir qu'un tour est en cours et lequel ; un appel d'outil venu
   d'un Claude Code extérieur pendant un tour du chat ne doit pas tomber dans ce groupe si on peut les
   distinguer (sinon : documenter le choix).
3. **Claude Code extérieur (MCP)** : pas de tours. Ses modifications successives forment un groupe
   `mcp:<n>` qui se ferme dès que l'utilisateur fait une modification lui-même (dispatch sans groupe,
   geste validé) ; le suivant ouvre `mcp:<n+1>`.
4. **Bouton « Undo » sous chaque réponse de Claude** qui a modifié le document (et seulement si son groupe
   est encore dans l'historique). Clic : si le groupe est au sommet, un undo. S'il y a des entrées
   au-dessus (l'utilisateur ou une réponse suivante a modifié après), question de l'app (`ask` de
   `src/renderer/dialog/dialogStore.ts`) : « Undo this reply? » / « Changes made after it will be undone
   too. » / Undo (danger) / Cancel ; Undo = autant d'undo que nécessaire. Le bouton disparaît une fois le
   groupe annulé (il revient si on refait). Les tours relus depuis une conversation enregistrée (ancienne
   session) n'ont pas de bouton.
5. Undo/redo pendant un tour en cours : permis comme aujourd'hui (pas de nouveau verrou).

## B. Historique de versions

1. **Stockage** (principal) : `<userData>/versions/<empreinte du chemin>/` avec l'empreinte de
   `thumbHash` (`src/main/thumbModel.ts`). Un `index.json` (liste : id, nom, date, `auto: boolean`,
   taille) et un fichier par version (texte du document sérialisé, `<id>.maquette`). Document jamais
   enregistré : pas de versions (la fenêtre le dit : « Save the file to keep versions. »).
   Automatiques : 50 au plus par fichier, les plus anciennes effacées ; nommées : jamais effacées
   automatiquement.
2. **Version automatique** avant chaque réponse du chat intégré qui modifie le document : prise juste
   avant la première modification du tour (pas à l'envoi : une réponse sans modification n'en crée pas),
   nom = « Before Claude: <début de la demande> » (60 caractères au plus).
3. **Fenêtre « Version history »** : menu File → « Version history… » (Ctrl+Alt+H si libre, sinon
   pas de raccourci) et commande de la palette d'aide si elle existe. Modal de la même mécanique que
   Variables/Components. Liste du plus récent au plus ancien : nom, date relative (« 5 min ago »,
   réutiliser `src/renderer/chat/dates.ts` si adapté), étiquette « Auto » pour les automatiques ; aperçu de
   la version sélectionnée (rendu de la première page ou de son premier cadre, avec le rendu existant
   `renderNode`/aperçus de l'accueil — choisir le plus simple qui marche). Boutons : « Save version… »
   (nom demandé, défaut « Version <date> »), « Restore », « Rename », « Delete ».
4. **Restaurer** = remplacer le document courant par la version en **une seule étape annulable** (un
   dispatch d'opérations qui remplace pages/variables, ou une entrée d'historique avec patchs racine — le
   plus simple qui garde Ctrl+Z). Le document devient modifié (dirty), l'enregistrement automatique suit
   son cours. Avant de restaurer, une version automatique « Before restore » est prise.
5. Fichier renommé/déplacé par « Save as » dans l'app : les versions suivent (copier le dossier vers la
   nouvelle empreinte). Hors de l'app : perdues (assumé, dit à l'utilisateur).

## Tests

- Unitaires : groupes de `History` (fusion, fermeture, undo/redo du groupe entier, `depthOf`), stockage
  des versions (index, plafond de 50 automatiques, nommées gardées, renommer/supprimer, déplacement).
- e2e (`e2e/claude-undo-versions.spec.ts`, avec le faux `claude` des e2e chat existants,
  `MAQUETTE_CLAUDE_CMD`) : une réponse qui crée plusieurs calques → un Ctrl+Z les retire tous, Ctrl+Y les
  remet ; bouton Undo sous la réponse ; modification de l'utilisateur après → question, Cancel ne change
  rien, Undo retire tout ; version automatique créée avant la réponse, visible dans la fenêtre, restaurée
  puis annulée par Ctrl+Z ; version nommée créée, renommée, supprimée.
- À la fin : `npm run typecheck`, `npx vitest run`, la suite e2e complète une fois (une à la fois).
