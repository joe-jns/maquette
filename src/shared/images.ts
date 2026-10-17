/** Photos libres (outil MCP `images`) : échanges entre la fenêtre et le principal. */

/** Un résultat de recherche, numéroté comme sur la planche-contact. */
export interface ImageHit {
  n: number
  ref: string
  title: string
  creator: string
  licence: string
  width: number | null
  height: number | null
  thumb: string | null
}

/** Recherche : résultats, et la vignette de chacun (null si elle n'a pas chargé) quand elles sont demandées. */
export type ImageSearch =
  | { ok: true; hits: ImageHit[]; thumbs: (Uint8Array | null)[]; notes: string[] }
  | { ok: false; message: string }

/** Photo téléchargée dans assets/ : son chemin pour le nœud image, sa taille et son crédit. */
export type ImagePlace =
  | { ok: true; src: string; width: number; height: number; title: string; credit: string }
  | { ok: false; message: string }

export interface ImageCredit { file: string; credit: string; page: string | null; licenseUrl: string | null }

export interface ImagesApi {
  search(query: string, n: number, thumbs: boolean): Promise<ImageSearch>
  /** `ref` : une réf de la recherche, ou son numéro (dernière recherche). */
  place(ref: string | number): Promise<ImagePlace>
  /** Crédits notés dans assets/credits.json du document courant (vide s'il n'est pas enregistré). */
  credits(): Promise<ImageCredit[]>
}
