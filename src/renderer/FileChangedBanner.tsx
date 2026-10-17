import { useEffect, useState } from 'react'
import { fileName, openDocument } from './state/openDocument'

/** Le fichier ouvert a changé sur le disque : recharger, ou garder la version de la fenêtre. */
export function FileChangedBanner() {
  const [path, setPath] = useState<string | null>(null)
  useEffect(() => window.maquette.onFileChanged(setPath), [])
  if (!path) return null

  const reload = async () => {
    setPath(null)
    const file = await window.maquette.reloadFile()
    if (file) await openDocument(file)
  }

  return (
    <div role="alert" className="notice" data-testid="file-changed">
      <span>
        <strong>{fileName(path)}</strong> a été modifié en dehors de Maquette.
      </span>
      <button type="button" onClick={() => void reload()}>Recharger</button>
      <button type="button" onClick={() => setPath(null)}>Garder ma version</button>
    </div>
  )
}
