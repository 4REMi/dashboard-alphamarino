import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getDomains } from "@/lib/actions/finances"
import { getCustomers } from "@/lib/actions/customers"
import { DomainTable } from "@/components/finances/domain-table"
import { Globe } from "lucide-react"
import type { Domain, Customer } from "@/lib/types"
import { can } from "@/lib/permissions"

export default async function DomainsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, permissions").eq("id", user!.id).single()

  if (!can(profile, "view_global_finances")) {
    redirect("/")
  }

  const [domains, customers] = await Promise.all([
    getDomains() as Promise<Domain[]>,
    getCustomers() as Promise<Customer[]>,
  ])

  const expiring = domains.filter((d) => {
    if (!d.renewal_date) return false
    const diff = new Date(d.renewal_date).getTime() - Date.now()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Globe className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Dominios</h1>
          <p className="text-muted-foreground text-sm">
            {domains.length} dominio{domains.length !== 1 ? "s" : ""} registrado{domains.length !== 1 ? "s" : ""}
            {expiring.length > 0 && (
              <span className="text-amber-600 font-medium ml-2">
                · {expiring.length} por vencer
              </span>
            )}
          </p>
        </div>
      </div>

      <DomainTable initialDomains={domains} customers={customers} />
    </div>
  )
}
