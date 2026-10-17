/**
 * Jeu d'icônes unique de l'interface.
 *
 * Chaque glyphe est dessiné dans une boîte de 24 × 24, au centre, sur 16 × 16 (de 4 à 20).
 * Trait de 1,25 px en `currentColor`, bouts et jointures ronds. `size={16}` recadre sur le glyphe
 * seul (sans marge), ce qui garde le trait à 1,25 px dans une rangée dense.
 */

export type IconName =
  | 'move' | 'hand' | 'frame' | 'rect' | 'ellipse' | 'line' | 'text' | 'image'
  | 'chevronDown' | 'chevronRight' | 'chevronLeft' | 'chevronDownSmall' | 'more'
  | 'eye' | 'eyeOff' | 'lock' | 'unlock'
  | 'autoRow' | 'autoCol' | 'group' | 'page'
  | 'plus' | 'minus' | 'check' | 'chat' | 'zoom' | 'fit'

/** Tracés (coordonnées 24 × 24). Les remplissages pleins sont préfixés par « fill: ». */
const PATHS: Record<IconName, string[]> = {
  move: ['M6 5.5 18.5 10.4 12.9 12.4 10.8 18z'],
  hand: [
    'M8.5 12.5V7.25a1.25 1.25 0 0 1 2.5 0V11.5',
    'M11 11.5V5.75a1.25 1.25 0 0 1 2.5 0v5.75',
    'M13.5 11.5V7a1.25 1.25 0 0 1 2.5 0v4.5',
    'M16 11.5V9a1.25 1.25 0 0 1 2.5 0v4.5a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.7-2.3l-2.4-3.1a1.3 1.3 0 0 1 1.9-1.75L8.5 14',
  ],
  frame: ['M9 4.5v15M15 4.5v15M4.5 9h15M4.5 15h15'],
  rect: ['M5.5 5.5h13v13h-13z'],
  ellipse: ['M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13z'],
  line: ['M5.5 18.5 18.5 5.5'],
  text: ['M6 7V5.5h12V7', 'M12 5.5v13', 'M9.75 18.5h4.5'],
  image: ['M5 5.5h14v13H5z', 'M5 16l4-4 3.5 3.5 2-2L19 18', 'M15.25 8.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 1 0 0-2.5z'],
  chevronDown: ['M8 10l4 4 4-4'],
  chevronRight: ['M10 8l4 4-4 4'],
  chevronLeft: ['M14 8l-4 4 4 4'],
  chevronDownSmall: ['M10 11l2 2 2-2'],
  more: [
    'M7 11.25a.75.75 0 1 0 0 1.5.75.75 0 1 0 0-1.5z',
    'M12 11.25a.75.75 0 1 0 0 1.5.75.75 0 1 0 0-1.5z',
    'M17 11.25a.75.75 0 1 0 0 1.5.75.75 0 1 0 0-1.5z',
  ],
  eye: ['M3.5 12S6.5 6.5 12 6.5 20.5 12 20.5 12 17.5 17.5 12 17.5 3.5 12 3.5 12z', 'M12 9.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 1 0 0-4.5z'],
  eyeOff: [
    'M5 5l14 14',
    'M9.9 6.8c.65-.2 1.35-.3 2.1-.3 5.5 0 8.5 5.5 8.5 5.5s-.8 1.5-2.3 2.9',
    'M15.2 16.9c-.95.4-2 .6-3.2.6-5.5 0-8.5-5.5-8.5-5.5s.95-1.75 2.75-3.25',
  ],
  lock: ['M7 11h10v8H7z', 'M9 11V8.5a3 3 0 0 1 6 0V11'],
  unlock: ['M7 11h10v8H7z', 'M9 11V8.5a3 3 0 0 1 5.85-.95'],
  autoRow: ['M5.5 6.5h5v11h-5z', 'M13.5 6.5h5v11h-5z'],
  autoCol: ['M6.5 5.5h11v5h-11z', 'M6.5 13.5h11v5h-11z'],
  group: ['M5.5 8.5v-3h3', 'M15.5 5.5h3v3', 'M18.5 15.5v3h-3', 'M8.5 18.5h-3v-3'],
  page: ['M7 4.5h6.5l3.5 3.5v11.5H7z', 'M13.5 4.5V8H17'],
  plus: ['M12 7v10', 'M7 12h10'],
  minus: ['M7 12h10'],
  check: ['M7 12.5l3.25 3.25L17 9'],
  chat: ['M12 5a7 7 0 0 0-6.2 10.25L5 19l3.75-.8A7 7 0 1 0 12 5z'],
  zoom: ['M10.75 5.5a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 1 0 0-10.5z', 'M14.5 14.5 19 19'],
  fit: ['M5 9V5h4', 'M15 5h4v4', 'M19 15v4h-4', 'M9 19H5v-4'],
}

export interface IconProps {
  name: IconName
  /** 24 : boîte complète (boutons de la barre d'outils, menus) ; 16 : glyphe seul (rangées). */
  size?: 24 | 16
  className?: string
}

export function Icon({ name, size = 24, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox={size === 16 ? '4 4 16 16' : '0 0 24 24'}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon={name}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
