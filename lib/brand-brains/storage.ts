import { createAdminClient } from "@/lib/supabase/admin"

// Sin "use server": descarga una URL arbitraria a Storage, no debe quedar
// expuesta como server action. La usan createBrandBrain (sesión) y el MCP.
// Download a remote URL and upload it to Storage, return public URL or null
export async function mirrorUrlToStorage(
  brainId: string,
  sourceUrl: string,
  filename: string,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const buffer      = await res.arrayBuffer()
    const contentType = res.headers.get("content-type") ?? "image/jpeg"
    const ext         = (contentType.split("/")[1]?.split(";")[0] ?? "jpg").slice(0, 4)
    const path        = `${brainId}/${filename}.${ext}`
    const admin       = createAdminClient()
    const { error }   = await admin.storage.from("brand-brains").upload(path, buffer, { contentType, upsert: true })
    if (error) { console.error("[brand-brains] mirrorUrlToStorage error:", error.message); return null }
    const { data: { publicUrl } } = admin.storage.from("brand-brains").getPublicUrl(path)
    return publicUrl
  } catch (e) {
    console.error("[brand-brains] mirrorUrlToStorage exception:", e)
    return null
  }
}
