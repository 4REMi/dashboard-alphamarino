"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

const SETTINGS_ID = "default"
const BUCKET = "workspace-assets"
const LOGO_PATH = "logo/current"

export async function getWorkspaceSettings() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("workspace_settings")
    .select("logo_url")
    .eq("id", SETTINGS_ID)
    .maybeSingle()
  return data ?? { logo_url: null }
}

export async function uploadLogo(formData: FormData) {
  const supabase = await createClient()
  const file = formData.get("logo") as File | null

  if (!file || file.size === 0) throw new Error("No se seleccionó ningún archivo")
  if (file.size > 2 * 1024 * 1024) throw new Error("El archivo debe ser menor a 2 MB")
  if (!file.type.startsWith("image/")) throw new Error("Solo se aceptan imágenes")

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png"
  const path = `${LOGO_PATH}.${ext}`

  // Upload to Supabase Storage (upsert to overwrite any previous logo)
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) throw new Error(`Error al subir imagen: ${uploadError.message}`)

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // Bust cache by appending timestamp
  const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`

  // Save URL to workspace_settings
  const { error: dbError } = await supabase
    .from("workspace_settings")
    .upsert({ id: SETTINGS_ID, logo_url: logoUrl, updated_at: new Date().toISOString() })

  if (dbError) throw new Error(`Error al guardar URL: ${dbError.message}`)

  revalidatePath("/", "layout")
  return logoUrl
}

export async function removeLogo() {
  const supabase = await createClient()
  const { error } = await supabase
    .from("workspace_settings")
    .upsert({ id: SETTINGS_ID, logo_url: null, updated_at: new Date().toISOString() })
  if (error) throw error
  revalidatePath("/", "layout")
}
