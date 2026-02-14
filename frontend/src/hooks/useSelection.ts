import { useState, useCallback } from "react"

export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }, [])

  const toggleSelectAll = useCallback((items: { name: string }[]) => {
    const names = items.map((i) => i.name)
    setSelected((prev) => {
      const allSelected = names.every((n) => prev.has(n))
      const next = new Set(prev)
      if (allSelected) {
        names.forEach((n) => next.delete(n))
      } else {
        names.forEach((n) => next.add(n))
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
  }, [])

  return { selected, toggleSelect, toggleSelectAll, clearSelection }
}
