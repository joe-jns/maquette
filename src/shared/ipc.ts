export interface OpenedFile { path: string; text: string }
export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo'

export interface MaquetteApi {
  getInitialDocument(): Promise<OpenedFile | null>
}
