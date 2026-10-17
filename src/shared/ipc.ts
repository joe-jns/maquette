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

export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo'

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
}
