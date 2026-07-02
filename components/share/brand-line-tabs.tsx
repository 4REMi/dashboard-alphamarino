"use client"

import { useState, type ReactNode } from "react"

interface Tab {
  key:     string
  label:   string
  color:   string | null
  count:   number
  content: ReactNode
}

export function BrandLineTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key)
  if (tabs.length === 0) return null
  if (tabs.length === 1) return <>{tabs[0].content}</>

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0]

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-10 sticky top-16 sm:top-20 z-10 bg-[#f8f9fb]/95 backdrop-blur-sm py-3 -mx-4 sm:-mx-8 px-4 sm:px-8 border-b border-slate-200/60">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold transition-colors ${
              activeTab.key === t.key
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color ?? "#64748b" }} />
            {t.label}
            <span className={activeTab.key === t.key ? "opacity-60" : "text-slate-400"}>({t.count})</span>
          </button>
        ))}
      </div>

      {activeTab.content}
    </div>
  )
}
