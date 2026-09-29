import { notFound } from "next/navigation"
import { getReport } from "@/lib/actions/reports"
import { ReportEditor } from "@/components/reports/report-editor"

export default async function ReportEditorPage({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params
  const report = await getReport(reportId).catch(() => null)
  if (!report || report.project_id !== id) notFound()
  return <ReportEditor initial={report} />
}
