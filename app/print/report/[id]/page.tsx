import { notFound } from "next/navigation"
import { getReport } from "@/lib/actions/reports"
import { ReportDocument } from "@/components/reports/report-document"
import { PrintButton } from "@/components/reports/print-button"

// Versión para imprimir / guardar como PDF: solo el documento, sin el
// layout del dashboard. Requiere sesión (no está bajo /share).
export default async function PrintReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = await getReport(id).catch(() => null)
  if (!report) notFound()
  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white py-6 print:py-0">
      <style>{`@page { size: letter; margin: 0.6in 0.5in; } @media print { article { padding: 0 !important; max-width: none !important; } }`}</style>
      <div className="print:hidden max-w-[816px] mx-auto mb-4 flex items-center gap-3 px-2">
        <p className="text-sm text-neutral-600 flex-1">Vista para PDF — usa &quot;Guardar como PDF&quot; en el diálogo de impresión.</p>
        <PrintButton />
      </div>
      <div className="shadow-lg print:shadow-none max-w-[816px] mx-auto">
        <ReportDocument data={report.data} sections={report.sections} />
      </div>
    </div>
  )
}
