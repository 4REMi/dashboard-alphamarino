// Copia una URL remota al bucket "ad-lab" de Supabase Storage.
// SIN "use server": lo usan las server actions de Ad Lab (lib/actions/ad-lab.ts)
// y las rutas de la extensión de Chrome (lib/ad-lab/extension.ts), que no
// tienen sesión y escriben con el cliente admin.

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Descarga `sourceUrl` y la sube a `ad-lab/{storagePath}`.
 * Regresa la URL pública, o null si la descarga o la subida fallan.
 * maxSizeMB = 0 → sin límite de tamaño.
 */
export async function mirrorToStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  sourceUrl: string,
  storagePath: string,
  maxSizeMB = 0,
  timeoutMs = 30_000,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null

    if (maxSizeMB > 0) {
      const len = Number(res.headers.get("content-length") ?? 0)
      if (len > maxSizeMB * 1024 * 1024) return null
    }

    const buffer      = await res.arrayBuffer()
    const contentType = res.headers.get("content-type") ?? "application/octet-stream"

    const { error } = await supabase.storage
      .from("ad-lab")
      .upload(storagePath, buffer, { contentType, upsert: true })
    if (error) return null

    const { data: { publicUrl } } = supabase.storage.from("ad-lab").getPublicUrl(storagePath)
    return publicUrl
  } catch {
    return null
  }
}
