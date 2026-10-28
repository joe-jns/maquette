/** Dates du menu des conversations, en anglais. Module pur. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const two = (n: number) => String(n).padStart(2, '0')
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/**
 * « Today 14:05 », « Yesterday 18:42 », « Oct 12 » (cette année), « Oct 12, 2025 » (avant).
 * Heure locale de l'ordinateur.
 */
export function relativeDate(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const today = new Date(now)
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`
  const days = Math.round((dayStart(today) - dayStart(d)) / 86_400_000)
  if (days <= 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === today.getFullYear() ? date : `${date}, ${d.getFullYear()}`
}
