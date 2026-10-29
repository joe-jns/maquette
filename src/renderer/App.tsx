import { useEffect, useState } from 'react'
import { Canvas } from './canvas/Canvas'
import { startChat } from './chat/connect'
import { LeftPanel } from './panels/LeftPanel'
import { RightPanel } from './panels/RightPanel'
import './panels/panels.css'
import { domMeasure } from './canvas/measure'
import { watchDocumentFonts } from './fonts/fontLoader'
import { serveMcp } from './mcp/host'
import { Dialog } from './dialog/Dialog'
import { FileChangedBanner } from './FileChangedBanner'
import { Home } from './home/Home'
import { homeStore, useHome } from './home/homeStore'
import { RecoveryBanner } from './RecoveryBanner'
import { startAutoSaveFile } from './state/autoSaveFile'
import { startAutosave } from './state/autosave'
import { confirmLeave, runCommand } from './state/commands'
import { docName, openDocument } from './state/openDocument'
import { docStore, useDoc } from './state/store'
import { Modals } from './ui/Modals'
import { TooltipLayer } from './ui/Tooltip'

export function App() {
  const notice = useDoc((s) => s.notice)
  const filePath = useDoc((s) => s.filePath)
  const untitledName = useDoc((s) => s.untitledName)
  const dirty = useDoc((s) => s.dirty)
  const homeOpen = useHome((s) => s.open)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    docStore.getState().setMeasure(domMeasure)
    void window.maquette
      .getInitialDocument()
      .then((file) => (file ? openDocument(file) : false))
      // Lancé sans fichier (ou fichier illisible) : l'accueil plutôt qu'un document vide.
      .then((opened) => opened || homeStore.getState().show(), () => homeStore.getState().show())
      .finally(() => {
        window.maquette.mcpReady(true)
        setStarted(true)
      })
    return window.maquette.onMenu((cmd) => void runCommand(cmd))
  }, [])

  // Polices du document : chargées à chaque nouvelle famille, introuvables signalées une fois.
  useEffect(() => watchDocumentFonts(), [])

  // Outils de Claude Code : exécutés ici, sur le document affiché.
  useEffect(() => serveMcp(), [])

  // Fichier venu d'ailleurs (récents, double-clic sur un .maquette avec l'app ouverte).
  useEffect(
    () =>
      window.maquette.onOpenFile((file) => {
        void confirmLeave().then((ok) => ok && openDocument(file))
      }),
    [],
  )

  // Chat avec Claude : la conversation du fichier ouvert.
  useEffect(() => startChat(), [])

  // Copie de secours toutes les 5 s et état « modifié » pour la question à la fermeture.
  useEffect(() => startAutosave(), [])
  useEffect(() => startAutoSaveFile(), [])

  useEffect(() => {
    document.title = `${docName({ filePath, untitledName })}${dirty ? ' •' : ''} — Maquette`
  }, [filePath, untitledName, dirty])

  // Un .maquette ou un .pen lâché sur la fenêtre (accueil compris) s'ouvre, comme par « Open… ».
  useEffect(() => {
    const onDrop = (e: DragEvent) => {
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => /\.(maquette|pen)$/i.test(f.name))
      if (!file) return
      e.preventDefault()
      const path = window.maquette.pathForFile(file)
      if (!path) return
      void confirmLeave().then(async (ok) => {
        if (!ok) return
        try {
          const opened = await window.maquette.openPath(path)
          if (opened) await openDocument(opened)
        } catch (err) {
          docStore.getState().showError(`Could not open ${file.name}: ${(err as Error).message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')}`)
        }
      })
    }
    window.addEventListener('drop', onDrop)
    return () => window.removeEventListener('drop', onDrop)
  }, [])

  return (
    <div data-testid="app-root" className="app">
      <div className="notices">
        <RecoveryBanner ready={started} />
        <FileChangedBanner />
        {notice && (
          <div role="alert" className="notice is-error">
            <span>{notice}</span>
            <button type="button" onClick={() => docStore.setState({ notice: null })}>Close</button>
          </div>
        )}
      </div>
      <div
        className={['layout', (homeOpen || !started) && 'is-hidden'].filter(Boolean).join(' ')}
        inert={homeOpen || !started}
      >
        <LeftPanel />
        <Canvas />
        <RightPanel />
      </div>
      {homeOpen && <Home />}
      <Modals />
      <Dialog />
      <TooltipLayer />
    </div>
  )
}
