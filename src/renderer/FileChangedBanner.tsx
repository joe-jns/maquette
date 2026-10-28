import { useEffect, useState } from 'react'
import { confirmDiscard } from './state/commands'
import { fileName, openDocument } from './state/openDocument'
import { docStore } from './state/store'

/** Le fichier ouvert a changé sur le disque : recharger, ou garder la version de la fenêtre. */
export function FileChangedBanner() {
  const [path, setPath] = useState<string | null>(null)
  useEffect(() => window.maquette.onFileChanged(setPath), [])
  // Un autre document est ouvert entre-temps : l'alerte ne le concerne pas.
  useEffect(() => docStore.subscribe((s, prev) => s.filePath !== prev.filePath && setPath(null)), [])
  if (!path) return null

  const reload = async () => {
    // Des changements non enregistrés seraient perdus : on demande d'abord.
    if (!(await confirmDiscard())) return
    setPath(null)
    const file = await window.maquette.reloadFile(path)
    if (file) await openDocument(file)
  }

  return (
    <div role="alert" className="notice" data-testid="file-changed">
      <span>
        <strong>{fileName(path)}</strong> was changed outside Maquette.
      </span>
      <button type="button" className="is-primary" onClick={() => void reload()}>Reload</button>
      <button type="button" onClick={() => setPath(null)}>Keep my version</button>
    </div>
  )
}
