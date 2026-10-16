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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
