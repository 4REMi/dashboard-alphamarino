import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  getFinancialSummary,
  getIncome,
  getProjectExpenses,
  getRecurringExpenses,
  getMonthlyChartData,
  getTopClients,
  getPendingMonthlyFees,
  collectMonthlyFee,
} from "@/lib/actions/finances"
import { getProjects } from "@/lib/actions/projects"
import { YearChart } from "@/components/finances/year-chart"
import { ExpenseDonut } from "@/components/finances/expense-donut"
import { MonthlyBreakdown } from "@/components/finances/monthly-breakdown"
import { TopClients } from "@/components/finances/top-clients"
import { IncomeForm } from "@/components/finances/income-form"
import { ExpenseForm } from "@/components/finances/expense-form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { deleteRecurringExpense, deleteIncome } from "@/lib/actions/finances"
import {
  Trash2, TrendingUp, TrendingDown, DollarSign, Repeat,
  AlertCircle, ArrowUp, ArrowDown, Minus, Percent,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { normalizeToMonthly } from "@/lib/types"
import type { Income, RecurringExpense, ProjectExpense, Project, ExpenseFrequency } from "@/lib/types"
import { can } from "@/lib/permissions"
import { getTranslations } from "next-intl/server"

const categoryColors: Record<string, string> = {
  Payroll:  "bg-blue-100 text-blue-700",
  Software: "bg-purple-100 text-purple-700",
  Rent:     "bg-yellow-100 text-yellow-700",
  Services: "bg-orange-100 text-orange-700",
  Other:    "bg-gray-100 text-gray-700",
}

function TrendBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0) return null
  const pct = ((current - prev) / Math.abs(prev)) * 100
  const up  = pct > 0
  const flat = Math.abs(pct) < 0.5

  if (flat) return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="w-3 h-3" /> Sin cambio
    </span>
  )

  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-green-600" : "text-red-500"}`}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}% vs mes ant.
    </span>
  )
}

export default async function FinancesPage() {
  const t = await getTranslations("finances")
  const tCommon = await getTranslations("common")
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, permissions").eq("id", user!.id).single()

  if (!can(profile, "view_global_finances")) {
    redirect("/")
  }

  const [summary, income, expenses, recurring, projects, chartData, topClients, pendingFees] = await Promise.all([
    getFinancialSummary(),
    getIncome(),
    getProjectExpenses(),
    getRecurringExpenses(),
    getProjects(),
    getMonthlyChartData(),
    getTopClients(),
    getPendingMonthlyFees(),
  ])

  const frequencyLabels: Record<string, string> = {
    Monthly:    t("frequencies.monthly"),
    Weekly:     t("frequencies.weekly"),
    Annual:     t("frequencies.annual"),
    Semestral:  t("frequencies.semestral"),
    "One-time": t("frequencies.oneTime"),
  }

  const categoryLabels: Record<string, string> = {
    Payroll:  t("categories.payroll"),
    Software: t("categories.software"),
    Rent:     t("categories.rent"),
    Services: t("categories.services"),
    Other:    t("categories.other"),
  }

  const today    = new Date()
  const in30Days = new Date(today)
  in30Days.setDate(today.getDate() + 30)
  const currentMonthKey = today.toISOString().slice(0, 7)

  // Para gastos "One-time" usamos expense_date para ubicarlos en el mes correspondiente;
  // para los demás se normaliza la frecuencia a un equivalente mensual.
  function monthlyAmount(e: RecurringExpense): number {
    if (e.frequency === "One-time") {
      return e.expense_date?.slice(0, 7) === currentMonthKey ? Number(e.amount) : 0
    }
    return normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency)
  }

  const monthlyRecurringTotal = (recurring as RecurringExpense[])
    .filter((e) => e.is_active)
    .reduce((s, e) => s + monthlyAmount(e), 0)

  const upcomingExpenses = (recurring as RecurringExpense[]).filter((e) => {
    if (!e.next_payment_date || !e.is_active) return false
    const d = new Date(e.next_payment_date)
    return d >= today && d <= in30Days
  })

  // Proyección anual: MRR × 12 + promedio mensual de ingresos históricos × 12
  const avgMonthlyIncome = chartData.length > 0
    ? chartData.reduce((s, d) => s + d.ingresos, 0) / chartData.length
    : 0
  const projectedAnnual = summary.mrr * 12 + avgMonthlyIncome * 12

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("overview")}</p>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{t("income")}</p>
              <div className="p-2 bg-green-50 rounded-lg"><TrendingUp className="w-4 h-4 text-green-600" /></div>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.monthlyIncome)}</p>
            <div className="mt-1"><TrendBadge current={summary.monthlyIncome} prev={summary.prevIncome} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{t("expenses")}</p>
              <div className="p-2 bg-red-50 rounded-lg"><TrendingDown className="w-4 h-4 text-red-600" /></div>
            </div>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(summary.monthlyExpenses)}</p>
            <div className="mt-1"><TrendBadge current={summary.monthlyExpenses} prev={summary.prevExpenses} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{t("balance")}</p>
              <div className={`p-2 rounded-lg ${summary.netMargin >= 0 ? "bg-blue-50" : "bg-red-50"}`}>
                <DollarSign className={`w-4 h-4 ${summary.netMargin >= 0 ? "text-blue-600" : "text-red-600"}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${summary.netMargin >= 0 ? "text-blue-700" : "text-red-700"}`}>
              {formatCurrency(summary.netMargin)}
            </p>
            <div className="mt-1"><TrendBadge current={summary.netMargin} prev={summary.prevNetMargin} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{t("mrr")}</p>
              <div className="p-2 bg-purple-50 rounded-lg"><Repeat className="w-4 h-4 text-purple-600" /></div>
            </div>
            <p className="text-2xl font-bold text-purple-700">{formatCurrency(summary.mrr)}</p>
            <p className="text-xs text-muted-foreground mt-1">≈ {formatCurrency(summary.mrr * 12)}/año</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Margen</p>
              <div className={`p-2 rounded-lg ${summary.marginPct >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                <Percent className={`w-4 h-4 ${summary.marginPct >= 0 ? "text-emerald-600" : "text-red-600"}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${summary.marginPct >= 20 ? "text-emerald-600" : summary.marginPct >= 0 ? "text-yellow-600" : "text-red-600"}`}>
              {summary.marginPct.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">sobre ingresos del mes</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Upcoming payments alert ───────────────────────────────── */}
      {upcomingExpenses.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Pagos próximos (30d)</p>
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

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="income">{t("income")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("expenses")}</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 space-y-6">

          {/* Year chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Fluctuación anual</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Últimos 12 meses · gastos incluyen fijos normalizados</p>
                </div>
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-xs text-muted-foreground">Proyección anual</p>
                  <p className="text-sm font-bold text-purple-700">{formatCurrency(projectedAnnual)}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <YearChart data={chartData} />
            </CardContent>
          </Card>

          {/* Monthly breakdown + right column */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Desglose mensual</CardTitle>
                <div className="flex justify-end text-xs text-muted-foreground gap-6 pr-1">
                  <span className="w-24 text-right text-green-600 hidden sm:block">Ingresos</span>
                  <span className="w-24 text-right text-red-500 hidden sm:block">Gastos</span>
                  <span className="w-24 text-right">Margen</span>
                </div>
              </CardHeader>
              <CardContent>
                <MonthlyBreakdown data={chartData} />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top clientes</CardTitle>
                  <p className="text-xs text-muted-foreground">Por ingresos · últimos 12 meses</p>
                </CardHeader>
                <CardContent>
                  <TopClients clients={topClients} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Gastos por categoría</CardTitle>
                  <p className="text-xs text-muted-foreground">Gastos fijos activos · normalizados a mensual</p>
                </CardHeader>
                <CardContent>
                  <ExpenseDonut expenses={recurring as RecurringExpense[]} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── INCOME ───────────────────────────────────────────── */}
        <TabsContent value="income" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <IncomeForm projects={projects as Project[]} />
          </div>

          {pendingFees.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Cuotas mensuales pendientes de cobro</p>
              {pendingFees.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-2 text-sm text-muted-foreground"
                >
                  <span className="truncate">{p.name}</span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span>{formatCurrency(p.monthly_fee)}</span>
                    <form action={async (formData: FormData) => {
                      "use server"
                      await collectMonthlyFee(formData)
                    }}>
                      <input type="hidden" name="project_id" value={p.id} />
                      <input type="hidden" name="project_name" value={p.name} />
                      <input type="hidden" name="amount" value={p.monthly_fee} />
                      <Button type="submit" variant="outline" size="sm">Marcar como cobrado</Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("date")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("description")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t("invoiceNumber")}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("amount")}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {(income as Income[]).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t("noIncome")}</td>
                  </tr>
                )}
                {(income as Income[]).map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(item.date)}</td>
                    <td className="px-4 py-3">{item.description ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{item.invoice_number ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">
                      {formatCurrency(item.amount)}
                      {item.currency === "MXN" && item.original_amount != null && (
                        <div className="text-xs font-normal text-muted-foreground">
                          ${item.original_amount.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                          {item.exchange_rate ? ` @ ${item.exchange_rate}` : ""}
                        </div>
                      )}
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
                    <td colSpan={2} className="px-4 py-3 font-semibold">Total</td>
                    <td className="hidden sm:table-cell" />
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

        {/* ── EXPENSES ─────────────────────────────────────────── */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("expenses")}: <span className="font-bold text-foreground">{formatCurrency(monthlyRecurringTotal)}</span>
            </p>
            <ExpenseForm />
          </div>

          {(["Payroll", "Software", "Rent", "Services", "Other"] as const).map((category) => {
            const categoryItems = (recurring as RecurringExpense[]).filter((e) => e.category === category)
            if (categoryItems.length === 0) return null
            const categoryTotal = categoryItems
              .filter((e) => e.is_active)
              .reduce((s, e) => s + monthlyAmount(e), 0)

            return (
              <div key={category}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${categoryColors[category]}`}>
                    {categoryLabels[category]}
                  </span>
                  <span className="text-sm text-muted-foreground">{formatCurrency(categoryTotal)}/mes</span>
                </div>
                <div className="border rounded-lg overflow-hidden bg-card mb-4 overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("description")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">{t("frequency")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("date")}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">{tCommon("active")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("amount")}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground" />
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
                            <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{frequencyLabels[expense.frequency]}</td>
                            <td className={`px-4 py-3 text-sm ${isUpcoming ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                              {expense.next_payment_date ? formatDate(expense.next_payment_date) : "—"}
                              {isUpcoming && " ⚠"}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <Badge variant={expense.is_active ? "success" : "secondary"}>
                                {expense.is_active ? tCommon("active") : tCommon("inactive")}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{formatCurrency(expense.amount)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <ExpenseForm
                                  expense={expense}
                                  trigger={
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <span className="sr-only">{tCommon("edit")}</span>
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

          {(recurring as RecurringExpense[]).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">{t("noExpenses")}</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
