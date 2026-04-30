import { notFound } from "next/navigation"
import { getAdCloneByToken } from "@/lib/actions/ad-clone"
import type { AdCloneLine } from "@/lib/types"

interface Props {
  params: Promise<{ token: string }>
}

export default async function ShareClonePage({ params }: Props) {
  const { token } = await params
  const clone = await getAdCloneByToken(token)

  if (!clone || clone.status !== "ready") notFound()

  const savedAd = clone.saved_ad
  const videoUrl = savedAd?.cached_video_url ?? savedAd?.video_url ?? null
  const thumbUrl = savedAd?.cached_image_url ?? savedAd?.image_url ?? null
  const adaptedLines: AdCloneLine[] = clone.adapted_lines ?? []

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Top bar */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-0.5">
              Alpha Marino · Ad Clone
            </p>
            <h1 className="text-lg font-bold text-gray-900">
              {savedAd?.page_name ?? "Anuncio clonado"}
            </h1>
          </div>
          {clone.brand_brain && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Adaptado para</p>
              <p className="text-sm font-semibold text-gray-900">{clone.brand_brain.name}</p>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-[320px_1fr] gap-8">
          {/* Video column */}
          <div className="space-y-4">
            <div className="bg-black rounded-2xl overflow-hidden aspect-[9/16] flex items-center justify-center">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  poster={thumbUrl ?? undefined}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl}
                  alt={savedAd?.page_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-gray-600 text-sm">Sin preview</div>
              )}
            </div>
            <p className="text-xs text-gray-400 text-center">Referencia: {savedAd?.page_name}</p>
          </div>

          {/* Script column */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-gray-900">Guión adaptado</h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Listo
              </span>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              A continuación encontrarás el guión original y su adaptación línea por línea. Graba el audio nuevo siguiendo el timing del video de referencia.
            </p>

            <div className="space-y-3">
              {adaptedLines.map((line, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  {/* Line number + speaker */}
                  <div className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    {line.speaker && (
                      <span className="text-xs font-semibold text-indigo-600">Locutor {line.speaker}</span>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                    {/* Original */}
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Original</p>
                      <p className="text-sm text-gray-500 leading-relaxed">{line.original}</p>
                    </div>
                    {/* Adapted */}
                    <div className="px-4 py-3 bg-indigo-50/50">
                      <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider mb-1.5">Adaptación</p>
                      <p className="text-sm text-gray-900 font-medium leading-relaxed">{line.adapted}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {adaptedLines.length === 0 && (
              <div className="py-16 text-center text-gray-400">
                <p className="text-sm">Sin líneas disponibles</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 mt-16 py-6">
        <p className="text-center text-xs text-gray-400">
          Generado por Alpha Marino · Dashboard
        </p>
      </footer>
    </div>
  )
}
