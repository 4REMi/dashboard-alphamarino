import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ControlReview } from "@/components/services/control-review"

// Revisión de control de entregables (admin/subadmin).
export default async function ControlReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  if (profile?.role !== "admin" && profile?.role !== "subadmin") redirect("/services")
  return <div className="p-6"><ControlReview /></div>
}
