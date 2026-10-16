import { useEffect } from 'react'
import { DocumentView } from './canvas/DocumentView'
import { domMeasure } from './canvas/measure'
import { fileName, openDocument } from './state/openDocument'
import { docStore, useDoc } from './state/store'

export function App() {
  const notice = useDoc((s) => s.notice)
  const filePath = useDoc((s) => s.filePath)
  const dirty = useDoc((s) => s.dirty)

  useEffect(() => {
    docStore.getState().setMeasure(domMeasure)
    void window.maquette.getInitialDocument().then((file) => {
      if (file) openDocument(file)
    })
  }, [])

  useEffect(() => {
    document.title = `${fileName(filePath)}${dirty ? ' •' : ''} — Maquette`
  }, [filePath, dirty])

  return (
    <div data-testid="app-root" className="app">
      {notice && (
        <div role="alert" className="notice">
          {notice}
          <button type="button" onClick={() => docStore.setState({ notice: null })}>Fermer</button>
        </div>
      )}
      <DocumentView />
    </div>
  )
}
