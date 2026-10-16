import { contextBridge, ipcRenderer } from 'electron'
import type { MaquetteApi, OpenedFile } from '../shared/ipc'

const api: MaquetteApi = {
  getInitialDocument: () => ipcRenderer.invoke('doc:initial') as Promise<OpenedFile | null>,
}

contextBridge.exposeInMainWorld('maquette', api)
