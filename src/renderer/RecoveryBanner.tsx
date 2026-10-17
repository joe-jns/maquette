import { useEffect, useState } from 'react'
import type { RecoveryOffer } from '../shared/ipc'
import { openDocument } from './state/openDocument'
import { serializeDocument } from '../core/format'
import { confirmDiscard } from './state/commands'
import { docStore } from './state/store'

const ago = (t: number) => {
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return 'il y a moins d’une minute'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `il y a ${h} h` : `le ${new Date(t).toLocaleDateString('fr-BE')}`
}

/** Au démarrage : copies de secours de travail non enregistré, une à la fois. */
export function RecoveryBanner({ ready }: { ready: boolean }) {
  const [offers, setOffers] = useState<RecoveryOffer[]>([])
  useEffect(() => {
    if (ready) void window.maquette.backup.pending().then(setOffers)
  }, [ready])
  const offer = offers[0]
  if (!offer) return null
  const next = () => setOffers((list) => list.slice(1))

  const restore = async () => {
    // Le document affiché a des changements : on demande avant de le remplacer.
    if (!confirmDiscard()) return
    const file = await window.maquette.backup.restore(offer.id)
    next()
    if (!file || !(await openDocument(file))) return
    // Le travail récupéré n'est pas encore dans le fichier : il reste à enregistrer. Il est recopié
    // tout de suite sous la clé de ce lancement, puis l'ancienne copie est effacée (dans cet ordre
    // inverse pour un document enregistré : même clé).
    docStore.setState({ dirty: true })
    const { doc, filePath } = docStore.getState()
    await window.maquette.backup.discard(offer.id)
    await window.maquette.backup.write(filePath, serializeDocument(doc))
  }

  return (
    <div role="alert" className="notice recovery" data-testid="recovery">
      <span>
        Une copie de secours de <strong>{offer.name}</strong> ({ago(offer.savedAt)}) contient des changements non enregistrés.
      </span>
      <button type="button" className="is-primary" onClick={() => void restore()}>Restaurer</button>
      <button type="button" onClick={() => void window.maquette.backup.discard(offer.id).then(next)}>Ignorer</button>
    </div>
  )
}
