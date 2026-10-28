import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getQuoteLeads } from "@/lib/actions/quotes"
import { QuotesHub } from "@/components/quotes/quotes-hub"

// Hub de cotizaciones (solo admin).
export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/")
  const leads = await getQuoteLeads()
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cotizaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">Leads que requieren propuesta: llegan de GHL (Proposal Pending), del atajo o a mano.</p>
      </div>
      <QuotesHub initialLeads={leads} />
    </div>
  )
}
