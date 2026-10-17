// Réglages de Maquette autour des règles de taste-skill. Code pur.

/** Règles pensées pour un site vivant (vidéo, défilement) : sans objet sur une maquette fixe. */
export const STATIC_ALLOW = ['still-page', 'no-footage', 'long-pin', 'pinned-over-picture', 'empty-screens', 'side-scroll']

/** Règles qui n'ont de sens que pour une page entière (premier écran, nombre d'images…). */
export const PAGE_RULES = ['no-hero', 'first-action', 'focal-point', 'hero-words', 'few-pictures', 'no-real-pictures', 'font-count', 'size-count']
