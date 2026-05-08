"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "ad-lab:recent-angulos"
const MAX_ITEMS   = 5

export function useRecentAngulos() {
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setRecents(JSON.parse(raw) as string[])
    } catch {
      // ignore
    }
  }, [])

  const saveAngulo = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setRecents((prev) => {
      // Move to front if duplicate, otherwise prepend; keep only MAX_ITEMS
      const deduped = [trimmed, ...prev.filter((s) => s !== trimmed)].slice(0, MAX_ITEMS)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped)) } catch { /* ignore */ }
      return deduped
    })
  }, [])

  return { recents, saveAngulo }
}
