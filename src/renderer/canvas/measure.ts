import type { Measure } from '../../core/ops'
import { parentRectOf } from './rects'

/** Mesure fournie au noyau : position et taille affichées, relatives au parent, en coordonnées du monde. */
export const domMeasure: Measure = (id) => parentRectOf(id)
