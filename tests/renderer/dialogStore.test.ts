import { describe, it, expect, beforeEach } from 'vitest'
import { dialogStore, validIndex } from '../../src/renderer/dialog/dialogStore'
import type { DialogRequest } from '../../src/shared/ipc'

const question = (message: string): DialogRequest => ({
  message,
  buttons: [{ label: 'Oui', kind: 'primary' }, { label: 'Non' }, { label: 'Annuler' }],
  cancelIndex: 2,
  defaultIndex: 0,
})

beforeEach(() => dialogStore.setState({ queue: [] }))

describe('file des questions', () => {
  it('les questions attendent leur tour, dans l’ordre d’arrivée', async () => {
    const first = dialogStore.getState().ask(question('A ?'))
    const second = dialogStore.getState().ask(question('B ?'))
    expect(dialogStore.getState().queue.map((d) => d.request.message)).toEqual(['A ?', 'B ?'])

    dialogStore.getState().answer(dialogStore.getState().queue[0]!.id, 1)
    expect(await first).toBe(1)
    expect(dialogStore.getState().queue.map((d) => d.request.message)).toEqual(['B ?'])

    dialogStore.getState().answer(dialogStore.getState().queue[0]!.id, 0)
    expect(await second).toBe(0)
    expect(dialogStore.getState().queue).toEqual([])
  })

  it('une réponse hors des boutons vaut « annuler »', async () => {
    const asked = dialogStore.getState().ask(question('C ?'))
    dialogStore.getState().answer(dialogStore.getState().queue[0]!.id, 7)
    expect(await asked).toBe(2)
    expect(validIndex(question('D ?'), -1)).toBe(2)
    expect(validIndex(question('D ?'), 1.5)).toBe(2)
  })

  it('une seconde réponse à la même question est ignorée', async () => {
    const asked = dialogStore.getState().ask(question('E ?'))
    const later = dialogStore.getState().ask(question('F ?'))
    const id = dialogStore.getState().queue[0]!.id
    dialogStore.getState().answer(id, 0)
    dialogStore.getState().answer(id, 1)
    expect(await asked).toBe(0)
    expect(dialogStore.getState().queue.map((d) => d.request.message)).toEqual(['F ?'])
    dialogStore.getState().answer(dialogStore.getState().queue[0]!.id, 1)
    expect(await later).toBe(1)
  })
})
