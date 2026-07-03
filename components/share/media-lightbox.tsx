"use client"

import { useEffect } from "react"

interface Props {
  tipo:    "video" | "imagen"
  src:     string
  titulo:  string
  onClose: () => void
}

export function MediaLightbox({ tipo, src, titulo, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[rgba(15,23,42,0.85)] backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg"
        aria-label="Cerrar"
      >
        ✕
      </button>

      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute top-5 left-5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2"
      >
        Ver original ↗
      </a>

      <div className="max-w-[90vw] max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        {tipo === "video" ? (
          <video src={src} controls autoPlay className="max-w-[90vw] max-h-[88vh] rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={titulo} className="max-w-[90vw] max-h-[88vh] object-contain rounded-lg" />
        )}
      </div>
    </div>
  )
}
