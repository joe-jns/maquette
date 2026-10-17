# Maquette — Plan 6 : fichiers sûrs et installateur Windows

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ne jamais perdre de travail et installer Maquette comme une vraie app Windows : copie de secours toutes les 5 s et récupération au démarrage, question à la fermeture s'il reste des changements, avertissement quand le fichier change sur le disque, fichiers récents, une seule fenêtre (double-clic sur un `.maquette` = ouverture dans l'app déjà lancée), installateur NSIS avec association de l'extension `.maquette` et icône.

**Architecture:** Deux modules purs côté principal, testés sans Electron : `src/main/backup.ts` (copies de secours dans un dossier, une par document) et `src/main/recent.ts` (liste des fichiers récents). La surveillance du fichier est un petit module (`src/main/watch.ts`) qui ignore nos propres écritures (empreinte du dernier contenu écrit). Le principal garde l'état « modifié » envoyé par la fenêtre pour poser la question à la fermeture. L'installateur est fait par electron-builder 26.15.3 ; `vendor/taste-skill` est livré en `extraResources`, le relais MCP reste dans l'archive de l'app (Electron en mode Node sait lire l'asar).

**Spec:** §11 (Fichiers), §13 (Erreurs), §9 (connexion Claude Code dans l'app installée).

## Global Constraints

- Contraintes des plans précédents. Une seule nouvelle dépendance de développement : `electron-builder` **26.15.3** (version exacte).
- Dossier des copies de secours : `<userData>/backup` (`%APPDATA%\maquette\backup`) ; le fichier de l'utilisateur n'est modifié qu'à l'enregistrement.
- « Jamais de refus à la souris » : aucune de ces protections n'empêche une action ; elles proposent (restaurer, recharger, enregistrer) et l'utilisateur choisit.
- Textes en français simple.

## Review Focus

1. **Notre propre enregistrement** ne doit pas déclencher « le fichier a changé sur le disque ».
2. **Document jamais enregistré** (Sans titre) : la copie de secours existe quand même et est proposée au démarrage suivant.
3. **Copie de secours plus ancienne que le fichier** (le fichier a été enregistré après) : pas de proposition.
4. **Double-clic sur un `.maquette` alors que l'app est ouverte avec des changements** : on demande avant de remplacer, rien n'est perdu.
5. **Fermeture pendant l'édition d'un texte** : le texte en cours est validé avant l'enregistrement proposé.

---

## Phase A (agents en parallèle)

### Task A1: Copies de secours (pur)

**Files:** Create `src/main/backup.ts` ; Test `tests/main/backup.test.ts`.

**Produces:**
- `class BackupStore { constructor(dir: string, fs?: BackupFs) }`
- `write(key: BackupKey, text: string, now?: number): Promise<void>` — écrit `<dir>/<id>.maquette` (écriture atomique de `files.ts`) et `<dir>/<id>.json` `{ path: string | null; savedAt: number }`. `BackupKey = { path: string | null; session: string }` ; id = `sha256(chemin en minuscules sous Windows).slice(0,16)` si `path`, sinon `sans-titre-<session>`.
- `clear(key: BackupKey): Promise<void>` — supprime les deux fichiers (sans erreur s'ils n'existent pas).
- `pending(fileMtime: (path: string) => Promise<number | null>): Promise<PendingBackup[]>` — `PendingBackup = { id: string; path: string | null; savedAt: number; text: string }` ; garde les sans-titre et les copies dont `savedAt` est **plus récent** que la date de modification du fichier (fichier disparu = copie gardée) ; trié du plus récent au plus ancien ; une copie illisible est ignorée (et supprimée).
- `discard(id: string): Promise<void>`.

Tests (dossier temporaire réel) : écrire puis `pending` → retrouvée ; fichier modifié après la copie → absente ; sans titre → présente ; `clear` ; json corrompu → ignoré sans planter ; deux chemins qui ne diffèrent que par la casse → même id sous Windows.

Commit : `Ajoute les copies de secours des documents`.

### Task A2: Fichiers récents et surveillance du fichier (purs)

**Files:** Create `src/main/recent.ts`, `src/main/watch.ts` ; Test `tests/main/recent.test.ts`, `tests/main/watch.test.ts`.

**Produces:**
- `addRecent(list: string[], path: string, max = 10): string[]` — en tête, sans doublon (casse ignorée sous Windows).
- `class RecentStore { constructor(file: string) ; list(): Promise<string[]> ; add(path): Promise<string[]> ; remove(path): Promise<string[]> }` — JSON dans `<userData>/recent.json` ; fichier absent ou illisible = liste vide.
- `class FileWatcher { constructor(onExternalChange: (path: string) => void, opts?: { debounceMs?: number; read?: (p: string) => Promise<string> }) ; watch(path: string | null): void ; wrote(text: string): void ; close(): void }` — `fs.watch` sur le fichier courant ; après un événement (regroupés sur `debounceMs`, 300 par défaut), relit le fichier et n'appelle `onExternalChange` que si son contenu diffère du dernier contenu connu (`wrote(text)` à chaque enregistrement et à l'ouverture). Fichier supprimé ou illisible : rien.

Tests : `addRecent` (ordre, doublon, max) ; RecentStore aller-retour et json corrompu ; FileWatcher sur un vrai fichier temporaire : écriture extérieure → un appel ; écriture précédée de `wrote(même texte)` → aucun appel ; trois écritures rapides → un seul appel.

Commit : `Ajoute les fichiers récents et la surveillance du fichier ouvert`.

## Phase B (intégration, séquentielle)

### Task B1: Copie de secours, récupération, question à la fermeture

- Principal : `BackupStore(<userData>/backup)` ; IPC `backup:write {path, text}`, `backup:clear {path}`, `backup:pending` → `PendingBackup[]`, `backup:discard id`. Clé de session = horodatage du lancement.
- Fenêtre : toutes les 5 s, si `dirty` et le document a changé depuis la dernière copie → `backup:write`. Après un enregistrement réussi ou un « Nouveau »/« Ouvrir » accepté → `backup:clear` de l'ancienne clé.
- Démarrage : `backup:pending` ; s'il y en a, bandeau « Une copie de secours de *nom* (il y a 3 min) n'a pas été enregistrée. [Restaurer] [Ignorer] ». Restaurer = ouvrir le texte (chemin d'origine gardé comme cible, document marqué modifié).
- Fermeture : la fenêtre envoie `doc:dirty` à chaque changement de l'état ; à `close`, si modifié, boîte « Enregistrer les modifications de *nom* ? » [Enregistrer] [Ne pas enregistrer] [Annuler]. Enregistrer → commande `save-and-close` à la fenêtre (valide le texte en cours, enregistre, puis `window:close`). Ne pas enregistrer → la copie de secours est effacée, fermeture.
- e2e : modifier, attendre la copie, relancer → bandeau, Restaurer → document retrouvé ; enregistrer → plus de bandeau.

Commit : `Ajoute la récupération des copies de secours et la question à la fermeture`.

### Task B2: Fichier changé sur le disque, fichiers récents, une seule instance

- `FileWatcher` branché sur le document courant (`acceptPath`, `savedTo`) ; changement extérieur → bandeau « *nom* a changé sur le disque. [Recharger] [Garder ma version] ».
- `RecentStore` : ajout à l'ouverture et à l'enregistrement (+ `app.addRecentDocument`) ; menu Fichier → « Ouvrir un fichier récent » (sous-menu reconstruit) ; fichier disparu → message et retrait de la liste.
- `app.requestSingleInstanceLock()` ; `second-instance` avec un `.maquette` → fenêtre au premier plan, la fenêtre demande s'il y a des changements puis ouvre (le chemin est proposé via `offerPath`).
- e2e : écriture extérieure → bandeau, Recharger ; enregistrer → pas de bandeau ; menu récent rempli.

Commit : `Ajoute fichiers récents, surveillance du fichier et instance unique`.

### Task B3: Installateur Windows

- `electron-builder` 26.15.3 ; `electron-builder.yml` : appId `yt.joe.maquette`, productName Maquette, `files: out/**`, `extraResources: vendor/taste-skill → taste-skill`, NSIS (installation par utilisateur, choix du dossier), `fileAssociations: [{ ext: maquette, name: Maquette, description: Maquette de site, icon: build/file.ico }]`.
- Icônes `build/icon.png` (512) et `build/icon.ico`, `build/file.ico` dessinées en SVG et rendues par un script (`scripts/make-icons.mjs`, Electron hors écran).
- Le service taste-skill cherche `vendor/taste-skill` dans `process.resourcesPath/taste-skill` une fois installé.
- « Connecter à Claude Code » pointe vers l'exécutable installé et `resources/app.asar/out/main/relay.js`.
- Vérification : `npm run dist` produit `dist/Maquette Setup 0.1.0.exe` ; l'app installée ouvre un `.maquette` par double-clic ; le relais répond à `initialize`.

Commit : `Ajoute l'installateur Windows et l'association des fichiers .maquette`.

### Task B4: Revue

Agent de revue neuf, en lecture seule, sur tout le plan 6 ; corrections avec tests.
