export interface OpenedFile { path: string; text: string }
export type ImageImport = { ok: true; src: string } | { ok: false; message: string }
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
}
