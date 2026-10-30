/** Groupes d'historique des réponses de Claude et noms qui en découlent. Module pur. */

/** Longueur maximale du début de la demande dans les libellés et les noms de versions. */
export const REQUEST_START_MAX = 60

/** Groupe d'historique d'une réponse du chat intégré. */
export const replyGroup = (turnId: string): string => `claude:${turnId}`

/** Début d'une demande, sur une ligne : au plus `max` caractères, « … » compris s'il est coupé. */
export function requestStart(text: string, max = REQUEST_START_MAX): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= max) return line
  return `${line.slice(0, max - 1).trimEnd()}…`
}

/** Libellé d'historique d'une réponse : « Claude: <début de la demande> ». */
export const replyLabel = (text: string): string => `Claude: ${requestStart(text)}`

/** Nom de la version prise avant la première modification d'une réponse (60 caractères au plus). */
export const beforeClaudeName = (text: string): string => requestStart(`Before Claude: ${requestStart(text)}`)
