# Pen 1.2.16 (pen.dev) : intégration bureau, IA et MCP

Enquête en lecture seule sur l'app.asar extrait (`…/scratchpad/pen-editor/full`) et sur l'installation (`%LOCALAPPDATA%\Programs\Pen`). Rien n'a été modifié.

Légende : **OBSERVÉ** = lu dans le code ou sur le disque ; **DÉDUIT** = conclusion raisonnable tirée du code ; **INCONNU** = pas vérifié.

Point de départ important : le processus principal (`out/*.js`) n'est qu'une fine couche. La logique utile se trouve dans des paquets internes `@ha/*` livrés **avec leurs sources TypeScript** dans `node_modules/@ha/{agent,ipc,mcp,shared,…}/src`. C'est là que se trouvent les vraies réponses :
- `@ha/agent/src/claude/index.ts` : lancement de Claude ;
- `@ha/ipc/src/ipc-device-manager.ts` : routage entre agents et documents ;
- `@ha/mcp/dist/index.mjs` : transport MCP et installateur.

---

## 1. Comment l'app lance Claude (Agent SDK)

### Dépendances (OBSERVÉ, `package.json`)
- `@anthropic-ai/claude-agent-sdk` **0.3.293**.
- Le paquet natif `@anthropic-ai/claude-agent-sdk-win32-x64` contient `claude.exe` (256 Mo, soit le CLI Claude Code complet). Il est décompressé hors de l'asar, dans `app.asar.unpacked/node_modules/@anthropic-ai/…`.
- Il y a aussi `@openai/codex-sdk`, un agent Cursor et un agent « pi » (`@earendil-works/pi-coding-agent`) pour les autres fournisseurs.

### Chemin de l'exécutable (OBSERVÉ)
- `claude.js#getClaudeCodePackagePath()` : quand l'app est packagée, il renvoie `app.asar.unpacked/node_modules/@anthropic-ai`.
- `ClaudeAgent.getExecutablePath()` : il prend d'abord `config.executablePath`, sinon `path.join(packagePath, "claude-agent-sdk-win32-x64", "claude")`.
- `executablePath` vient du réglage `claudeExecutablePath` (electron-store). L'utilisateur peut le remplir via l'IPC `agent-browse-executable-path` et `agent-set-executable-path`. Concrètement : **par défaut, Pen utilise SON `claude.exe` embarqué**, et l'utilisateur peut pointer vers son propre `claude`.
- DÉDUIT : le chemin sans `.exe` est résolu par le SDK ou par le spawn Windows. Ce n'est pas vérifié.

### Authentification de l'abonnement (OBSERVÉ, `claude.js#getClaudeCodeEnv`)
```js
const baseEnv = { ...process.env, ANTHROPIC_BETAS: "fine-grained-tool-streaming-2025-05-14" };
switch (loginType) {
  case "api-key":          customFlags.ANTHROPIC_API_KEY = apiKey; break;
  case "aws-bedrock":      customFlags.CLAUDE_CODE_USE_BEDROCK = "1"; break;
  case "google-vertex":    customFlags.CLAUDE_CODE_USE_VERTEX = "1"; break;
  case "microsoft-foundry":customFlags.CLAUDE_CODE_USE_FOUNDRY = "1"; break;
}
```
- Valeur par défaut (`config.js`) : `claudeLoginType: "subscription"`. **En mode abonnement, Pen n'injecte AUCUNE clé** : il transmet simplement `process.env` au `claude.exe`.
- DÉDUIT : le CLI réutilise la connexion existante de l'utilisateur (`claude login`, stockée dans `~/.claude/.credentials.json`). Pen ne gère aucun jeton Anthropic lui-même dans ce mode.
- Piège (DÉDUIT) : `process.env` est hérité tel quel. Si `ANTHROPIC_API_KEY` existe dans l'environnement Windows de l'utilisateur, le CLI la préférera, et c'est alors l'API qui est facturée, plus l'abonnement.
- Il existe aussi un `loginType: "oauth"` pour Claude. Dans ce cas, les modèles passent par l'agent tiers « pi » avec une OAuth Anthropic gérée par Pen (`AgentAuthStore`, `~/.pencil/agent-auth`). Ce n'est **pas** le CLI officiel. À ne pas reproduire.
- Sonde de connexion (`probe()`) : un `query()` avec `model: "claude-haiku-5-5"`, `maxTurns: 1`, `allowedTools: []`, `mcpServers: {}`, un délai max de 45 s, et le prompt « What is 2+2 ». Le résultat `success` donne « connected ». Pour Bedrock, Vertex, Foundry et custom, la sonde est sautée (`external-config`).

### Options de `query()` (OBSERVÉ, `ClaudeAgent.execute`)
| Option | Valeur |
|---|---|
| `model` | id choisi dans l'UI (`claude-opus-5-5`, etc.) ; `undefined` si `custom-model` |
| `pathToClaudeCodeExecutable` | voir plus haut |
| `env` | `getClaudeCodeEnv()` |
| `cwd` | « workspace folder » du document (`device.getWorkspaceFolderPath()`) |
| `settingSources` | `["local","project","user"]` : charge les réglages, hooks et CLAUDE.md de l'utilisateur |
| `mcpServers` | les serveurs de `~/.pencil/mcp.json` + **`pencil`, un serveur MCP *en processus* créé avec `createSdkMcpServer({name:"pencil", tools, alwaysLoad:true})`** |
| `strictMcpConfig` | `true` : ignore les MCP de `~/.claude.json` |
| `allowedTools` | `AskUserQuestion`, `WebSearch`, `WebFetch`, `mcp__pencil__<outil>` pour chaque outil, `mcp__<serveurUtilisateur>` |
| `disallowedTools` | `["Agent"]` (pas de sous-agents natifs) |
| `skills` | `"all"` |
| `systemPrompt` | `{type:"preset", preset:"claude_code", append: <SKILL.md + execute.md + pen-schema.md concaténés>}` |
| `maxTurns` | 500 |
| `thinking` | `{type:"adaptive", display:"summarized"}` |
| `effort` | par défaut `"high"` pour Claude (`DEFAULT_EFFORT_BY_AGENT_TYPE`) |
| `includePartialMessages` | `true` (streaming token par token) |
| `permissionMode` | `"default"` ou `"auto"` ; `bypassPermissions` + `allowDangerouslySkipPermissions` si l'option « dangerously skip » est cochée |
| `canUseTool` | auto-autorise `AskUserQuestion` et tout `file_path` situé dans `cwd`. `Read` est aussi autorisé dans `~/.claude/skills` et `~/.pencil/skills`. Sinon, la demande remonte à l'UI (`permission-request` via IPC, sans délai max) avec trois réponses possibles : `allow`, `switch-to-auto` (appelle `query.setPermissionMode("auto")`) ou `deny` |
| `sessionStore` | `PencilSessionStore` : JSONL dans `~/.pencil/claude-sessions/<sessionId>.jsonl`, indexé par session et **plus par cwd** (migration via `listSessions()` + `importSessionToStore()`) |
| `resume` | `sessionId` si la session existe dans le store |

### Outils MCP « pencil » dans le chat intégré (OBSERVÉ)
- Le chat intégré **n'utilise pas** l'exe Go.
- Les schémas viennent de `@ha/mcp` `toolSchemas` : `get_app_state`, `execute`, `get_style`, `read_skill`, `browser`, `spawn_agents`.
- Chaque gestionnaire appelle `inProcessToolHandler(name, args, toolUseId)`. Celui-ci fait `ipc.request(name.replaceAll("_","-"), {conversationId, id, ...input})` **vers le renderer** (la fenêtre de l'éditeur), puis convertit le résultat en `CallToolResult` (texte, `image` ou `images[]`).
- **C'est le renderer qui exécute les outils** : le modèle du document vit dans la page React + WASM.
- `spawn_agents` n'est actif que si `agentMultiplier > 1`. Les sous-agents perdent `get_app_state` et `spawn_agents`.
- Avant chaque tour, l'app appelle `get-app-state` et ajoute le résultat au prompt utilisateur (`getUserPrompt`), en précisant au modèle qu'il est inutile de le rappeler.

### Streaming (OBSERVÉ)
L'app parcourt les messages du SDK et émet des `session-event`, transmis à l'UI par `ipc.notify("agent-session-event", …)` :
- `start` (sur `system/init`, qui fournit le vrai `session_id`) ;
- `message-start` / `message` (texte cumulé à partir des `text_delta`) ;
- `thinking-start` / `thinking` ;
- `tool-use-start` / `tool-use` / `tool-result` ;
- `usage-update` (jetons cumulés, taille du contexte) ;
- `end` avec `finished`, `failed` ou `stopped`.

Astuce notable : l'app suit les `input_json_delta` de `mcp__pencil__execute` et en extrait progressivement le champ `input` (via `extractJsonStringFieldPrefix`). Le canevas reçoit ainsi `execute-streaming` **pendant que le modèle écrit encore l'appel d'outil**, et l'utilisateur voit le design se construire en direct.

### Annulation et « steer » (OBSERVÉ)
- Le prompt est un `AsyncIterable<SDKUserMessage>` (`UserMessageChannel`). `steer()` y pousse un nouveau message utilisateur **pendant que l'agent travaille** (suivi par `uuid`). Le canal est fermé quand un `result` arrive sans tour en attente.
- `stop()` ferme le canal, appelle `abortController.abort()` puis émet `end/stopped`.
- Fermer un document (`removeResource`) arrête tous les agents de ses conversations.
- À la fermeture de l'app, `ipcDeviceManager.stopAllAgents()` puis `stopMCPTransport()`.

### Historique côté UI (OBSERVÉ)
- Les conversations de l'UI sont stockées séparément dans `~/.pencil/sessions/<conversationId>.json` (écriture tmp puis rename) et purgées après 20 jours (`chat-sessions-load/save/delete`).
- Les transcripts du SDK sont dans `~/.pencil/claude-sessions/`.

---

## 2. Architecture MCP (agents externes : Claude Code CLI, Codex, etc.)

### Schéma (OBSERVÉ)
```
Claude Code CLI ──stdio (MCP JSON-RPC)──► mcp-server-windows-x64.exe  (Go, mark3labs/mcp-go)
                                              │  named pipe \\.\pipe\pencil-desktop
                                              │  messages node-ipc : {"type":"tool_request","data":{…}}\f
                                              ▼
                              Pen main process : MCPSocketServer (@node-ipc/node-ipc)
                                              │  MCPTransport.handleIPCRequest → getIPC(filePath)
                                              ▼
                              IPCElectron(webContents) ─ ipc.request(name, params, timeout_ms)
                                              ▼
                              Renderer de l'éditeur (exécute l'outil sur le document)
```
- L'exe est un binaire Go (`github.com/highagency/ha/servers/mcp/{tools,transport}`, `mark3labs/mcp-go`, `Microsoft/go-winio`). Chaînes vues : `\\.\pipe\pencil-%s`, `{"type":"tool_request","data":%s}%c`, `{"type":"agent_connected","data":%s}%c`, `[TransportClient] received handshake-ack`, `[MCP] Starting server in stdio mode`.
- Côté Pen (`@ha/mcp`, `getSocketPath`) : `pencil-desktop` sous Windows (node-ipc le transforme en named pipe), et `~/.pencil/socket/pencil-desktop.sock` sous macOS/Linux. Il n'y a **ni port TCP, ni HTTP, ni websocket**.
- Poignée de main : à la connexion, le serveur envoie `tool_response {request_id:"client-id-assignment", client_id:<uuid>}`. Le client répond `agent_connected {agent, client_id}`, ce qui alimente la liste « agents connectés » de l'UI (`connected-agents-changed`).
- Requête : `tool_request {request_id, client_id, name, payload:{filePath?, …}, timeout_ms}`. Réponse : `tool_response {client_id, request_id, success, result, error}`.
- Arguments de l'exe (`getMcpConfiguration`) : `--app desktop [--conversation_id X] [--enable_spawn_agents] [--agent <intégration>]`.

### Choix de la fenêtre ou du document (OBSERVÉ, `IPCDeviceManager.getIPC`)
1. Si `filePath` correspond exactement à l'URI d'un document ouvert, ce document est pris.
2. Sinon, l'app cherche un document dont `getFileURIForPath(filePath)` correspond, en préférant le dernier document focalisé en cas d'égalité.
3. Sinon, elle prend le **dernier document focalisé** (`lastFocusedResource`, mis à jour sur `window-focused`).
4. Sinon, elle renvoie l'erreur « A file needs to be open in the editor to perform this action. »

Dans le serveur Go, `filePath` est facultatif sur tous les outils (« An optional file path to access a .pen file »).

### Rôle de `desktop-mcp-adapter.js` (OBSERVÉ)
C'est un simple adaptateur pour l'installateur `@ha/mcp` :
- il fournit le chemin d'installation (`APP_FOLDER_PATH`), `appName = "desktop"` et `appData` ;
- il liste les intégrations prises en charge : `claudeCodeCLI, codexCLI, geminiCLI, antigravity, openCodeCLI, kiroCLI, claudeDesktop` ;
- `setupIntegrations()` est appelé à chaque `mcp-transport-ready`, donc à **chaque démarrage**. Il **retire** l'entrée `pencil` de toutes les intégrations, puis la **réinstalle** pour celles qui sont activées (toutes par défaut, sans consentement explicite) ;
- `toggleIntegration` sert à l'interrupteur de l'UI.

### Inscription dans les configs (OBSERVÉ, `@ha/mcp installMCP`)
- Fichiers ciblés :
  - `~/.claude.json` (`mcpServers.pencil`, `type:"stdio"`) ;
  - `~/.codex/config.toml` (`mcp_servers.pencil`, sans `env`) ;
  - `~/.gemini/settings.json` ;
  - `~/.config/opencode/opencode.json` (`mcp.pencil`, `type:"local"`, commande sous forme de tableau) ;
  - `~/.kiro/settings/mcp.json` ;
  - `%APPDATA%\Claude\claude_desktop_config.json`, etc.
- Fusion : `{...existant, ...nouvelleConfig}`. Le fichier est réécrit en `JSON.stringify(…, null, 2)`, donc **tout `~/.claude.json` est réécrit**, sans écriture atomique.
- Pour Claude Code, l'installateur ajoute aussi `"mcp__pencil"` dans `~/.claude/settings.json > permissions.allow`. Les appels aux outils pencil ne demandent donc jamais confirmation. Il retire cette règle à la désinstallation.
- Constaté chez l'utilisateur (lecture ciblée, aucun secret affiché) : `~/.claude.json` contient, au niveau global :
  ```json
  "pencil": { "command": "C:\\Users\\micro\\AppData\\Local\\Programs\\Pen\\resources\\app.asar.unpacked\\out\\mcp-server-windows-x64.exe",
              "args": ["--app","desktop","--agent","claudeCodeCLI"], "env": {}, "type": "stdio" }
  ```
  Aucune entrée par projet. `~/.claude/settings.json` contient bien `mcp__pencil` dans `allow`.
- Cursor : ce n'est pas du MCP. `ide.js` propose d'installer l'extension `highagency.pencildev` via `cursor:extension/…`.
- `get-mcp-config` (IPC) renvoie la config JSON pour un copier-coller manuel.
- `~/.pencil/mcp.json` : MCP supplémentaires de l'utilisateur, injectés dans le chat intégré. Le nom `pencil` y est réservé.

---

## 3. IPC Electron

### preload.js (OBSERVÉ, intégral)
`contextBridge.exposeInMainWorld` expose :
- `PENCIL_APP_NAME = "Electron"`, `PENCIL_ARCH`, `IS_DEV` ;
- `electronAPI.sendMessage(msg)` : `ipcRenderer.send("ipc-message", msg)` ;
- `electronAPI.onMessageReceived(cb)` : écoute `"ipc-message"` ;
- `electronAPI.resolveFilePath(file)` : `webUtils.getPathForFile(file)` (chemin réel d'un fichier glissé-déposé) ;
- `electronAPI.initParams` : JSON passé par `additionalArguments: --init-params=…`.

**Il n'y a qu'un seul canal Electron.** Tout passe par un protocole RPC maison multiplexé (`@ha/shared IPCHost`) : `{id, type:"request"|"response"|"notification", method, payload, error}`, avec un délai max de 60 s par défaut (`-1` = pas de limite, utilisé pour `permission-request`).

### Méthodes enregistrées par le main (OBSERVÉ, `app.js#openFile`, liste non exhaustive)
- **Fenêtre et app** : `get-fullscreen`, `reload-window`, `toggle-theme`, `set-native-theme`, `open-dashboard`, `show-about`, `desktop:take-initial-prompt`, `initialized`.
- **MCP** : `get-active-integrations`, `toggle-mcp-integration`, `get-mcp-config`, `agent-mcp-config-get/set` (`~/.pencil/mcp.json`).
- **Agents** : `agent-set-api-key`, `agent-set-executable-path`, `agent-browse-executable-path`, `agent-set-use-http1`, `agent-oauth-login/logout`, `custom-provider-set/remove`, `desktop-open-terminal` (écrit un `.bat` `cd /d <dossier>` + `claude` dans `%TEMP%`, puis `start cmd.exe /k`).
- **Espace de travail** : `change-workspace-folder`, `open-workspace-folder`.
- **Skills** : `skills-list`, `skills-add`, `skills-remove`.
- **Chat** : `chat-sessions-load`, `chat-session-save`, `chat-session-delete`, `chat-active-conversation-changed`.
- **Divers** : `save-preview`, `share-upload-changed`, `browser-previews-cleanup`, navigateur intégré et import (`setupBrowserImport`, `registerBrowserNodeIpc`), mises à jour (`desktop-update-install`, `set-install-on-app-quit`).
- **Requêtes du main vers le renderer** : `serialize`, `get-app-state`, `execute`, `get-style`, `read-skill`, `browser`, `spawn-agents`, `permission-request`.
- **Notifications du main vers le renderer** : `agent-session-event`, `execute-streaming`, `spawn-agents-streaming`, `agent-config-changed`, `connected-agents-changed`, `auto-save-failed`, `file-changed`, `workspace-folder-changed`, `prompt-agent`, `desktop-update-ready`, `fullscreen-change`.

Dans `IPCDeviceManager` (`submit-prompt`, `invokeAgent`, etc.), d'autres méthodes s'ajoutent : lancer ou arrêter un agent, `steer`, etc.

---

## 4. Fichiers .pen, sauvegardes, documents

### Format (OBSERVÉ)
- **Les .pen ne sont PAS chiffrés.** C'est du **JSON texte** (`{"version":"2.19","children":[{"type":"frame",…`), lu en `utf8` par `loadDocument` et écrit tel quel.
- Aucune trace de chiffrement dans le code main ni dans `@ha/*`.
- La phrase « .pen files are encrypted: access them only via the MCP tools — never use Read or Grep on .pen files » vient **uniquement des instructions du serveur MCP**. C'est une consigne destinée aux agents pour qu'ils passent par l'éditeur, ce qui garde la cohérence du document ouvert et de son état non sauvegardé. Ce n'est pas un vrai chiffrement.
- Le schéma est publié dans `@ha/schema/pen.schema.json` + `generated-schema.md`. Les fichiers d'exemple sont dans `out/data/*.pen`.

### Écriture (OBSERVÉ, `file-io.js`)
`writeFileAtomic` :
- crée un fichier temporaire caché `.<nom>.<uuid>.tmp` dans le même dossier (ouverture `wx`) ;
- recopie le mode, fait un `fsync`, puis un `rename` ;
- `renameWithRetry` réessaie 3 fois avec 100 ms d'écart sur `EPERM/EBUSY/EACCES`, pour gérer un antivirus ou l'indexeur Windows qui tient le fichier ;
- `fsync` du dossier, sauf sous Windows ;
- suit les liens symboliques (`realpath`).

### Types de documents et sauvegarde automatique (OBSERVÉ, `@ha/shared open-document.ts`)
- **Managed** (brouillons « Untitled » dans `~/.pencil/documents/<uuid>/untitled.pen`, avec sous-dossiers `images/` et `exports/`) : sauvegarde automatique **dans le fichier lui-même**.
- **File** (fichier choisi par l'utilisateur) : sauvegarde automatique **dans une copie** `~/.pencil/backup/<sha1(fileURI)>`. Le vrai fichier n'est écrit que sur Save, et le document reste « sale » d'ici là.
- **Bundled** (exemples livrés) : lecture seule, aucune sauvegarde automatique.
- Rythme : `AUTO_SAVE_THROTTLE_MS = 5000` (au plus une sauvegarde toutes les 5 s pendant l'édition). La sérialisation est demandée au renderer (`ipc.request("serialize")`), avec une file de tâches pour sérialiser et une autre pour écrire.
- Récupération (`load-document.js`) : si la copie est plus récente que le fichier et différente, elle est chargée avec `source = RecoveredBackup`, et le document est marqué sale. Sinon, la copie est supprimée.
- Si le renderer plante (`render-process-gone`), l'app écrit le dernier instantané connu (`writeLastSnapshot`) et propose de recharger. `will-prevent-unload` est neutralisé ; la fermeture passe par `requestClose()` (Enregistrer / Ignorer / Annuler).
- Surveillance du disque : `chokidar` sur le fichier ouvert (`awaitWriteFinish` 100 ms), puis notification `file-changed`.
- « Enregistrer sous » refuse d'écrire dans `~/.pencil/*`. Si le dossier de travail change, les ressources sont copiées dans un nouveau dossier d'assets et les références sont réécrites.

### Documents récents et état (OBSERVÉ)
- `%APPDATA%\Pen\recent-documents.json`, 200 entrées au maximum.
- Réglages : electron-store, `%APPDATA%\Pen\config.json` (avec migration depuis l'ancien dossier `Pencil`).
- Session du compte pen.dev : `~/.pencil/session-desktop.json`.
- Une seule instance de l'app (`requestSingleInstanceLock`). Un `.pen` passé en argument à une seconde instance est ouvert dans la première.

### « Snapshots » (OBSERVÉ, `snapshot-store.js`)
Ce n'est **pas** un historique de versions. C'est un tampon temporaire, à usage unique (16 entrées au maximum), pour des captures brutes de plusieurs Mo. Le renderer les récupère par `fetch("pencil://snapshot/<id>")` plutôt que par l'IPC, qui recopierait les données à la sérialisation et ferait saccader l'UI. Le protocole `pencil://` sert aussi `editor/` et `preview/`, avec une protection contre la sortie du dossier (path traversal).

---

## 5. Export PNG et aperçus

- **Rendu du design** (DÉDUIT, fort) : il se fait dans le renderer avec un moteur maison compilé en WASM (`editor/assets/pencil-*.wasm`, 9,5 Mo), qui contient Skia (`third_party/skia`, « Skia/PDF m149 »). L'export d'images ou de PDF du design se fait donc côté renderer. Le chemin d'export précis n'a pas été tracé (INCONNU).
- **Miniatures du tableau de bord** (OBSERVÉ) : le renderer envoie `save-preview {image: Uint8Array}`. Le main écrit `~/.pencil/previews/<id>.png` (tmp puis rename). L'id est l'uuid du dossier pour un document managed, sinon `sha256(chemin)[0:32]`. Le fichier est servi via `pencil://preview/<fichier>.png`, avec un nom filtré par l'expression régulière `^[a-zA-Z0-9._-]+\.png$`.
- **`png-encode-worker.js`** (OBSERVÉ) : il sert **uniquement aux captures du navigateur intégré** (`browser-node-capture.js`), pas au design.
  - Un `worker_thread` reçoit un bitmap BGRA brut de `capturePage` ou CDP (transféré sans copie) ;
  - il annule la prémultiplication de l'alpha, passe en RGBA, écrit IHDR, `zlib.deflateSync` niveau 3 et le CRC à la main ;
  - si l'écran est en P3 (`display.colorSpace` contient « p3 »), il insère un **chunk iCCP « Display P3 »** déjà prêt (`png-display-p3.js`, en base64) juste après IHDR ;
  - une page entière se capture en tranches de 4096 px, 16 tranches au maximum. Pour l'agent, l'image est réduite à 1568 px maximum et encodée en JPEG.

---

## 6. Skills

OBSERVÉ (`skills-manager.js`, `desktop-resource-device.js`) :
- **Skill interne `pen-dev`** livré dans `out/skills/pen-dev/` (`SKILL.md`, `execute.md`, `generate.md`, `pen-schema.md`, `scripts-and-shaders.md`, `guide/`).
  - Pour le chat intégré, `SKILL.md + execute.md + pen-schema.md` sont **ajoutés au system prompt** (`getSystemPrompt`).
  - Pour les agents externes, c'est l'outil MCP `read_skill` qui lit ces fichiers (`readSkillFile`, protégé contre la sortie du dossier).
  - **Pen n'écrit rien dans `~/.claude/skills`.**
- **Bundle de skills distant** :
  - au démarrage, l'app télécharge `https://hctfc8iexhqk0x3o.public.blob.vercel-storage.com/skills/latest.json` et vérifie `minDesktopAppVersion` (semver) ;
  - si la version change, elle télécharge le zip, l'extrait dans `~/.pencil/.skills-staging`, puis le bascule par renommage dans `~/.pencil/skills` (l'ancien passe par `.skills-old`) ;
  - **aucune signature ni hash n'est vérifié** (seulement HTTPS).
- **Skills personnalisés** : l'utilisateur choisit un `SKILL.md` ou son dossier, et le chemin est stocké dans `customSkills`. Le frontmatter YAML (`description`, `author`) est analysé. Les skills choisis dans le chat sont ajoutés au message comme pièces jointes texte.
- Le SDK reçoit en plus `skills: "all"` et `settingSources` utilisateur, donc les skills de `~/.claude/skills` sont aussi disponibles, et `Read` y est auto-autorisé.

---

## 7. Mises à jour, logs, sécurité

- **Mises à jour** (OBSERVÉ) : `electron-updater` (dépôt GitHub `highagency/pen-desktop-releases`).
  - Vérification au démarrage puis toutes les 30 min ; téléchargement automatique, mais `autoInstallOnAppQuit=false`.
  - Installation à la fermeture seulement si l'utilisateur l'a demandé (`installOnAppQuit`), via `quitAndInstall` dans `will-quit`. Les erreurs réseau `NET::ERR` sont ignorées.
- **Logs** (OBSERVÉ) : `electron-log`, niveau fichier `debug` (DÉDUIT : `%APPDATA%\Pen\logs\main.log`). Sentry est activé hors dev avec `sendDefaultPii: true` (IP et identifiant utilisateur envoyés).
  - Attention : le log `debug` inclut les entrées des outils (`"[IPC] in-process MCP tool call"`, `"Claude permission request" toolName, input`) et les messages complets de l'agent. Le contenu des designs et des prompts finit donc dans les logs.
- **Fenêtres** (OBSERVÉ) :
  - `nodeIntegration:false`, `contextIsolation:true`, preload minimal, `webviewTag:true` (navigateur intégré, partition `persist:pencil-browser-view`, avec un preload dédié forcé dans `will-attach-webview` et `nodeIntegrationInSubFrames` pour faire tourner ce preload dans les sous-frames).
  - `sandbox` n'est pas défini explicitement. DÉDUIT : c'est le défaut d'Electron (≥ 20), donc sandbox actif, ce qui est compatible avec ce preload.
  - `setWindowOpenHandler` : les liens http(s) partent dans le navigateur système, **tout le reste est autorisé**.
  - Il n'y a pas de handler `will-navigate`, ni de vérification de `params.src` dans `will-attach-webview`.
- **Vérification de l'expéditeur IPC** (OBSERVÉ, `ipc-electron.js`) : seule la condition `event.sender.id === webContents.id` filtre les messages (un `IPCElectron` par fenêtre). La frame et l'origine ne sont pas vérifiées. Les chemins venant du renderer sont traités comme non fiables à certains endroits (`cleanupTempFiles` se limite à `%TEMP%\pencil-clipboard`, previews filtrées par regex, `readSkillFile` protégé contre la sortie du dossier).
- **Named pipe MCP** (DÉDUIT) : il n'y a **aucune authentification** sur `\\.\pipe\pencil-desktop` (pas de jeton, pas de vérification du client). Tout processus local de l'utilisateur peut piloter le document ouvert, y compris l'outil `execute`, qui exécute un **extrait JavaScript** dans l'éditeur.
- **Config des tiers** : réécriture à chaque démarrage de `~/.claude.json`, de `~/.claude/settings.json` et des configs Codex, Gemini, etc. Toutes les intégrations sont activées par défaut, et l'outil est auto-autorisé (`mcp__pencil`).

---

## Recommandations pour Maquette

### A. Brancher Claude Code par abonnement, proprement
1. **Utiliser `@anthropic-ai/claude-agent-sdk` `query()` en pointant `pathToClaudeCodeExecutable` vers le `claude` déjà installé de l'utilisateur** (détecté avec `where claude`, réglable dans l'UI comme Pen le permet). On évite d'embarquer 256 Mo, et l'utilisateur reste sur sa version et sa connexion. On peut garder en secours le binaire du paquet natif.
2. **Construire `env` soi-même sans clé** : partir de `process.env`, puis **supprimer `ANTHROPIC_API_KEY` et `ANTHROPIC_AUTH_TOKEN`** (et `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`) avant le spawn. C'est la garantie que la facturation passe par l'abonnement : Pen ne le fait pas, et une clé dans l'environnement ferait basculer silencieusement sur l'API.
3. **Vérifier au lancement** avec une sonde à la Pen (`maxTurns:1`, `allowedTools:[]`, petit modèle). Afficher clairement « connecté via abonnement » ou « lancez `claude login` ». Le message `system/init` et le message `result` (`total_cost_usd`, `modelUsage`) permettent de contrôler ce qui s'est passé.
4. **Options conseillées** :
   - `systemPrompt: {type:"preset", preset:"claude_code", append: <guide Maquette>}` ;
   - `mcpServers: { maquette: createSdkMcpServer(...) }` **en processus**, avec les mêmes définitions d'outils que le serveur externe ;
   - `strictMcpConfig: true` ;
   - `allowedTools` explicites (`mcp__maquette__*`) et `disallowedTools: ["Agent"]` au début ;
   - `includePartialMessages: true` ;
   - `canUseTool` qui remonte à l'UI, avec un délai max (Pen n'en a pas) ;
   - `cwd` = dossier du projet ;
   - `settingSources` : décider sciemment. `["user"]` charge les hooks et le CLAUDE.md de l'utilisateur. C'est utile, mais cela peut injecter des comportements inattendus dans le chat de l'app.
5. **Prompt sous forme de flux** (`AsyncIterable`) dès le départ : on obtient gratuitement le « steer » (ajouter une consigne pendant que l'agent travaille) et un arrêt propre (`close()` + `AbortController`).
6. **Sessions** : soit `resume` + les JSONL natifs de `~/.claude/projects`, soit un `sessionStore` maison indexé par `sessionId` comme Pen. Le store maison évite qu'une conversation se perde quand le `cwd` change.
7. **Rester sur le CLI officiel.** Ne pas reproduire l'option « oauth via pi » de Pen, qui réutilise l'OAuth Anthropic hors de Claude Code.

### B. Architecture MCP conseillée
- **Une seule définition d'outils, deux transports** :
  - (1) **serveur MCP en processus** pour le panneau chat ;
  - (2) **serveur MCP externe en stdio** pour Claude Code. Il peut être un simple script Node lancé par `node`, pas forcément un binaire Go. Il se connecte à l'app ouverte.
- **Transport app ↔ serveur externe** : un named pipe (`\\.\pipe\maquette-<user>`) ou un socket Unix, comme Pen, **mais avec un jeton**. Au démarrage, l'app écrit un jeton aléatoire dans `%APPDATA%\Maquette\mcp-token` (fichier lisible par l'utilisateur seul), et le serveur MCP le présente à la poignée de main. Sur Windows, on peut aussi poser une DACL sur le pipe. Éviter un port TCP local sans auth (n'importe quelle page web pourrait tenter de s'y connecter).
- **Protocole** : des trames JSON `{id, method, params}` / `{id, result|error}` délimitées par des sauts de ligne, avec `timeout_ms` par requête. Prévoir un message `hello {agent, version}` pour afficher « Claude Code connecté » dans l'UI, comme Pen.
- **Choix du document** : un paramètre `filePath` facultatif sur chaque outil, sinon le dernier document focalisé. Renvoyer une erreur explicite si aucun document n'est ouvert, et **inclure le document ciblé dans chaque réponse**, pour que l'agent sache où il écrit.
- **Exécution dans le renderer** : comme Pen, le main ne fait que router vers la fenêtre qui détient le modèle du document. Garder un seul canal IPC multiplexé (requête/réponse/notification avec id et délai max). C'est simple et testable.
- **Outils** : peu d'outils et des outils larges. Pen n'en a que cinq : un `get_app_state` riche, un `execute` (lot d'opérations), `get_style`, `read_skill` et une capture d'écran. Mieux vaut un `apply_ops` déclaratif et validé par schéma qu'un `eval` JavaScript, qui serait trop risqué sur un pipe ouvert.
- **Contexte préchargé** : comme Pen, ajouter l'état de l'app au premier message du chat intégré. Cela économise un aller-retour d'outil.
- **Rendu en direct** : extraire progressivement les `input_json_delta` de l'outil d'écriture pour prévisualiser les opérations avant la fin de l'appel. C'est ce qui donne l'effet « le design se dessine ».

### C. Inscription dans Claude Code
- **Ne pas réécrire `~/.claude.json` à la main.** Utiliser `claude mcp add --scope user maquette -- node "<chemin>\mcp-server.js"` (et `claude mcp remove`), ou proposer un bouton « Copier la commande ». Le faire **sur action de l'utilisateur**, une seule fois, et pas à chaque démarrage comme Pen.
- Si on veut éviter les demandes de permission, proposer d'ajouter `mcp__maquette` à `permissions.allow`, **sans le faire d'office**.
- Une instruction MCP (champ `instructions` du serveur) peut indiquer à l'agent de ne pas lire les fichiers projet directement. Il faut l'écrire honnêtement (« passer par les outils pour rester synchrone avec l'éditeur ») plutôt que de prétendre qu'ils sont chiffrés.

### D. Fichiers et robustesse (à reprendre, ce sont de bonnes pratiques)
- Écriture atomique (tmp dans le même dossier, `fsync`, `rename` avec 3 tentatives sur EPERM/EBUSY sous Windows).
- Sauvegarde automatique limitée à une toutes les 5 s, dans une copie séparée pour les fichiers de l'utilisateur, directement dans le fichier pour les brouillons gérés par l'app. Récupération au chargement si la copie est plus récente.
- `chokidar` pour détecter une modification externe (par exemple par Claude Code via son outil Edit).
- Gros binaires (captures) servis par un protocole personnalisé plutôt que par l'IPC.
- Un seul `writeFileAtomic` partagé, et des réglages dans un fichier JSON tolérant à la corruption.

### E. Pièges relevés chez Pen à éviter
1. Clé API héritée de `process.env`, qui fait facturer l'API au lieu de l'abonnement.
2. Pipe MCP sans authentification, combiné à un outil qui exécute du JS.
3. Réécriture silencieuse de configs tierces à chaque démarrage, avec intégrations activées par défaut.
4. Bundle de skills téléchargé sans vérification d'intégrité.
5. Logs `debug` qui contiennent prompts et designs, plus Sentry avec PII.
6. `permission-request` sans délai max : un agent peut rester bloqué si l'UI ne répond pas.
7. `setWindowOpenHandler` qui autorise les schémas non http.
8. `settingSources: ["user"]` qui importe hooks et CLAUDE.md dans le chat de l'app ; à choisir en connaissance de cause.
9. Chemin de l'exe : sous Windows, vérifier l'extension `.exe` et l'existence du fichier avant `query()`, et afficher une erreur claire.
