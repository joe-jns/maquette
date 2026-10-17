import { useEffect, useState } from 'react'
import { Canvas } from './canvas/Canvas'
import { LeftPanel } from './panels/LeftPanel'
import { RightPanel } from './panels/RightPanel'
import './panels/panels.css'
import { domMeasure } from './canvas/measure'
import { watchDocumentFonts } from './fonts/fontLoader'
import { serveMcp } from './mcp/host'
import { FileChangedBanner } from './FileChangedBanner'
import { RecoveryBanner } from './RecoveryBanner'
import { startAutosave } from './state/autosave'
import { confirmDiscard, runCommand } from './state/commands'
import { fileName, openDocument } from './state/openDocument'
import { docStore, useDoc } from './state/store'

export function App() {
  const notice = useDoc((s) => s.notice)
  const filePath = useDoc((s) => s.filePath)
  const dirty = useDoc((s) => s.dirty)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    docStore.getState().setMeasure(domMeasure)
    void window.maquette
      .getInitialDocument()
      .then((file) => (file ? openDocument(file) : undefined))
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
        if (confirmDiscard()) void openDocument(file)
      }),
    [],
  )

  // Copie de secours toutes les 5 s et état « modifié » pour la question à la fermeture.
  useEffect(() => startAutosave(), [])

  useEffect(() => {
    document.title = `${fileName(filePath)}${dirty ? ' •' : ''} — Maquette`
  }, [filePath, dirty])

  return (
    <div data-testid="app-root" className="app">
      <RecoveryBanner ready={started} />
      <FileChangedBanner />
      {notice && (
        <div role="alert" className="notice">
          {notice}
          <button type="button" onClick={() => docStore.setState({ notice: null })}>Fermer</button>
        </div>
      )}
      <div className="layout">
        <LeftPanel />
        <Canvas />
        <RightPanel />
      </div>
    </div>
  )
}
