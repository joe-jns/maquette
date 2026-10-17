/** Délais des infobulles, comme Figma. Module pur. */

/** Attente avant la première infobulle. */
export const TOOLTIP_DELAY = 500
/** Après une infobulle, celles des boutons voisins s'affichent sans attendre pendant ce temps. */
export const TOOLTIP_WARM = 300

/**
 * Délai avant d'afficher l'infobulle d'une nouvelle cible.
 * `visible` : une infobulle est encore affichée ; `hiddenAt` : quand la dernière a été cachée en
 * quittant sa cible (null : jamais, ou cachée par un clic, Échap, le défilement).
 */
export function tooltipDelay(now: number, visible: boolean, hiddenAt: number | null): number {
  if (visible) return 0
  if (hiddenAt !== null && now - hiddenAt < TOOLTIP_WARM) return 0
  return TOOLTIP_DELAY
}
