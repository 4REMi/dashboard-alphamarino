import type { ReportData, ReportSections, ReportRow } from "@/lib/reports/types"

// El reporte en web, con el diseño canónico de Alpha Marino (negro +
// #1565C0, Unbounded en títulos, Poppins en cuerpo). Es lo mismo que se
// imprime a PDF (página /print/report/[id]) y lo que se ve en el editor.
// Colores y medidas fijos (no del tema del dashboard) para que el PDF sea
// idéntico en modo claro u oscuro.

const ACCENT = "#1565C0"
const T = { fontFamily: "'Unbounded', sans-serif" }

function Metrics({ rows }: { rows: ReportRow[] }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.metrica} style={{ background: i % 2 === 0 ? "#F2F2F2" : "#FFFFFF" }}>
            <td className="border border-[#DEDEDE] px-4 py-2 text-[#7A7A7A]">{r.metrica}</td>
            <td className="border border-[#DEDEDE] px-4 py-2 text-right w-[40%]">
              <span className="font-bold text-[#0A0A0A]">{r.valor}</span>
              {r.delta && <span className="block text-[11px]" style={{ color: r.delta.tono === "pos" ? "#1B5E20" : r.delta.tono === "neg" ? "#B91C1C" : "#7A7A7A" }}>{r.delta.texto}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function H1({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] font-bold uppercase text-[#0A0A0A] mt-9 mb-2.5 break-after-avoid" style={T}>{children}</h2>
}
function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13.5px] font-bold mt-5 mb-2 break-after-avoid" style={{ ...T, color: ACCENT }}>{children}</h3>
}

export function ReportDocument({ data, sections }: { data: ReportData; sections: ReportSections }) {
  const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.moneda}`
  return (
    <article className="bg-white text-[#3D3D3D] leading-relaxed text-[14px] px-12 py-12 max-w-[816px] mx-auto" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Unbounded:wght@600;700&display=swap" />
      <header>
        <p className="text-[26px] font-bold text-[#0A0A0A]" style={T}>ALPHA MARINO</p>
        <p className="font-bold text-[15px]" style={{ color: ACCENT }}>Reporte de Paid Media</p>
        <p className="text-[13px] mt-1">
          <span className="text-[#7A7A7A]">Cliente </span><b className="text-[#0A0A0A] mr-5">{data.cliente}</b>
          <span className="text-[#7A7A7A]">Período </span><b className="text-[#0A0A0A] mr-5">{data.periodo.label}</b>
          <span className="text-[#7A7A7A]">Generado </span><b className="text-[#0A0A0A]">{new Date(data.generadoEl).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" })}</b>
        </p>
        {data.canales.length > 1 && (
          <p className="text-[13px]"><span className="text-[#7A7A7A]">Canales activos </span><b className="text-[#0A0A0A]">{data.canales.map((c) => c.nombre.split(" — ")[0]).join("  ·  ")}</b></p>
        )}
        <div className="h-[3px] mt-3" style={{ background: ACCENT }} />
      </header>

      <H1>Resumen ejecutivo</H1>
      <p className="whitespace-pre-wrap">{sections.resumen}</p>

      <H1>Inversión y resultados por canal</H1>
      {data.canales.map((c) => (
        <section key={c.key} className="break-inside-avoid">
          <H2>{c.nombre}{c.manual ? " (captura manual)" : ""}</H2>
          <Metrics rows={c.filas} />
        </section>
      ))}
      {data.consolidado && (<section className="break-inside-avoid"><H2>Consolidado — todos los canales</H2><Metrics rows={data.consolidado} /></section>)}
      {data.campanas.length > 1 && (
        <section className="break-inside-avoid">
          <H2>Por campaña</H2>
          <table className="w-full border-collapse text-[12.5px]">
            <thead><tr style={{ background: ACCENT }} className="text-white">
              {["Campaña", "Gasto", "Resultados", "Costo por resultado"].map((h, i) => <th key={h} className={`px-3 py-2 font-bold ${i ? "text-right" : "text-left"}`} style={T}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.campanas.map((c, i) => (
                <tr key={c.nombre + i} style={{ background: i % 2 === 0 ? "#EBF2FB" : "#FFFFFF" }}>
                  <td className="border border-[#DEDEDE] px-3 py-1.5 font-semibold" style={{ color: ACCENT }}>{c.nombre}{c.canal !== "Meta Ads" && <span className="text-[#7A7A7A] font-normal"> · {c.canal}</span>}</td>
                  <td className="border border-[#DEDEDE] px-3 py-1.5 text-right">{fmt(c.gasto)}</td>
                  <td className="border border-[#DEDEDE] px-3 py-1.5 text-right">{c.resultados.toLocaleString("en-US")}</td>
                  <td className="border border-[#DEDEDE] px-3 py-1.5 text-right">{c.costoPorResultado !== null ? fmt(c.costoPorResultado) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.creativos.length > 0 && (
        <>
          <H1>Creativos del período</H1>
          <div className="grid grid-cols-3 gap-3">
            {data.creativos.map((c, i) => (
              <div key={i} className="rounded-lg border overflow-hidden break-inside-avoid" style={{ borderColor: c.ganador ? ACCENT : "#DEDEDE", borderWidth: c.ganador ? 2 : 1 }}>
                <div className="relative aspect-[4/5] bg-[#F2F2F2]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.thumbUrl && <img src={c.thumbUrl} alt="" className="w-full h-full object-cover" />}
                  {c.ganador && <span className="absolute top-2 left-2 text-[9px] font-bold text-white px-2 py-0.5 rounded" style={{ background: ACCENT, ...T }}>GANADOR</span>}
                </div>
                <div className="p-2.5 text-[11.5px] leading-snug">
                  <p className="font-bold text-[#0A0A0A] truncate">{c.adName}</p>
                  {c.concept && <p className="text-[#7A7A7A] truncate">Concepto: {c.concept}</p>}
                  <p className="mt-1">{fmt(c.gasto)} · <b>{c.resultados.toLocaleString("en-US")}</b> {data.resultadoLabel.toLowerCase()}</p>
                  {c.costoPorResultado !== null && <p>{fmt(c.costoPorResultado)} c/u{c.ctr !== null ? ` · CTR ${c.ctr.toFixed(2)}%` : ""}</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <H1>Análisis del período</H1>
      <H2>Lo que funcionó</H2>
      <ul className="list-none space-y-1.5">{sections.que_funciono.filter(Boolean).map((t, i) => <li key={i} className="pl-5 -indent-4">–&nbsp;&nbsp;{t}</li>)}</ul>
      <H2>Oportunidades de mejora</H2>
      <ul className="list-none space-y-1.5">{sections.que_no_funciono.filter(Boolean).map((t, i) => <li key={i} className="pl-5 -indent-4">–&nbsp;&nbsp;{t}</li>)}</ul>

      {data.entregables.length > 0 && (
        <>
          <H1>Entregables del período</H1>
          <table className="w-full border-collapse text-[12.5px]">
            <tbody>
              {data.entregables.map((e, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#F2F2F2" : "#FFFFFF" }}>
                  <td className="border border-[#DEDEDE] px-3 py-1.5">{e.texto}</td>
                  <td className="border border-[#DEDEDE] px-3 py-1.5 text-right font-bold w-[20%]" style={{ color: e.hecho >= e.esperado ? "#1B5E20" : "#0A0A0A" }}>{e.hecho}/{e.esperado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <H1>Contexto del período</H1>
      <p className="whitespace-pre-wrap">{sections.contexto}</p>

      <H1>Siguientes pasos</H1>
      <ol className="list-none space-y-1.5">{sections.siguientes_pasos.filter(Boolean).map((t, i) => <li key={i} className="pl-5 -indent-4">{i + 1}.&nbsp;&nbsp;{t}</li>)}</ol>

      {sections.nota_cierre.trim() && (<><div className="h-px bg-[#DEDEDE] mt-8 mb-4" /><p className="italic text-[#7A7A7A] whitespace-pre-wrap">{sections.nota_cierre}</p></>)}

      <footer className="mt-10 pt-2 border-t-2 text-[11px] italic text-[#7A7A7A]" style={{ borderColor: ACCENT }}>
        Alpha Marino · Reporte {data.periodo.label} · {data.cliente} · Confidencial
      </footer>
    </article>
  )
}
