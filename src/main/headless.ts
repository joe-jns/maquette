import { app, BrowserWindow, screen } from 'electron'

/**
 * Mode sans fenêtre : Maquette lancée par le relais MCP parce que l'app était fermée (Claude Code travaille
 * sur un fichier). La fenêtre de l'éditeur existe mais reste hors de l'écran, sans bouton dans la barre des
 * tâches. Si l'utilisateur ouvre Maquette entre-temps, elle devient sa fenêtre ; sinon l'app se ferme seule
 * après un moment sans appel de Claude.
 */
export const startedHeadless = process.env.MAQUETTE_HEADLESS === '1'

const IDLE_MS = Number(process.env.MAQUETTE_HEADLESS_IDLE_MS) || 10 * 60_000

let hidden = startedHeadless
let lastCall = Date.now()

export const isHidden = (): boolean => hidden

/** Un appel de Claude vient d'arriver : l'arrêt automatique est repoussé. */
export function noteMcpCall(): void {
  lastCall = Date.now()
}

/** La fenêtre cachée devient une fenêtre normale, au centre de l'écran, au premier plan. */
export function revealWindow(win: BrowserWindow): void {
  if (!hidden) return
  hidden = false
  const area = screen.getPrimaryDisplay().workArea
  const [w, h] = win.getSize() as [number, number]
  win.setBounds({ x: area.x + Math.round((area.width - w) / 2), y: area.y + Math.round((area.height - h) / 2), width: w, height: h })
  win.setSkipTaskbar(false)
  win.webContents.setBackgroundThrottling(true)
  // La fenêtre sait désormais qu'elle est vue (outil fichier : visible:true).
  void win.webContents.executeJavaScript("history.replaceState(null, '', location.pathname)").catch(() => undefined)
  win.show()
  win.focus()
}

/**
 * Arrêt automatique tant que la fenêtre est cachée : un fichier modifié a déjà été enregistré (enregistrement
 * automatique), un document jamais enregistré reste en copie de secours, proposée au prochain lancement.
 */
export function watchIdle(windows: () => BrowserWindow[]): void {
  if (!startedHeadless) return
  const timer = setInterval(() => {
    if (!hidden) return clearInterval(timer)
    if (Date.now() - lastCall < IDLE_MS) return
    clearInterval(timer)
    // Pas de question « Enregistrer ? » dans une fenêtre que personne ne voit.
    for (const w of windows()) w.destroy()
    app.quit()
  }, Math.min(30_000, Math.max(500, IDLE_MS / 4)))
}
