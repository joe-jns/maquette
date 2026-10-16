# Enquêtes préalables

Quatre rapports écrits le 2026-10-16 avant de concevoir Maquette, pour comprendre comment
Pen (pen.dev 1.2.16) et Figma sont faits. Chaque point est marqué OBSERVÉ / DÉDUIT / INCONNU
(ou DOCUMENTÉ pour Figma).

| Fichier | Sujet | Sources |
|---|---|---|
| `pen-document-model.md` | Format `.pen`, mise en page, texte, composants, écarts toile/export | `app.asar` de Pen (doc `pen-dev` + éditeur minifié) |
| `pen-canvas-interactions.md` | Caméra, sélection, seuils, magnétisme, annuler, raccourcis, performances | éditeur minifié de Pen |
| `pen-desktop-integration.md` | Agent SDK par abonnement, serveur MCP, IPC, fichiers, sécurité | processus principal de Pen |
| `figma-model-interactions.md` | Modèle, auto layout et combinaisons interdites, texte, interactions, table Figma → CSS | doc publique Figma + `@figma/plugin-typings` 1.142.0 |

Les rapports citent de courts extraits pour prouver un point. Ce sont des références de
compréhension : **aucun code de Pen n'est repris dans Maquette.**
