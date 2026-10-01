import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PayrollView } from "@/components/employees/payroll-view"

// Nómina — solo admin.
export default async function PayrollPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  if (profile?.role !== "admin") redirect("/employees")
  const { data: projects } = await supabase.from("projects").select("id, name").neq("status", "Archived").order("name")
  return (
    <div className="p-6 space-y-5">
      <div>
        <Link href="/employees" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Equipo</Link>
        <h1 className="text-2xl font-bold">Nómina</h1>
        <p className="text-sm text-muted-foreground">Salarios, bonos y comisiones. Al pagar, el gasto se registra en Finanzas. Solo tú la ves.</p>
      </div>
      <PayrollView projects={(projects ?? []) as { id: string; name: string }[]} />
    </div>
  )
}
