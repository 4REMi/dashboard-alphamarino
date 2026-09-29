"use client"

import { useEffect } from "react"

export function PrintButton() {
  // Abre el diálogo de impresión solo al llegar (con un respiro para que
  // carguen fuentes e imágenes).
  useEffect(() => { const t = setTimeout(() => window.print(), 1200); return () => clearTimeout(t) }, [])
  return (
    <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-[#1565C0] text-white text-sm font-semibold">
      Imprimir / Guardar PDF
    </button>
  )
}
