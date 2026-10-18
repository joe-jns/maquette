/** Dates du menu des conversations, en français. Module pur. */

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

const two = (n: number) => String(n).padStart(2, '0')
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/**
 * « aujourd'hui 14:05 », « hier 18:42 », « 12 oct. » (cette année), « 12 oct. 2025 » (avant).
 * Heure locale de l'ordinateur.
 */
export function relativeDate(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const today = new Date(now)
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`
  const days = Math.round((dayStart(today) - dayStart(d)) / 86_400_000)
  if (days <= 0) return `aujourd’hui ${time}`
  if (days === 1) return `hier ${time}`
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === today.getFullYear() ? date : `${date} ${d.getFullYear()}`
}
