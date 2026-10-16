import type { MaquetteApi } from '../shared/ipc'

declare global {
  interface Window {
    maquette: MaquetteApi
  }
}

export {}
