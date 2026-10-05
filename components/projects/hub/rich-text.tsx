import { Fragment } from "react"

// Formato básico para la bitácora, sin HTML (no hay riesgo de inyección):
// **negritas**, *cursivas*, listas con "- " o "1. ", [texto](url), URLs
// sueltas como enlace y saltos de línea. Se escribe como texto plano.

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${keyBase}-${i++}`
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>)
    else if (m[2]) out.push(<em key={k}>{m[2]}</em>)
    else if (m[3]) out.push(<a key={k} href={m[4]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{m[3]}</a>)
    else if (m[5]) out.push(<a key={k} href={m[5]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">{m[5]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n")
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? "ol" : "ul"
    blocks.push(
      <Tag key={`l${blocks.length}`} className={list.ordered ? "list-decimal pl-5 space-y-0.5" : "list-disc pl-5 space-y-0.5"}>
        {list.items.map((it, j) => <li key={j}>{inline(it, `li${blocks.length}-${j}`)}</li>)}
      </Tag>,
    )
    list = null
  }
  lines.forEach((line, idx) => {
    const ul = line.match(/^\s*[-•]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      const ordered = !!ol
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push((ul ?? ol)![1])
      return
    }
    flush()
    if (!line.trim()) { blocks.push(<div key={`b${idx}`} className="h-2" />); return }
    blocks.push(<p key={`p${idx}`}>{inline(line, `p${idx}`)}</p>)
  })
  flush()
  return <div className={className}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}
