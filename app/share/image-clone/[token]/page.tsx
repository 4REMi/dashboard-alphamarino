import { notFound } from "next/navigation"
import { getImageCloneByToken } from "@/lib/actions/image-clone"
import type { ImageCloneLine } from "@/lib/types"

interface Props {
  params: Promise<{ token: string }>
}

export default async function ShareImageClonePage({ params }: Props) {
  const { token } = await params
  const clone = await getImageCloneByToken(token)

  if (!clone || clone.status !== "done") notFound()

  const savedAd = clone.saved_ad
  const thumbUrl = savedAd?.cached_image_url ?? savedAd?.image_url ?? null
  const adaptedLines: ImageCloneLine[] = clone.adapted_lines ?? []
  const generatedUrls: string[] = clone.generated_image_urls ?? []

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Top bar */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-0.5">
              Alpha Marino · Image Clone
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

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-[280px_1fr] gap-8 items-start">

          {/* Reference column */}
          <div className="sticky top-[73px] space-y-4">
            {/* Original ad image */}
            {thumbUrl && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Anuncio original</p>
                <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl} alt={savedAd?.page_name} className="w-full object-cover" />
                </div>
                <p className="text-xs text-gray-400 text-center">{savedAd?.page_name}</p>
              </div>
            )}

            {/* Adapted text */}
            {adaptedLines.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Copy adaptado</p>
                <div className="space-y-2">
                  {adaptedLines.map((line, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5">
                      <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-1">
                        {line.element}
                      </p>
                      <p className="text-xs font-medium text-gray-900 leading-relaxed">{line.adapted}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Generated images column */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-gray-900">Imágenes generadas</h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                {generatedUrls.length} imagen{generatedUrls.length !== 1 ? "es" : ""}
              </span>
            </div>

            {generatedUrls.length > 0 ? (
              <div className={`grid gap-4 ${generatedUrls.length > 1 ? "sm:grid-cols-2" : "grid-cols-1 max-w-sm"}`}>
                {generatedUrls.map((url, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Generado ${i + 1}`} className="w-full object-cover" />
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                      <span className="text-xs text-gray-500">Opción {i + 1}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="text-xs text-violet-600 hover:text-violet-800 font-semibold hover:underline"
                      >
                        Descargar
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-gray-400">
                <p className="text-sm">Sin imágenes generadas</p>
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
