import type { MaquetteDocument } from '../core/types'

export interface OpenedFile { path: string; text: string }
export type ImageImport = { ok: true; src: string } | { ok: false; message: string }
/** Une famille du catalogue des polices (Google Fonts ou catalogue de secours). */
export interface FontInfo {
  family: string
  category: string
  weights: number[]
  italic: boolean
  variable: { min: number; max: number } | null
}

export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo' | 'export-png-1' | 'export-png-2' | 'export-png-3'

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
}
