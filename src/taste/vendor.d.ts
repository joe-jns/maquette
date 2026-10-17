// Types des modules de taste-skill copiés dans vendor/taste-skill (JavaScript non typé).

declare module '*/taste-skill/scripts/lib/rules.mjs' {
  export interface TasteFinding {
    level: 'FAIL' | 'WARN'
    id: string
    width: number
    message: string
    fix: string
  }
  export function judge(m: unknown, opts?: { width?: number; allow?: string[] }): TasteFinding[]
  export const RULE_IDS: string[]
}

declare module '*/taste-skill/scripts/lib/probe.mjs' {
  /** S'exécute dans la page (aucune fermeture sur le module) ; renvoie les mesures attendues par `judge`. */
  export function probe(): unknown
}
