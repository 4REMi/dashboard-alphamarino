import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getAuditAccessUser } from "@/lib/ad-audit/access"
import { getAuditAccount } from "@/lib/ad-audit/queries"
import { formatMoney } from "@/lib/ad-audit/metrics"

export const dynamic = "force-dynamic"

export default async function AuditAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  if (!(await getAuditAccessUser())) redirect("/")
  const { accountId } = await params
  const data = await getAuditAccount(accountId)
  if (!data) notFound()
  const { account, campaigns } = data
  const currency = account.currency ?? "MXN"
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <Link href="/ad-lab/auditorias" className="text-xs text-muted-foreground hover:underline">← Auditorías</Link>
        <h1 className="text-2xl font-bold tracking-tight">{account.name}</h1>
        <p className="text-sm text-muted-foreground">act_{account.meta_account_id} · {campaigns.length} campaña{campaigns.length === 1 ? "" : "s"} auditada{campaigns.length === 1 ? "" : "s"}</p>
      </div>
      <Link href={`/ad-lab/auditorias/${account.id}/funciona`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-card p-4 transition-colors hover:border-emerald-500/70">
        <div>
          <p className="font-semibold">Qué funciona en esta cuenta</p>
          <p className="text-sm text-muted-foreground">Ganchos, cuerpos y cierres por tipo, con sus videos y respaldo en datos.</p>
        </div>
        <span className="text-sm font-semibold text-primary">Ver →</span>
      </Link>
      <Link href={`/ad-lab/auditorias/${account.id}/marca`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
        <div>
          <p className="font-semibold">Marca inferida</p>
          <p className="text-sm text-muted-foreground">Brand Brain y Brand Lines deducidos de sus campañas. Se pueden llevar a Brand Brains.</p>
        </div>
        <span className="text-sm font-semibold text-primary">Ver →</span>
      </Link>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {campaigns.map((c) => (
          <Link key={c.id} href={`/ad-lab/auditorias/${account.id}/c/${c.id}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.period_since} → {c.period_until} · {c.objective ?? "—"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-[11px] text-muted-foreground">Gasto</p><p className="font-semibold tabular-nums">{formatMoney(c.spend, currency)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Compras</p><p className="font-semibold tabular-nums">{c.purchases}</p></div>
              <div><p className="text-[11px] text-muted-foreground">ROAS</p><p className="font-semibold tabular-nums">{c.spend > 0 ? (c.purchase_value / c.spend).toFixed(1) : "—"}</p></div>
            </div>
            <p className="text-xs text-muted-foreground">{c.ads} anuncios</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
