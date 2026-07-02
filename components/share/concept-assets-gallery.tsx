"use client"

import { useState } from "react"
import { ClientAssetReview } from "@/components/share/client-asset-review"
import type { ClientReviewStatus } from "@/lib/types"

interface GalleryAsset {
  id:              string
  format:          string | null
  platform:        string | null
  asset_url:       string | null
  file_path:       string | null
  thumbnail_path:  string | null
  file_type:       string | null
  client_status:   ClientReviewStatus | null
  client_feedback: string | null
  concept_name:    string | null
  concept_angle:   string | null
  brief_id:        string | null
}

function detectType(a: GalleryAsset): "video" | "image" | "other" {
  if (a.file_type === "video" || a.file_type === "image") return a.file_type
  const url = a.file_path ?? a.asset_url ?? ""
  const path = url.toLowerCase().split("?")[0]
  if (/\.(mp4|mov|webm|m4v|ogg)$/.test(path)) return "video"
  if (/\.(jpg|jpeg|png|webp|gif|avif|svg)$/.test(path)) return "image"
  return "other"
}

export function ConceptAssetsGallery({ assets, firstPendingId }: {
  assets: GalleryAsset[]
  firstPendingId?: string
}) {
  const videos = assets.filter((a) => detectType(a) === "video")
  const images = assets.filter((a) => detectType(a) !== "video")

  const tabs = [
    ...(videos.length > 0 ? [{ key: "video" as const, label: "Video", items: videos }] : []),
    ...(images.length > 0 ? [{ key: "image" as const, label: "Estático", items: images }] : []),
  ]

  const [active, setActive] = useState(tabs[0]?.key ?? "video")

  if (tabs.length === 0) return null
  const single = tabs.length === 1
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0]

  return (
    <div className="space-y-4">
      {!single && (
        <div className="flex gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab.key === t.key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {t.label} <span className="opacity-60">({t.items.length})</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {activeTab.items.map((a) => (
          <div key={a.id} id={a.id === firstPendingId ? "first-pending" : undefined}>
            {a.brief_id && (
              <p className="text-[11px] text-muted-foreground mb-1.5 pl-1">↳ producido a partir de un guión aprobado</p>
            )}
            <ClientAssetReview
              asset={{
                id:              a.id,
                format:          a.format,
                platform:        a.platform,
                asset_url:       a.asset_url,
                file_path:       a.file_path,
                thumbnail_path:  a.thumbnail_path,
                file_type:       a.file_type,
                client_status:   a.client_status,
                client_feedback: a.client_feedback,
                concept_name:    a.concept_name,
                concept_angle:   a.concept_angle,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
