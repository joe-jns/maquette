export interface OpenedFile { path: string; text: string }
export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo'

export interface MaquetteApi {
  getInitialDocument(): Promise<OpenedFile | null>
  openFile(): Promise<OpenedFile | null>
  /** La fenêtre a chargé ce fichier (null : nouveau document). */
  documentLoaded(path: string | null): Promise<boolean>
  saveFile(path: string | null, text: string): Promise<string | null>
  onMenu(cb: (cmd: MenuCommand) => void): () => void
}
