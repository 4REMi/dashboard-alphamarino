"use client"

import { useState } from "react"

// Texto recortado a N líneas con "ver más" — para que los campos largos
// del concepto no empujen los guiones hacia abajo.
export function ClampText({ text, lines = 3, className = "" }: { text: string; lines?: number; className?: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > lines * 45
  return (
    <div>
      <p className={className} style={open || !long ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-[11px] font-medium text-gray-500 hover:text-gray-800">
          {open ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  )
}
