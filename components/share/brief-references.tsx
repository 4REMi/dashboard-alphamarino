"use client"

import { useState } from "react"
import type { AdCloneLine } from "@/lib/types"

interface Reference {
  id: string
  type: "video" | "image"
  name: string
  videoSrc?: string
  thumbSrc?: string
  script?: AdCloneLine[]
}

export function BriefReferences({ references }: { references: Reference[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  function toggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-3">
      {references.map((ref) => {
        const isOpen = openId === ref.id
        const isVideo = ref.type === "video"

        return (
          <div
            key={ref.id}
            className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md"
          >
            {/* ── Collapsed header ── */}
            <button
              type="button"
              onClick={() => toggle(ref.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50/60"
            >
              {/* Thumbnail */}
              <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                {ref.thumbSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ref.thumbSrc}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    {isVideo ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                    )}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{ref.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    isVideo ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"
                  }`}>
                    {isVideo ? "Video" : "Imagen"}
                  </span>
                  {isVideo && ref.script && ref.script.length > 0 && (
                    <span className="text-[10px] text-gray-400">
                      · {ref.script.length} líneas de guión
                    </span>
                  )}
                </div>
              </div>

              {/* Chevron */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* ── Expanded content ── */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {/* Media */}
                {isVideo && ref.videoSrc ? (
                  <div className="bg-black">
                    <video
                      controls
                      preload="metadata"
                      poster={ref.thumbSrc}
                      className="w-full max-h-[500px] object-contain"
                      style={{ display: "block" }}
                      autoPlay
                    >
                      <source src={ref.videoSrc} />
                    </video>
                  </div>
                ) : ref.thumbSrc ? (
                  <div className="bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ref.thumbSrc}
                      alt={ref.name}
                      className="w-full max-h-[500px] object-contain"
                    />
                  </div>
                ) : null}

                {/* Script (only for videos with script) */}
                {isVideo && ref.script && ref.script.length > 0 && (
                  <div>
                    <div className="px-5 py-3 bg-gray-50/80 border-t border-b border-gray-100">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                        Guión tropicalizado
                      </p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {ref.script.map((line, i) => (
                        <div key={i} className="grid sm:grid-cols-2">
                          <div className="px-5 py-3.5 sm:border-r border-gray-100">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                {i + 1}
                              </span>
                              {line.speaker && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                  {line.speaker}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-400 line-through leading-relaxed">
                              {line.original}
                            </p>
                          </div>
                          <div className="px-5 py-3.5 bg-indigo-50/30">
                            <p className="text-sm text-gray-900 font-medium leading-relaxed">
                              {line.adapted}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
