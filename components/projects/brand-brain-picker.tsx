"use client"

import { cn } from "@/lib/utils"
import type { BrandBrain } from "@/lib/types"

interface Props {
  brandBrains: BrandBrain[]
  value: string // "none" or brand brain id
  onChange: (id: string) => void
}

// Swatch-style pills instead of a plain <select> — we already have each
// brand's logo and color palette on file (BrandBrain.logo_square_url /
// brand_colors), so showing them here makes picking the right one a glance
// instead of reading names off a dropdown list.
export function BrandBrainPicker({ brandBrains, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange("none")}
        className={cn(
          "flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border text-sm font-medium transition-colors",
          value === "none"
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40"
        )}
      >
        <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">—</span>
        Sin marca
      </button>

      {brandBrains.map((b) => {
        const selected = b.id === value
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onChange(b.id)}
            title={b.industry ? `${b.name} · ${b.industry}` : b.name}
            className={cn(
              "flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border text-sm font-medium transition-colors max-w-[220px]",
              selected
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-foreground hover:border-primary/40"
            )}
          >
            <span className="w-6 h-6 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
              {b.logo_square_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logo_square_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-semibold text-muted-foreground">{b.initials ?? b.name[0]}</span>
              )}
            </span>
            <span className="truncate">{b.name}</span>
            {b.brand_colors?.length > 0 && (
              <span className="flex items-center -space-x-1 flex-shrink-0">
                {b.brand_colors.slice(0, 3).map((c, i) => (
                  <span
                    key={i}
                    className="w-2.5 h-2.5 rounded-full border border-white"
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
