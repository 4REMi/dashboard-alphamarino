import { redirect } from "next/navigation"
import { getAuditAccessUser } from "@/lib/ad-audit/access"
import { listAuditAccounts, type AuditAccountRow } from "@/lib/ad-audit/queries"
import { AuditAccounts } from "@/components/ad-audit/audit-accounts"

export const dynamic = "force-dynamic"

// Ad Lab → Auditorías. Ver docs/agent-guides/auditorias.md.
export default async function AuditoriasPage() {
  if (!(await getAuditAccessUser())) redirect("/")
  let accounts: AuditAccountRow[] = []
  let error: string | null = null
  try { accounts = await listAuditAccounts() } catch (e) { error = e instanceof Error ? e.message : String(e) }
  return <div className="mx-auto max-w-[1400px] p-4 sm:p-6"><AuditAccounts accounts={accounts} error={error} /></div>
}
