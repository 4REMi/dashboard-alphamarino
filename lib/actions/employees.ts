"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Role } from "@/lib/types"
import type { UserPermissions } from "@/lib/permissions"

export async function updateUserPermissions(userId: string, permissions: UserPermissions) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({ permissions })
    .eq("id", userId)
  if (error) throw error
  revalidatePath(`/employees/${userId}`)
}

export async function getEmployees() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("*, position_obj:positions(id, name)")
    .order("full_name")
  if (error) {
    // positions table may not exist yet — fall back to base select
    const { data: fallback, error: e2 } = await supabase.from("profiles").select("*").order("full_name")
    if (e2) throw e2
    return fallback
  }
  return data
}

export async function getEmployee(id: string) {
  const supabase = await createClient()

  const [profileRes, projectsRes, tasksRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).single(),
    supabase
      .from("project_members")
      .select("project:projects(id, name, status, progress, project_type:project_types(name), customer:customers(name))")
      .eq("profile_id", id),
    supabase
      .from("tasks")
      .select("*, project:projects(id, name)")
      .eq("assignee_id", id)
      .neq("status", "Done")
      .order("due_date", { ascending: true }),
  ])

  if (profileRes.error) throw profileRes.error

  const projects = (projectsRes.data ?? [])
    .map((pm: Record<string, unknown>) => {
      const proj = pm.project
      return Array.isArray(proj) ? proj[0] : proj
    })
    .filter(Boolean)

  return {
    profile: profileRes.data,
    projects,
    tasks: tasksRes.data ?? [],
  }
}

export async function createEmployee(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const fullName = formData.get("full_name") as string
  const position = (formData.get("position") as string) || null
  const positionIdRaw = formData.get("position_id") as string
  const phone = (formData.get("phone") as string) || null
  const role = (formData.get("role") as Role) ?? "employee"

  // Use Service Role admin client to invite — anon key doesn't have auth.admin privileges
  const adminClient = createAdminClient()
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')}/auth/callback`,
  })

  if (inviteError) throw inviteError

  // Upsert profile (use regular client so RLS applies normally)
  if (invited?.user?.id) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: invited.user.id,
      full_name: fullName,
      email,
      role,
      position,
      position_id: positionIdRaw && positionIdRaw !== "none" ? positionIdRaw : null,
      phone,
    }, { onConflict: "id" })

    if (profileError) throw profileError
  }

  revalidatePath("/employees")
}

export async function updateEmployee(id: string, formData: FormData) {
  const supabase = await createClient()
  const role = formData.get("role") as string
  const positionIdRaw = formData.get("position_id") as string
  const updates: Record<string, unknown> = {
    full_name: formData.get("full_name") as string,
    position: (formData.get("position") as string) || null,
    position_id: positionIdRaw && positionIdRaw !== "none" ? positionIdRaw : null,
    phone: (formData.get("phone") as string) || null,
  }
  if (role) updates.role = role
  const { error } = await supabase.from("profiles").update(updates).eq("id", id)
  if (error) throw error
  revalidatePath("/employees")
  revalidatePath(`/employees/${id}`)
}

export async function uploadAvatar(id: string, formData: FormData) {
  const supabase = await createClient()
  const file = formData.get("avatar") as File | null
  if (!file || file.size === 0) throw new Error("No se seleccionó archivo")
  if (file.size > 3 * 1024 * 1024) throw new Error("Máx 3 MB")
  if (!file.type.startsWith("image/")) throw new Error("Solo imágenes")

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
  const path = `avatars/${id}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from("workspace-assets")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage.from("workspace-assets").getPublicUrl(path)
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`

  const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", id)
  if (error) throw error

  revalidatePath("/employees")
  revalidatePath(`/employees/${id}`)
  return avatarUrl
}

export async function resendPasswordLink(email: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')}/auth/callback`,
  })
  if (error) throw error
}

export async function updateOwnProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Update base fields first (always exist)
  const { error } = await supabase.from("profiles").update({
    full_name: formData.get("full_name") as string,
    phone: (formData.get("phone") as string) || null,
  }).eq("id", user.id)

  if (error) throw error

  // Try to persist language — column may not exist yet (PGRST204), ignore if so
  const language = formData.get("language") as string | null
  if (language) {
    await supabase.from("profiles").update({ language } as Record<string, unknown>).eq("id", user.id)
    // error intentionally ignored — column added via migration 004
  }

  revalidatePath("/")
  revalidatePath("/employees")
  revalidatePath(`/employees/${user.id}`)
}

export async function setLanguagePreference(locale: string) {
  "use server"
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Try to persist to profile — column may not exist yet (PGRST204), ignore if so
  await supabase.from("profiles").update({ language: locale } as Record<string, unknown>).eq("id", user.id)

  // Always set cookie — this is what drives the UI immediately
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()
  cookieStore.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })

  revalidatePath("/")
}

export async function uploadOwnAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return uploadAvatar(user.id, formData)
}

export async function deleteEmployee(id: string) {
  // Delete from auth.users via admin client (profiles will cascade)
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.deleteUser(id)
  if (error) throw error
  revalidatePath("/employees")
}
