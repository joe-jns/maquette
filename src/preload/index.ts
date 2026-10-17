import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ChatEvent, ChatItem } from '../shared/chat'
import type { DialogRequest, ExportJob, ExportMeasure, FontInfo, ImageImport, MaquetteApi, MenuCommand, OpenedFile, RenderedImage } from '../shared/ipc'

// Questions du principal : arrivées avant que la fenêtre écoute (démarrage), elles l'attendent.
let onAsk: ((request: DialogRequest) => Promise<number>) | null = null
const early: [number, DialogRequest][] = []
const reply = (ask: (request: DialogRequest) => Promise<number>, id: number, request: DialogRequest) =>
  void ask(request).then(
    (index) => ipcRenderer.send('dialog:answer', id, index),
    () => ipcRenderer.send('dialog:answer', id, request.cancelIndex),
  )
ipcRenderer.on('dialog:ask', (_e, id: number, request: DialogRequest) => {
  if (onAsk) reply(onAsk, id, request)
  else early.push([id, request])
})

const api: MaquetteApi = {
  getInitialDocument: () => ipcRenderer.invoke('doc:initial') as Promise<OpenedFile | null>,
  openFile: () => ipcRenderer.invoke('file:open') as Promise<OpenedFile | null>,
  documentLoaded: (path) => ipcRenderer.invoke('doc:loaded', path) as Promise<boolean>,
  saveFile: (path, text) => ipcRenderer.invoke('file:save', { path, text }) as Promise<string | null>,
  importImage: (name, bytes) => ipcRenderer.invoke('image:import', { name, bytes }) as Promise<ImageImport>,
  fontCatalog: () => ipcRenderer.invoke('fonts:catalog') as Promise<FontInfo[]>,
  fontCss: (family) => ipcRenderer.invoke('fonts:css', family) as Promise<string | null>,
  renderNode: (doc, nodeId, opts) => ipcRenderer.invoke('export:node', { doc, nodeId, ...opts }) as Promise<RenderedImage | null>,
  exportPng: (doc, nodeId, scale) => ipcRenderer.invoke('export:save', { doc, nodeId, scale }) as Promise<string | null>,
  exportView: {
    onJob: (cb) => {
      const handler = (_e: IpcRendererEvent, id: number, job: ExportJob) => {
        void cb(job).then(
          (measure: ExportMeasure) => ipcRenderer.send('export:measured', id, measure),
          () => ipcRenderer.send('export:measured', id, null),
        )
      }
      ipcRenderer.on('export:job', handler)
      return () => ipcRenderer.removeListener('export:job', handler)
    },
  },
  taste: {
    options: (input) => ipcRenderer.invoke('taste:options', input),
    direction: (input) => ipcRenderer.invoke('taste:direction', input),
    check: (doc, nodeId, allow) => ipcRenderer.invoke('taste:check', { doc, nodeId, allow }),
  },
  mcpReady: (ready) => ipcRenderer.send('mcp:ready', ready),
  backup: {
    write: (path, text) => ipcRenderer.invoke('backup:write', { path, text }),
    clear: (path) => ipcRenderer.invoke('backup:clear', path),
    pending: () => ipcRenderer.invoke('backup:pending'),
    restore: (id) => ipcRenderer.invoke('backup:restore', id),
    discard: (id) => ipcRenderer.invoke('backup:discard', id),
  },
  docState: (state) => ipcRenderer.send('doc:state', state),
  closeWindow: () => ipcRenderer.send('window:close'),
  onOpenFile: (cb) => {
    const handler = (_e: IpcRendererEvent, file: OpenedFile) => cb(file)
    ipcRenderer.on('open-file', handler)
    return () => ipcRenderer.removeListener('open-file', handler)
  },
  onFileChanged: (cb) => {
    const handler = (_e: IpcRendererEvent, path: string) => cb(path)
    ipcRenderer.on('file:changed', handler)
    return () => ipcRenderer.removeListener('file:changed', handler)
  },
  reloadFile: (path) => ipcRenderer.invoke('file:reload', path),
  onMcpCall: (cb) => {
    const handler = (_e: IpcRendererEvent, id: number, tool: string, args: Record<string, unknown>) => {
      void cb(tool, args).then((result) => ipcRenderer.send('mcp:result', id, result))
    }
    ipcRenderer.on('mcp:call', handler)
    return () => ipcRenderer.removeListener('mcp:call', handler)
  },
  chat: {
    open: (path) => ipcRenderer.invoke('chat:open', path) as Promise<ChatItem[]>,
    send: (message) => ipcRenderer.send('chat:send', message),
    stop: () => ipcRenderer.send('chat:stop'),
    permission: (requestId, decision) => ipcRenderer.send('chat:permission', requestId, decision),
    reset: () => ipcRenderer.invoke('chat:reset') as Promise<void>,
    onEvent: (cb) => {
      const handler = (_e: IpcRendererEvent, event: ChatEvent) => cb(event)
      ipcRenderer.on('chat:event', handler)
      return () => ipcRenderer.removeListener('chat:event', handler)
    },
  },
  onDialogAsk: (cb) => {
    onAsk = cb
    for (const [id, request] of early.splice(0)) reply(cb, id, request)
    return () => {
      if (onAsk === cb) onAsk = null
    }
  },
  onMenu: (cb) => {
    const handler = (_e: IpcRendererEvent, cmd: MenuCommand) => cb(cmd)
    ipcRenderer.on('menu', handler)
    return () => ipcRenderer.removeListener('menu', handler)
  },
}

contextBridge.exposeInMainWorld('maquette', api)
