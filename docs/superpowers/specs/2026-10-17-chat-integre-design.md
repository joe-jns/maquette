# Chat Claude intégré — design

Date : 2026-10-17. Statut : validé en conversation (questions 1 à 5), puis « enchaîne ».

## But

Discuter avec Claude sans quitter Maquette : « fais-moi une section tarifs », et Claude dessine dans le
document ouvert pendant qu'on le regarde. Toujours par l'abonnement Claude Code (le `claude` installé),
jamais l'API.

## Décisions

| Sujet | Choix |
| --- | --- |
| Moteur | Un processus `claude` qui reste lancé pendant la conversation (mode `-p` stream-json en entrée et sortie) |
| Droits | Tout ce que Claude Code sait faire ; chaque action sensible demande l'accord dans le chat |
| Dossier de travail | Dossier du fichier `.maquette` ouvert ; dossier personnel pour un document sans titre |
| Place | Panneau à droite du panneau Design, 360 px, Ctrl+L l'ouvre et le ferme |
| Mémoire | Une conversation par fichier, reprise à l'ouverture ; « Nouvelle conversation » repart de zéro |
| V1 | Sélection jointe automatiquement, images collées/glissées, bouton Stop |
| Hors v1 | Choix du modèle/effort, commandes rapides |

## Protocole `claude` (vérifié le 2026-10-17 avec Claude Code 2.1.302)

Lancement :

```
claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages
  --permission-prompt-tool stdio --permission-mode default
  --mcp-config <userData>/chat-mcp.json --allowedTools mcp__maquette
  --append-system-prompt "<consigne Maquette>" [--resume <sessionId>]
```

- `--permission-mode default` est obligatoire : la config de l'utilisateur peut être en
  `bypassPermissions`, et le chat doit quand même demander.
- `--permission-prompt-tool stdio` : les demandes arrivent sur stdout en
  `{"type":"control_request","request_id","request":{"subtype":"can_use_tool","tool_name","input","description"?,"permission_suggestions"?}}`.
  Réponse sur stdin :
  `{"type":"control_response","response":{"subtype":"success","request_id","response":{"behavior":"allow","updatedInput":<input>}}}`
  ou `{"behavior":"deny","message":"Refusé par l'utilisateur"}`. (`--permission-prompts host` seul ne
  suffit pas : sans cet outil, tout est refusé automatiquement.)
- Message utilisateur, une ligne sur stdin :
  `{"type":"user","message":{"role":"user","content":[{"type":"image","source":{"type":"base64","media_type","data"}}…,{"type":"text","text"}]}}`.
- Stop : `{"type":"control_request","request_id":"<id>","request":{"subtype":"interrupt"}}` ; `claude`
  répond `control_response` puis termine le tour par un `result`. Le processus reste vivant.
- Sortie utile : `system/init` (session_id), `stream_event` → `content_block_delta`/`text_delta`
  (texte au fil de l'eau), `assistant` (blocs `text` et `tool_use` complets), `user` (blocs
  `tool_result`), `result` (fin du tour, `is_error`, `session_id`). Le reste (hooks, status,
  thinking_tokens, rate_limit_event…) est ignoré.
- `chat-mcp.json` déclare le serveur `maquette` : `process.execPath` + `out/main/relay.js` (ou
  l'archive de l'app), env `ELECTRON_RUN_AS_NODE=1` (+ `MAQUETTE_USER_DATA` s'il est défini), pour que
  le chat parle toujours à cette Maquette-ci, installée ou de développement.
- Les outils `mcp__maquette__*` sont autorisés d'office (dessiner ne demande rien).

## Architecture

### Principal (`src/main/chat/`)

- `protocol.ts` — pur, testé : `decodeLine(line): ClaudeOut | null` (sortie de `claude` →
  événements du chat) et les encodeurs `userLine`, `permissionLine`, `interruptLine`.
- `chatSession.ts` — un `ChatSession` : lance `claude` (commande remplaçable par
  `MAQUETTE_CLAUDE_CMD`, tableau JSON, pour les tests), lit stdout ligne par ligne, envoie les
  événements à la fenêtre, garde l'ensemble des outils « toujours autorisés » de la conversation,
  relance avec `--resume` si le processus est mort au message suivant, tue le processus à la
  fermeture de la fenêtre ou au changement de conversation.
- `chatStore.ts` — `userData/chats.json` : `{ [clé]: { sessionId, items } }`, clé = chemin du fichier
  ou `"sans-titre"`. Écritures en série, 200 éléments max par conversation, images non stockées (on
  garde « 1 image »).
- `chatIpc.ts` — `chat:open(path)` → historique, `chat:send`, `chat:stop`, `chat:permission`,
  `chat:new` ; événements `chat:event` vers la fenêtre.
- `claude` introuvable (cmd 9009/127, ENOENT) → événement d'erreur avec un texte clair.

### Renderer (`src/renderer/chat/`)

- `chatStore.ts` (Zustand) — ouvert/fermé, éléments affichés, état (`idle | working`), brouillon,
  images en attente, demandes de permission en cours.
- `ChatPanel.tsx` — panneau 360 px à droite du panneau Design (colonne de grille ajoutée quand il est
  ouvert). En-tête (titre, Nouvelle conversation, Fermer), liste des messages (Markdown simple : gras,
  italique, code, listes, liens), lignes d'outils repliables (« ✎ appliquer · 12 éléments »), cartes
  de permission (Autoriser / Toujours pour cette conversation / Refuser), zone de saisie (Entrée envoie,
  Maj+Entrée = nouvelle ligne), vignettes d'images (coller, glisser, retirer), pastille de sélection
  retirable, bouton Envoyer qui devient Stop.
- Contexte joint : la sélection (id, type, nom) est ajoutée en tête du message envoyé à `claude`, pas
  à l'affichage.
- Raccourci Ctrl+L (`toggleChat`), aussi dans le menu Affichage et l'aide.

### Types partagés (`src/shared/chat.ts`)

```ts
export type ChatItem =
  | { kind: 'user'; id: string; text: string; images: number }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string; status: 'running' | 'done' | 'error' }
  | { kind: 'permission'; id: string; requestId: string; tool: string; summary: string; status: 'asking' | 'allowed' | 'denied' }
  | { kind: 'error'; id: string; text: string }

export type ChatEvent =
  | { type: 'item'; item: ChatItem }            // nouvel élément ou remplacement (même id)
  | { type: 'delta'; id: string; text: string } // texte qui s'ajoute à un élément assistant
  | { type: 'busy'; busy: boolean }

export interface ChatSend { text: string; context: string; images: { mediaType: string; data: string }[] }
export type PermissionDecision = 'allow' | 'always' | 'deny'
```

## Erreurs

- `claude` absent : élément d'erreur « Claude Code n'est pas installé… », la saisie reste possible.
- Processus mort en plein tour : erreur affichée, état `idle`, le message suivant relance avec `--resume`.
- Fenêtre rechargée ou fermée : processus tué, demandes de permission en cours refusées.
- `--resume` refusé (conversation introuvable) : on repart sans `--resume` et on le dit.

## Tests

- Vitest : `protocol.ts` (lignes réelles enregistrées), `chatStore.ts` (série, limite, clés).
- e2e : faux `claude` (`e2e/fixtures/fake-claude.mjs`, lancé par `MAQUETTE_CLAUDE_CMD`) qui rejoue un
  scénario : texte au fil de l'eau, appel `appliquer` réel via le relais (un rectangle apparaît), une
  demande de permission (Autoriser puis Refuser), Stop, image jointe reçue, reprise de la conversation
  après relance de l'app.
- Une vérification manuelle avec le vrai `claude` (abonnement).
