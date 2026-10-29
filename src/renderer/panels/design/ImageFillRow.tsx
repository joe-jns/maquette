import { useRef } from 'react'
import type { Color, Fill, ImageFill } from '../../../core/types'
import { assetUrl } from '../../canvas/assetUrl'
import { docStore } from '../../state/store'
import { Select } from '../../ui/Select'
import { Icon } from './shared'

const FITS: { value: ImageFill['fit']; label: string }[] = [
  { value: 'cover', label: 'Fill' },
  { value: 'contain', label: 'Fit' },
  { value: 'fill', label: 'Stretch' },
]

const SOLID_GLYPH = 'M3.5 3.5h9v9h-9z'
/** Glyphe « image » des champs (16 × 16) : un cadre, une montagne, un soleil. */
export const IMAGE_GLYPH = 'M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 1.5-1.5 3.5 3.5M10.5 5.5a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'

/**
 * Importe un fichier image dans le dossier du document (ou le dossier d'attente d'un document jamais
 * enregistré) et renvoie son `src`, ou null après avoir affiché l'erreur.
 */
export async function importImageFile(file: File): Promise<string | null> {
  const res = await window.maquette.importImage(file.name, new Uint8Array(await file.arrayBuffer()))
  if (res.ok) return res.src
  docStore.getState().showError(`${file.name} : ${res.message}`)
  return null
}

/** Sélecteur de fichier caché : `pick()` l'ouvre, `onFile` reçoit l'image choisie. */
export function useImagePicker(onFile: (src: string) => void) {
  const input = useRef<HTMLInputElement>(null)
  const element = (
    <input
      ref={input}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif"
      hidden
      data-image-picker
      onChange={async (e) => {
        const file = e.currentTarget.files?.[0]
        e.currentTarget.value = ''
        if (!file) return
        const src = await importImageFile(file)
        if (src) onFile(src)
      }}
    />
  )
  return { element, pick: () => input.current?.click() }
}

/**
 * Un remplissage image dans le panneau : aperçu, choix du fichier, mode (recadrer, entière, étirée).
 * `apply` pose le remplissage modifié (une annulation).
 */
export function ImageFillRow({ name, fill, apply, onRemove, solid }: {
  name: string
  fill: ImageFill
  apply(fill: Fill): void
  onRemove(): void
  /** Couleur posée par « Solid color ». */
  solid: Color
}) {
  const picker = useImagePicker((src) => apply({ ...fill, src }))
  const file = fill.src ? fill.src.split('/').pop()! : 'No image'
  return (
    <div className="image-fill-row" data-image-fill>
      <div className="color-row">
        <button type="button" className="color-box is-gradient image-fill-pick" aria-label={`Choose image for ${name.toLowerCase()}`} onClick={picker.pick}>
          <span className="swatch" aria-hidden>
            {fill.src && <span className="swatch-fill" style={{ backgroundImage: `url("${assetUrl(fill.src)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
          </span>
          <span className="gradient-label" title={fill.src || undefined}>{file}</span>
        </button>
        <span className="color-row-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Solid color for ${name.toLowerCase()}`}
            data-tooltip="Solid color"
            onClick={() => apply(solid)}
          >
            <Icon d={SOLID_GLYPH} />
          </button>
          <button type="button" className="icon-button" aria-label={`Remove ${name.toLowerCase()}`} data-tooltip="Remove" onClick={onRemove}>
            <Icon d="M4 8h8" />
          </button>
        </span>
      </div>
      <div className="field-grid">
        <Select label="Image fit" value={fill.fit} options={FITS} onChange={(fit) => apply({ ...fill, fit })} />
      </div>
      {picker.element}
    </div>
  )
}
