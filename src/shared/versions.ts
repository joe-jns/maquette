/** Historique de versions d'un fichier : types échangés avec le principal. */

/** Une version enregistrée (le texte du document est à part). */
export interface VersionInfo {
  id: string
  name: string
  /** Date de la version (ms). */
  date: number
  /** Prise d'office (avant une réponse de Claude, avant une restauration) : effacée au-delà de 50. */
  auto: boolean
  /** Taille du texte (octets). */
  size: number
}

/** Identifiant de version : rien d'autre ne passe (pas de chemin). */
export const isVersionId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{1,16}-[a-z0-9]{1,16}$/.test(v)

export interface VersionsApi {
  /** Versions du fichier ouvert, la plus récente d'abord ; null pour un document jamais enregistré. */
  list(): Promise<VersionInfo[] | null>
  /** Enregistre ce texte comme version du fichier ouvert ; null pour un document jamais enregistré. */
  save(text: string, name: string, auto: boolean): Promise<VersionInfo | null>
  /** Texte d'une version, ou null. */
  read(id: string): Promise<string | null>
  rename(id: string, name: string): Promise<boolean>
  remove(id: string): Promise<boolean>
  /** Aperçu de la version (data URL JPEG), ou null (page vide, rendu impossible). */
  preview(id: string): Promise<string | null>
}
