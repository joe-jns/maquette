import { useLayoutEffect, useRef } from 'react'

/** Champ de renommage sur place : Entrée ou clic ailleurs valide, Échap annule, vide = ancien nom. */
export function InlineName({ value, onCommit, onDone }: { value: string; onCommit: (name: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const finished = useRef(false)

  useLayoutEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const finish = (commit: boolean) => {
    if (finished.current) return
    finished.current = true
    const name = ref.current?.value.trim() ?? ''
    if (commit && name && name !== value) onCommit(name)
    onDone()
  }

  return (
    <input
      ref={ref}
      className="inline-name"
      defaultValue={value}
      aria-label="Nouveau nom"
      spellCheck={false}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
    />
  )
}
