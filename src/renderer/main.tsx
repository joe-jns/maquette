import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { docStore } from './state/store'
import { uiStore } from './state/ui'
import './app.css'

if (new URLSearchParams(location.search).has('e2e')) {
  ;(window as unknown as { __maquetteStore: typeof docStore }).__maquetteStore = docStore
  ;(window as unknown as { __maquetteUi: typeof uiStore }).__maquetteUi = uiStore
}

// Un fichier lâché hors du canevas ne doit pas faire naviguer la fenêtre vers lui.
for (const type of ['dragover', 'drop']) window.addEventListener(type, (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
