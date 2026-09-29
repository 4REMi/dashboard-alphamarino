import { NextResponse } from "next/server"
import { getReport } from "@/lib/actions/reports"
import { buildReportDocx } from "@/lib/reports/docx"

// Descarga el reporte como .docx con el diseño canónico de Alpha Marino.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = await getReport(id).catch(() => null)
  if (!report) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  const buf = await buildReportDocx(report.data, report.sections)
  const name = `${report.data.cliente.replace(/\s+/g, "_")}_Reporte_${report.start_date}_${report.end_date}.docx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  })
}
