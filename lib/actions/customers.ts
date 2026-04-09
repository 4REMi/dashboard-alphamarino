"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { CustomerStatus } from "@/lib/types"

export async function getCustomers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("*, projects(id, name, status)")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function importCustomers(
  rows: Array<{
    name: string
    company?: string | null
    email?: string | null
    phone?: string | null
    status?: string
  }>
): Promise<{ inserted: number; skipped: number }> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("customers")
    .select("name, email")

  const existingNames = new Set(
    (existing ?? []).map((c) => c.name.toLowerCase().trim())
  )
  const existingEmails = new Set(
    (existing ?? [])
      .filter((c) => c.email)
      .map((c) => (c.email as string).toLowerCase().trim())
  )

  const toInsert = rows.filter((row) => {
    const nameDup = existingNames.has(row.name.toLowerCase().trim())
    const emailDup =
      row.email && existingEmails.has(row.email.toLowerCase().trim())
    return !nameDup && !emailDup
  })

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: rows.length }
  }

  const validStatuses: CustomerStatus[] = ["Prospect", "Active", "Inactive"]

  const { error } = await supabase.from("customers").insert(
    toInsert.map((row) => ({
      name: row.name.trim(),
      company: row.company?.trim() || null,
      email: row.email?.trim() || null,
      phone: row.phone?.trim() || null,
      status: validStatuses.includes(row.status as CustomerStatus)
        ? (row.status as CustomerStatus)
        : "Prospect",
    }))
  )

  if (error) throw error
  revalidatePath("/customers")
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length }
}

export async function getCustomer(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("*, projects(*)")
    .eq("id", id)
    .single()

  if (error) throw error
  return data
}

export async function createCustomer(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from("customers").insert({
    name: formData.get("name") as string,
    status: (formData.get("status") as CustomerStatus) ?? "Prospect",
    company: formData.get("company") as string || null,
    email: formData.get("email") as string || null,
    phone: formData.get("phone") as string || null,
  })

  if (error) throw error
  revalidatePath("/customers")
}

export async function updateCustomer(id: string, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("customers")
    .update({
      name: formData.get("name") as string,
      status: formData.get("status") as CustomerStatus,
      company: formData.get("company") as string || null,
      email: formData.get("email") as string || null,
      phone: formData.get("phone") as string || null,
    })
    .eq("id", id)

  if (error) throw error
  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
}

export async function updateCustomerStatus(id: string, status: CustomerStatus) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("customers")
    .update({ status })
    .eq("id", id)

  if (error) throw error
  revalidatePath("/customers")
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("customers").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/customers")
}
