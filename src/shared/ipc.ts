import type { MaquetteDocument } from '../core/types'
import type { ChatApi } from './chat'
import type { RecentEntry } from './home'
import type { ToolResult } from '../mcp/tools'
import type { DirectionOption, DirectionSheet } from '../taste/direction'

/** Résultat d'un tirage taste-skill : valeur, ou message à afficher. */
export type TasteDraw<T> = { ok: true; value: T } | { ok: false; message: string }
export interface TasteFinding { level: 'FAIL' | 'WARN'; id: string; message: string; fix: string }
/** Contrôle qualité d'un cadre par les règles de taste-skill. */
export interface TasteCheck { findings: TasteFinding[]; isPage: boolean; width: number; height: number }
export interface TasteInput { sector: string; brief: string; tone?: string }

/** Un document lu : son chemin (null pour une copie de secours d'un document jamais enregistré). */
export interface OpenedFile { path: string | null; text: string }
/** État du document d'une fenêtre, pour la question à la fermeture. */
export interface DocState { dirty: boolean; name: string; path: string | null }
/** Copie de secours plus récente que son fichier, proposée au démarrage. */
export interface RecoveryOffer { id: string; name: string; savedAt: number }
export type ImageImport = { ok: true; src: string } | { ok: false; message: string }
/** Une famille du catalogue des polices (Google Fonts ou catalogue de secours). */
export interface FontInfo {
  family: string
  category: string
  weights: number[]
  italic: boolean
  variable: { min: number; max: number } | null
}

/** Bouton d'une fenêtre de question : primaire (clair), danger (rouge) ou ordinaire. */
export interface DialogButton { label: string; kind?: 'primary' | 'danger' | 'default' }
/** Question posée dans la fenêtre, dessinée par l'app ; la réponse est l'indice du bouton choisi. */
export interface DialogRequest {
  title?: string
  message: string
  detail?: string
  /** Texte montré tel quel, en police à chasse fixe et sélectionnable (une commande, une sortie). */
  code?: string
  buttons: DialogButton[]
  /** Réponse pour Échap, un clic sur le fond ou une fenêtre fermée. */
  cancelIndex: number
  /** Bouton qui a le focus à l'ouverture (Entrée). */
  defaultIndex: number
}

export type MenuCommand = 'home' | 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo' | 'export-png-1' | 'export-png-2' | 'export-png-3' | 'save-and-close' | 'toggle-chat'

export interface RenderOptions {
  scale: number
  format: 'png' | 'jpeg'
  /** Réduit l'échelle pour que l'image ne dépasse pas cette largeur (captures). */
  maxWidth?: number
}

/** Image d'un élément, en base64. */
export interface RenderedImage { data: string; mimeType: 'image/png' | 'image/jpeg'; width: number; height: number }

/** Travail envoyé à la fenêtre d'export (rendu hors écran). */
export interface ExportJob { doc: MaquetteDocument; nodeId: string; scale: number; maxWidth?: number }

/** Taille en pixels de l'image à capturer, ou null (élément introuvable ou masqué). */
export type ExportMeasure = { width: number; height: number } | null

/** API réservée à la fenêtre d'export : reçoit un travail, renvoie la taille à capturer. */
export interface ExportViewApi {
  onJob(cb: (job: ExportJob) => Promise<ExportMeasure>): () => void
}

export interface MaquetteApi {
  getInitialDocument(): Promise<OpenedFile | null>
  openFile(): Promise<OpenedFile | null>
  /** La fenêtre a chargé ce fichier (null : nouveau document). */
  documentLoaded(path: string | null): Promise<boolean>
  saveFile(path: string | null, text: string): Promise<string | null>
  onMenu(cb: (cmd: MenuCommand) => void): () => void
  /** Copie une image dans assets/ à côté du document courant (enregistré). */
  importImage(name: string, bytes: Uint8Array): Promise<ImageImport>
  /** Catalogue des polices (cache local, réseau, ou catalogue de secours hors connexion). */
  fontCatalog(): Promise<FontInfo[]>
  /** Feuille @font-face d'une famille (fichiers servis par mfont://), ou null si indisponible. */
  fontCss(family: string): Promise<string | null>
  /** Rend un élément en image (hors écran) ; null si introuvable, masqué ou trop long. */
  renderNode(doc: MaquetteDocument, nodeId: string, opts: RenderOptions): Promise<RenderedImage | null>
  /** Exporte un élément en PNG : boîte d'enregistrement, puis écriture ; chemin écrit ou null (annulé). */
  exportPng(doc: MaquetteDocument, nodeId: string, scale: number): Promise<string | null>
  exportView: ExportViewApi
  /** Reçoit les outils appelés par Claude Code (via le relais) ; la réponse repart au relais. */
  taste: {
    /** Trois directions artistiques tirées de la bibliothèque de taste-skill. */
    options(input: TasteInput): Promise<TasteDraw<DirectionOption[]>>
    /** Fiche complète de la direction choisie (palette, typographie, hero…). */
    direction(input: TasteInput & { direction: string }): Promise<TasteDraw<DirectionSheet>>
    /** Contrôle qualité d'un cadre ; null si introuvable, masqué ou trop long. */
    check(doc: MaquetteDocument, nodeId: string, allow?: string[]): Promise<TasteCheck | null>
  }
  /** La fenêtre peut recevoir les outils (document initial chargé) ; false pendant le chargement. */
  mcpReady(ready: boolean): void
  backup: {
    write(path: string | null, text: string): Promise<void>
    clear(path: string | null): Promise<void>
    pending(): Promise<RecoveryOffer[]>
    restore(id: string): Promise<OpenedFile | null>
    discard(id: string): Promise<void>
  }
  /** Signale l'état du document (modifié ou non) au principal. */
  docState(state: DocState): void
  /** Ferme la fenêtre sans reposer de question (après « Enregistrer » à la fermeture). */
  closeWindow(): void
  /** Un fichier à ouvrir arrive d'ailleurs (fichiers récents, double-clic avec l'app déjà ouverte). */
  onOpenFile(cb: (file: OpenedFile) => void): () => void
  /** Le fichier ouvert a changé sur le disque (autre programme). */
  onFileChanged(cb: (path: string) => void): () => void
  /** Relit le fichier courant sur le disque. */
  reloadFile(path: string): Promise<OpenedFile | null>
  onMcpCall(cb: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>): () => void
  /** Écran d'accueil : fichiers récents (seuls ceux de la liste sont lus, montrés ou retirés). */
  home: {
    list(): Promise<RecentEntry[]>
    /** Aperçu d'un fichier (data URL JPEG) par son empreinte, ou null. */
    thumb(hash: string): Promise<string | null>
    /** Lit un fichier récent pour l'ouvrir ; null s'il est introuvable ou hors de la liste. */
    open(path: string): Promise<OpenedFile | null>
    remove(path: string): Promise<void>
    /** Montre le fichier dans l'Explorateur. */
    reveal(path: string): Promise<void>
  }
  /** Chat avec Claude (panneau de droite). */
  chat: ChatApi
  /** Questions posées par le principal (fermeture, fichier introuvable…) ; la réponse repart au principal. */
  onDialogAsk(cb: (request: DialogRequest) => Promise<number>): () => void
}
