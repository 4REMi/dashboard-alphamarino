// Video y miniatura de un anuncio guardado (saved_ads), en un solo lugar.
// SIN "use server": lo usan componentes de cliente y server actions.
//
// Un anuncio guardado puede tener su media en tres sitios, en este orden:
//   1. cached_video_url / cached_image_url — copia propia en Storage.
//   2. video_url / image_url — columnas planas (URL original de Meta).
//   3. ad_snapshot — el anuncio completo congelado al guardarlo (cards[],
//      videos[], images[]). Los anuncios guardados antes del arreglo de
//      "varias formas de Apify" traen las columnas planas vacías y solo el
//      snapshot tiene el video.
// La vista de Boards ya miraba los tres (board-detail.tsx / ad-detail-modal);
// el modal de brief, la transcripción del brief y la página compartida solo
// miraban 1 y 2, así que esos anuncios aparecían sin video ni miniatura (y
// sin poder transcribirse).

export interface SavedAdMediaSource {
  cached_video_url?: string | null
  video_url?: string | null
  cached_image_url?: string | null
  image_url?: string | null
  format?: string | null
  ad_snapshot?: unknown
}

export interface SavedAdMedia {
  videoUrl: string | null
  thumbUrl: string | null
  isVideo: boolean
}

type SnapshotShape = {
  snapshot?: {
    cards?: Record<string, string | null | undefined>[]
    videos?: Record<string, string | null | undefined>[]
    images?: Record<string, string | null | undefined>[]
  }
}

const first = (...vals: (string | null | undefined)[]): string | null => vals.find((v) => typeof v === "string" && v.trim() !== "") ?? null

export function resolveSavedAdMedia(ad: SavedAdMediaSource): SavedAdMedia {
  const snap = (ad.ad_snapshot as SnapshotShape | null | undefined)?.snapshot
  const card = snap?.cards?.[0]
  const videoItem = snap?.videos?.[0]
  const imageItem = snap?.images?.[0]

  const videoUrl = first(
    ad.cached_video_url, ad.video_url,
    card?.video_hd_url, card?.video_sd_url, videoItem?.video_hd_url, videoItem?.video_sd_url,
  )
  const thumbUrl = first(
    ad.cached_image_url, ad.image_url,
    card?.video_preview_image_url, videoItem?.video_preview_image_url,
    card?.resized_image_url, card?.original_image_url,
    imageItem?.resized_image_url, imageItem?.original_image_url,
  )
  return { videoUrl, thumbUrl, isVideo: ad.format === "video" || !!videoUrl }
}
