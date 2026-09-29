import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign, LevelFormat,
} from "docx"
import type { ReportData, ReportSections, ReportRow } from "@/lib/reports/types"

// Adaptado del script canónico de Alpha Marino (reporte_base_script.js):
// mismos design tokens, helpers y orden de secciones. Los datos salen del
// dashboard en vez de editarse a mano; se agregan creativos (con miniatura)
// y entregables del período.

const C = {
  black: "0A0A0A", accent: "1565C0", accent_pale: "EBF2FB", gray_dark: "3D3D3D", gray_mid: "7A7A7A",
  gray_light: "F2F2F2", gray_line: "DEDEDE", white: "FFFFFF", positive: "1B5E20", negative: "B91C1C",
}
const F = { title: "Unbounded", body: "Poppins" }
const W = 9000
const cellM = { top: 120, bottom: 120, left: 180, right: 180 }
const bdr = { style: BorderStyle.SINGLE, size: 1, color: C.gray_line }
const borders = { top: bdr, bottom: bdr, left: bdr, right: bdr }

const sp = (pts: number) => new Paragraph({ spacing: { before: pts, after: 0 }, children: [] })
const accentLine = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 1 } }, spacing: { before: 0, after: 240 }, children: [] })
const thinLine = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.gray_line, space: 1 } }, spacing: { before: 0, after: 200 }, children: [] })
const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 480, after: 120 }, children: [new TextRun({ text: text.toUpperCase(), font: F.title, size: 26, bold: true, color: C.black })] })
const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, children: [new TextRun({ text, font: F.title, size: 20, bold: true, color: C.accent })] })
const p = (text: string, opts: { color?: string; bold?: boolean; italic?: boolean } = {}) =>
  new Paragraph({ spacing: { before: 80, after: 100 }, children: [new TextRun({ text, font: F.body, size: 21, color: opts.color || C.gray_dark, bold: opts.bold, italics: opts.italic })] })
const bullet = (text: string) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { before: 80, after: 80 }, children: [new TextRun({ text, font: F.body, size: 21, color: C.gray_dark })] })
const numbered = (text: string) => new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { before: 80, after: 80 }, children: [new TextRun({ text, font: F.body, size: 21, color: C.gray_dark })] })

function metricsTable(rows: ReportRow[]) {
  const colW = [Math.round(W * 0.6), Math.round(W * 0.4)]
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: colW,
    rows: rows.map((r, i) => new TableRow({
      children: [
        new TableCell({ borders, width: { size: colW[0], type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.gray_light : C.white, type: ShadingType.CLEAR }, margins: cellM,
          children: [new Paragraph({ children: [new TextRun({ text: r.metrica, font: F.body, size: 20, color: C.gray_mid })] })] }),
        new TableCell({ borders, width: { size: colW[1], type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.gray_light : C.white, type: ShadingType.CLEAR }, margins: cellM, verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: r.valor, font: F.body, size: 20, bold: true, color: C.black })] }),
            ...(r.delta ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: r.delta.texto, font: F.body, size: 16, color: r.delta.tono === "pos" ? C.positive : r.delta.tono === "neg" ? C.negative : C.gray_mid })] })] : []),
          ] }),
      ],
    })),
  })
}

function headerTable(headers: string[], widths: number[], rows: string[][]) {
  const colW = widths.map((w) => Math.round(W * w))
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: colW,
    rows: [
      new TableRow({ children: headers.map((h, i) => new TableCell({ borders, width: { size: colW[i], type: WidthType.DXA }, shading: { fill: C.accent, type: ShadingType.CLEAR }, margins: cellM,
        children: [new Paragraph({ alignment: i > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: h, font: F.title, size: 18, bold: true, color: C.white })] })] })) }),
      ...rows.map((r, i) => new TableRow({ children: r.map((val, j) => new TableCell({ borders, width: { size: colW[j], type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.accent_pale : C.white, type: ShadingType.CLEAR }, margins: cellM, verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: j > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: val, font: F.body, size: 19, bold: j === 0, color: j === 0 ? C.accent : C.black })] })] })) })),
    ],
  })
}

async function fetchImage(url: string | null): Promise<{ data: Buffer; type: "jpg" | "png" } | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("jpeg") && !ct.includes("jpg") && !ct.includes("png")) return null
    return { data: Buffer.from(await res.arrayBuffer()), type: ct.includes("png") ? "png" : "jpg" }
  } catch {
    return null
  }
}

export async function buildReportDocx(data: ReportData, s: ReportSections): Promise<Buffer> {
  const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.moneda}`
  const children: (Paragraph | Table)[] = []
  const entregado = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" })

  children.push(
    new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: "ALPHA MARINO", font: F.title, size: 36, bold: true, color: C.black })] }),
    new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: "Reporte de Paid Media", font: F.body, size: 24, color: C.accent, bold: true })] }),
    new Paragraph({ spacing: { before: 0, after: 60 }, children: [
      new TextRun({ text: "Cliente  ", font: F.body, size: 20, color: C.gray_mid }),
      new TextRun({ text: `${data.cliente}     `, font: F.body, size: 20, bold: true, color: C.black }),
      new TextRun({ text: "  Período  ", font: F.body, size: 20, color: C.gray_mid }),
      new TextRun({ text: `${data.periodo.label}     `, font: F.body, size: 20, bold: true, color: C.black }),
      new TextRun({ text: "  Entregado  ", font: F.body, size: 20, color: C.gray_mid }),
      new TextRun({ text: entregado, font: F.body, size: 20, bold: true, color: C.black }),
    ] }),
  )
  if (data.canales.length > 1) {
    children.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [
      new TextRun({ text: "Canales activos  ", font: F.body, size: 20, color: C.gray_mid }),
      new TextRun({ text: data.canales.map((c) => c.nombre.split(" — ")[0]).join("  ·  "), font: F.body, size: 20, bold: true, color: C.black }),
    ] }))
  }
  children.push(accentLine())

  children.push(h1("Resumen Ejecutivo"), p(s.resumen), sp(160))

  children.push(h1("Inversión y Resultados por Canal"))
  for (const c of data.canales) {
    children.push(h2(c.nombre + (c.manual ? "" : "")), metricsTable(c.filas), sp(200))
  }
  if (data.consolidado) children.push(h2("Consolidado — Todos los Canales"), metricsTable(data.consolidado), sp(200))

  if (data.campanas.length > 1) {
    children.push(h2("Por campaña"), headerTable(["Campaña", "Gasto", "Resultados", "Costo por resultado"], [0.46, 0.18, 0.16, 0.2],
      data.campanas.map((c) => [c.nombre, fmt(c.gasto), c.resultados.toLocaleString("en-US"), c.costoPorResultado !== null ? fmt(c.costoPorResultado) : "—"])), sp(200))
  }

  if (data.creativos.length) {
    children.push(h1("Creativos del Período"))
    const images = await Promise.all(data.creativos.map((c) => fetchImage(c.thumbUrl)))
    const colW = [Math.round(W * 0.16), Math.round(W * 0.84)]
    children.push(new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: colW,
      rows: data.creativos.map((c, i) => new TableRow({ children: [
        new TableCell({ borders, width: { size: colW[0], type: WidthType.DXA }, margins: cellM, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: images[i] ? [new ImageRun({ type: images[i]!.type, data: images[i]!.data, transformation: { width: 64, height: 80 } })] : [new TextRun({ text: "—", color: C.gray_mid })] })] }),
        new TableCell({ borders, width: { size: colW[1], type: WidthType.DXA }, margins: cellM, verticalAlign: VerticalAlign.CENTER, shading: { fill: c.ganador ? C.accent_pale : C.white, type: ShadingType.CLEAR },
          children: [
            new Paragraph({ children: [
              ...(c.ganador ? [new TextRun({ text: "GANADOR  ", font: F.title, size: 16, bold: true, color: C.accent })] : []),
              new TextRun({ text: c.adName, font: F.body, size: 20, bold: true, color: C.black }),
            ] }),
            new Paragraph({ children: [new TextRun({ text: [c.concept && `Concepto: ${c.concept}`, c.campaign].filter(Boolean).join("  ·  "), font: F.body, size: 17, color: C.gray_mid })] }),
            new Paragraph({ children: [new TextRun({ text: `${fmt(c.gasto)}  ·  ${c.resultados.toLocaleString("en-US")} ${data.resultadoLabel.toLowerCase()}${c.costoPorResultado !== null ? `  ·  ${fmt(c.costoPorResultado)} c/u` : ""}${c.ctr !== null ? `  ·  CTR ${c.ctr.toFixed(2)}%` : ""}`, font: F.body, size: 18, color: C.gray_dark })] }),
          ] }),
      ] })),
    }), sp(200))
  }

  children.push(h1("Análisis del Período"), h2("Lo que funcionó"))
  s.que_funciono.filter(Boolean).forEach((t) => children.push(bullet(t)))
  children.push(sp(120), h2("Oportunidades de mejora"))
  s.que_no_funciono.filter(Boolean).forEach((t) => children.push(bullet(t)))
  children.push(sp(200))

  if (data.entregables.length) {
    children.push(h1("Entregables del Período"), headerTable(["Entregable", "Entregado"], [0.75, 0.25],
      data.entregables.map((e) => [e.texto, `${e.hecho}/${e.esperado}`])), sp(200))
  }

  children.push(h1("Contexto del Período"), p(s.contexto), sp(200))
  children.push(h1("Siguientes Pasos"))
  s.siguientes_pasos.filter(Boolean).forEach((t) => children.push(numbered(t)))
  children.push(sp(200))

  if (s.nota_cierre.trim()) children.push(thinLine(), p(s.nota_cierre, { italic: true, color: C.gray_mid }))

  children.push(sp(300), new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 1 } },
    spacing: { before: 100, after: 0 },
    children: [new TextRun({ text: `Alpha Marino  ·  Reporte ${data.periodo.label}  ·  ${data.cliente}  ·  Confidencial`, font: F.body, size: 16, color: C.gray_mid, italics: true })],
  }))

  const doc = new Document({
    numbering: { config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 640, hanging: 320 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 640, hanging: 320 } } } }] },
    ] },
    styles: {
      default: { document: { run: { font: F.body, size: 21, color: C.gray_dark } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 26, bold: true, font: F.title, color: C.black }, paragraph: { spacing: { before: 480, after: 120 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { size: 20, bold: true, font: F.title, color: C.accent }, paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } },
      ],
    },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1620, bottom: 1440, left: 1620 } } }, children }],
  })
  return Packer.toBuffer(doc)
}
