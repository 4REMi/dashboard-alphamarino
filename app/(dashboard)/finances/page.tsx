import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFinancialSummary, getIncome, getProjectExpenses, getRecurringExpenses } from "@/lib/actions/finances"
import { getProjects } from "@/lib/actions/projects"
import { IncomeChart } from "@/components/finances/income-chart"
import { IncomeForm } from "@/components/finances/income-form"
import { ExpenseForm } from "@/components/finances/expense-form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { deleteRecurringExpense, deleteIncome } from "@/lib/actions/finances"
import { Trash2, TrendingUp, TrendingDown, DollarSign, Repeat, AlertCircle } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { normalizeToMonthly } from "@/lib/types"
import type { Income, RecurringExpense, ProjectExpense, Project, ExpenseFrequency } from "@/lib/types"

const frequencyLabels: Record<string, string> = {
  Monthly: "Mensual",
  Weekly: "Semanal",
  Annual: "Anual",
  Semestral: "Semestral",
  "One-time": "Único",
}

const categoryLabels: Record<string, string> = {
  Payroll: "Nómina",
  Software: "Software",
  Rent: "Renta",
  Services: "Servicios",
  Other: "Otros",
}

const categoryColors: Record<string, string> = {
  Payroll: "bg-blue-100 text-blue-700",
  Software: "bg-purple-100 text-purple-700",
  Rent: "bg-yellow-100 text-yellow-700",
  Services: "bg-orange-100 text-orange-700",
  Other: "bg-gray-100 text-gray-700",
}

export default async function FinancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()

  if (profile?.role !== "admin") {
    redirect("/")
  }

  const [summary, income, expenses, recurring, projects] = await Promise.all([
    getFinancialSummary(),
    getIncome(),
    getProjectExpenses(),
    getRecurringExpenses(),
    getProjects(),
  ])

  const monthlyRecurringTotal = recurring
    .filter((e: RecurringExpense) => e.is_active)
    .reduce((s: number, e: RecurringExpense) => s + normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency), 0)

  // Expenses expiring in the next 30 days
  const today = new Date()
  const in30Days = new Date(today)
  in30Days.setDate(today.getDate() + 30)
  const upcomingExpenses = (recurring as RecurringExpense[]).filter((e) => {
    if (!e.next_payment_date || !e.is_active) return false
    const d = new Date(e.next_payment_date)
    return d >= today && d <= in30Days
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Finanzas</h1>
          <p className="text-muted-foreground text-sm mt-1">Resumen financiero del mes actual</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Ingresos del Mes</p>
              <div className="p-2 bg-green-50 rounded-lg">
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.monthlyIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Gastos del Mes</p>
              <div className="p-2 bg-red-50 rounded-lg">
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(summary.monthlyExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Margen Neto</p>
              <div className={`p-2 rounded-lg ${summary.netMargin >= 0 ? "bg-blue-50" : "bg-red-50"}`}>
                <DollarSign className={`w-4 h-4 ${summary.netMargin >= 0 ? "text-blue-600" : "text-red-600"}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${summary.netMargin >= 0 ? "text-blue-700" : "text-red-700"}`}>
              {formatCurrency(summary.netMargin)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">MRR</p>
              <div className="p-2 bg-purple-50 rounded-lg">
                <Repeat className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-purple-700">{formatCurrency(summary.mrr)}</p>
            <p className="text-xs text-muted-foreground mt-1">fees activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Gastos Fijos/Mes</p>
              <div className="p-2 bg-slate-100 rounded-lg">
                <DollarSign className="w-4 h-4 text-slate-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(monthlyRecurringTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming payment alerts */}
      {upcomingExpenses.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Pagos próximos (30 días)</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {upcomingExpenses.map((e) => (
                  <span key={e.id} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {e.name} — {formatDate(e.next_payment_date!)} ({formatCurrency(e.amount)})
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="income">Ingresos</TabsTrigger>
          <TabsTrigger value="expenses">Gastos Recurrentes</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Ingresos vs Gastos por Mes</CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeChart income={income as Income[]} expenses={expenses as ProjectExpense[]} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Income Tab */}
        <TabsContent value="income" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <IncomeForm projects={projects as Project[]} />
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descripción</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Proyecto</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Factura</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Monto</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {(income as Income[]).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No hay ingresos registrados
                    </td>
                  </tr>
                )}
                {(income as Income[]).map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(item.date)}</td>
                    <td className="px-4 py-3">{item.description ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(item.project as { name: string } | undefined)?.name ?? "General"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.invoice_number ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={async () => { "use server"; await deleteIncome(item.id) }}>
                        <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
              {(income as Income[]).length > 0 && (
                <tfoot className="bg-muted/30 border-t">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 font-semibold">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {formatCurrency((income as Income[]).reduce((s, i) => s + Number(i.amount), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </TabsContent>

        {/* Recurring Expenses Tab */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Total mensual estimado:{" "}
                <span className="font-bold text-foreground">{formatCurrency(monthlyRecurringTotal)}</span>
              </p>
            </div>
            <ExpenseForm />
          </div>

          {/* Group by category */}
          {(["Payroll", "Software", "Rent", "Services", "Other"] as const).map((category) => {
            const categoryItems = (recurring as RecurringExpense[]).filter((e) => e.category === category)
            if (categoryItems.length === 0) return null
            const categoryTotal = categoryItems
              .filter((e) => e.is_active)
              .reduce((s, e) => s + normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency), 0)

            return (
              <div key={category}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${categoryColors[category]}`}>
                    {categoryLabels[category]}
                  </span>
                  <span className="text-sm text-muted-foreground">{formatCurrency(categoryTotal)}/mes</span>
                </div>
                <div className="border rounded-lg overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nombre</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Frecuencia</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Próx. Pago</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Monto</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryItems.map((expense) => {
                        const isUpcoming = expense.next_payment_date &&
                          new Date(expense.next_payment_date) >= today &&
                          new Date(expense.next_payment_date) <= in30Days
                        return (
                          <tr key={expense.id} className="border-t hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">{expense.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{frequencyLabels[expense.frequency]}</td>
                            <td className={`px-4 py-3 text-sm ${isUpcoming ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                              {expense.next_payment_date ? formatDate(expense.next_payment_date) : "—"}
                              {isUpcoming && " ⚠"}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={expense.is_active ? "success" : "secondary"}>
                                {expense.is_active ? "Activo" : "Inactivo"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {formatCurrency(expense.amount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <ExpenseForm
                                  expense={expense}
                                  trigger={
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <span className="sr-only">Editar</span>
                                      ✏️
                                    </Button>
                                  }
                                />
                                <form action={async () => { "use server"; await deleteRecurringExpense(expense.id) }}>
                                  <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </form>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {recurring.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No hay gastos recurrentes registrados
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
