import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MaquetteApi, MenuCommand, OpenedFile } from '../shared/ipc'

const api: MaquetteApi = {
  getInitialDocument: () => ipcRenderer.invoke('doc:initial') as Promise<OpenedFile | null>,
  openFile: () => ipcRenderer.invoke('file:open') as Promise<OpenedFile | null>,
  documentLoaded: (path) => ipcRenderer.invoke('doc:loaded', path) as Promise<boolean>,
  saveFile: (path, text) => ipcRenderer.invoke('file:save', { path, text }) as Promise<string | null>,
  onMenu: (cb) => {
    const handler = (_e: IpcRendererEvent, cmd: MenuCommand) => cb(cmd)
    ipcRenderer.on('menu', handler)
    return () => ipcRenderer.removeListener('menu', handler)
  },
}

contextBridge.exposeInMainWorld('maquette', api)
