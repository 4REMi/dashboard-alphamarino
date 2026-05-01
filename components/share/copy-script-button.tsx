"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import type { AdCloneLine } from "@/lib/types"

interface Props {
  lines: AdCloneLine[]
  brandName: string | null
}

export function CopyScriptButton({ lines, brandName }: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const header = brandName ? `${brandName} — Guión adaptado\n${"─".repeat(40)}\n\n` : ""
    const body = lines
      .map((line, i) => `${i + 1}. ${line.adapted}`)
      .join("\n\n")
    navigator.clipboard.writeText(header + body).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
    >
      {copied
        ? <Check className="w-4 h-4 text-emerald-500" />
        : <Copy className="w-4 h-4" />
      }
      {copied ? "Copiado" : "Copiar guión"}
    </button>
  )
}
