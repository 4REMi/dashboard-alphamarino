"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { CustomerStatus } from "@/lib/types"

export async function getCustomers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
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
