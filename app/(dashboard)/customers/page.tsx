import { createClient } from "@/lib/supabase/server"
import { getCustomers } from "@/lib/actions/customers"
import { CustomerTable } from "@/components/customers/customer-table"
import { StatusBoard } from "@/components/customers/status-board"
import { CustomerForm } from "@/components/customers/customer-form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { subDays } from "date-fns"
import type { Customer } from "@/lib/types"

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  const isAdmin = profile?.role === "admin"

  const customers = (await getCustomers()) as Customer[]
  const recentCutoff = subDays(new Date(), 30).toISOString()
  const recentCustomers = customers.filter((c) => c.created_at >= recentCutoff)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">{customers.length} clientes en total</p>
        </div>
        {isAdmin && <CustomerForm />}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos los Clientes</TabsTrigger>
          <TabsTrigger value="board">Status Board</TabsTrigger>
          <TabsTrigger value="recent">Contactos Recientes</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <CustomerTable customers={customers} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="board" className="mt-4">
          <StatusBoard customers={customers} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="recent" className="mt-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              Clientes agregados en los últimos 30 días ({recentCustomers.length})
            </p>
            <CustomerTable customers={recentCustomers} isAdmin={isAdmin} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
