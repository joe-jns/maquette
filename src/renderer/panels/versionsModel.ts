/** Fenêtre « Version history » : dates et noms par défaut. Module pur. */
import { relativeDate } from '../../shared/home'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')

/** « Just now », « 5 min ago », « 2 hours ago », « Yesterday », « October 3 » (dates de l'accueil, sans « Edited »). */
export function versionAge(ts: number, now = Date.now()): string {
  const text = relativeDate(ts, now).replace(/^Edited /, '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Nom proposé pour une version enregistrée à la main : « Version Oct 31, 14:05 ». */
export function defaultVersionName(now = Date.now()): string {
  const d = new Date(now)
  return `Version ${MONTHS[d.getMonth()]} ${d.getDate()}, ${two(d.getHours())}:${two(d.getMinutes())}`
}
