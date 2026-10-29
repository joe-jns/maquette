import { isInstanceRoot, isMain } from '../../../core/components'
import {
  detachInstance, goToMain, hasOverrides, instanceCount, instanceRootOf, mainOf, resetInstance,
} from '../../canvas/componentActions'
import { useDoc } from '../../state/store'
import { Icon } from '../../ui/icons'
import { Section, useSelection } from './shared'

/**
 * Composant de l'élément sélectionné : un principal montre son nombre d'instances ; une instance
 * montre son principal (« Instance of … ») avec Go to main, Reset changes et Detach ; un calque
 * modifié dans une instance peut être rétabli.
 */
export function ComponentSection() {
  const { nodes } = useSelection()
  const doc = useDoc((s) => s.doc)
  const node = nodes.length === 1 ? nodes[0]! : null
  if (!node) return null

  if (isMain(node)) {
    const count = instanceCount(doc, node.id)
    return (
      <Section title="Main component">
        <p className="component-line" data-testid="component-info">
          <Icon name="component" size={16} />
          <span>{count === 0 ? 'No instances yet' : `${count} instance${count > 1 ? 's' : ''}`}</span>
        </p>
      </Section>
    )
  }

  const nested = node.type === 'frame' && node.instanceOf !== undefined
  const inInstance = node.source !== undefined
  if (!nested && !inInstance) return null
  const main = mainOf(doc, node) ?? (inInstance ? mainOf(doc, instanceRootOf(doc, node.id) ?? node) : null)
  const changed = hasOverrides(node)
  const root = isInstanceRoot(node)

  return (
    <Section title={nested ? 'Instance' : 'Instance layer'}>
      <p className="component-line" data-testid="component-info">
        <Icon name="instance" size={16} />
        <span>{nested ? 'Instance of ' : 'In an instance of '}<strong>{main?.name ?? 'a missing component'}</strong></span>
      </p>
      <div className="component-actions">
        {nested && main && (
          <button type="button" className="component-button" onClick={() => goToMain(node.id)}>Go to main</button>
        )}
        <button
          type="button"
          className="component-button"
          disabled={!changed}
          data-tooltip={changed ? 'Restore the main component’s properties' : 'No changes to reset'}
          onClick={() => resetInstance(node.id)}
        >
          Reset changes
        </button>
        {root && (
          <button type="button" className="component-button" data-tooltip="Turn the instance into ordinary layers" onClick={() => detachInstance(node.id)}>
            Detach
          </button>
        )}
      </div>
    </Section>
  )
}
