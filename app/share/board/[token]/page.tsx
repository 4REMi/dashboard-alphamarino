import { notFound } from "next/navigation"
import { getBoardByToken } from "@/lib/actions/ad-lab"

interface Props {
  params: Promise<{ token: string }>
}

export default async function ShareBoardPage({ params }: Props) {
  const { token } = await params
  const result = await getBoardByToken(token)
  if (!result) notFound()

  const { board, ads } = result

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Top bar */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-0.5">
            Alpha Marino · Moodboard
          </p>
          <h1 className="text-lg font-bold text-gray-900">{board.name}</h1>
          {board.description && (
            <p className="text-sm text-gray-500 mt-0.5">{board.description}</p>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {ads.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-20">Este board todavía no tiene nada guardado.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {ads.map((ad) => {
              const imageUrl = ad.cached_image_url ?? ad.image_url
              const videoUrl = ad.cached_video_url ?? ad.video_url
              return (
                <div key={ad.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="aspect-[4/5] bg-gray-100 flex items-center justify-center">
                    {videoUrl ? (
                      <video src={videoUrl} poster={imageUrl ?? undefined} controls className="w-full h-full object-cover" />
                    ) : imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={ad.page_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-400">Sin imagen</span>
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-xs font-semibold text-gray-900 truncate">{ad.page_name}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
