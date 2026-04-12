"use client"

import { useState, useRef } from "react"
import { importCustomers } from "@/lib/actions/customers"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Upload, CheckCircle2, AlertCircle, FileUp } from "lucide-react"
import { AutoTextarea } from "@/components/ui/auto-textarea"

type ParsedRow = {
  name: string
  company: string
  email: string
  phone: string
  status: string
}

type ImportResult = {
  inserted: number
  skipped: number
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return []

  const firstLine = lines[0].toLowerCase()
  const hasHeader =
    firstLine.includes("name") ||
    firstLine.includes("nombre") ||
    firstLine.includes("empresa") ||
    firstLine.includes("company")
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines
    .map((line) => {
      // Handle quoted CSV fields
      const cols: string[] = []
      let current = ""
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          inQuotes = !inQuotes
        } else if (ch === "," && !inQuotes) {
          cols.push(current.trim())
          current = ""
        } else {
          current += ch
        }
      }
      cols.push(current.trim())

      return {
        name: cols[0] ?? "",
        company: cols[1] ?? "",
        email: cols[2] ?? "",
        phone: cols[3] ?? "",
        status: cols[4] ?? "Prospect",
      }
    })
    .filter((row) => row.name.trim().length > 0)
}

export function CustomerImportModal() {
  const [open, setOpen] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleParse() {
    if (!csvText.trim()) return
    const rows = parseCSV(csvText)
    if (rows.length === 0) {
      setError("No se encontraron filas válidas.")
      return
    }
    setError(null)
    setParsed(rows)
    setResult(null)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      setCsvText(text)
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setError("No se encontraron filas válidas.")
        return
      }
      setError(null)
      setParsed(rows)
      setResult(null)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!parsed || parsed.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await importCustomers(parsed)
      setResult(res)
      setParsed(null)
      setCsvText("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar")
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setCsvText("")
      setParsed(null)
      setResult(null)
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="w-4 h-4" />
          Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar clientes</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
            <p className="text-lg font-semibold">Importación completada</p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{result.inserted}</span> cliente
              {result.inserted !== 1 ? "s" : ""} importado
              {result.inserted !== 1 ? "s" : ""}
              {result.skipped > 0 && (
                <>,&nbsp;
                  <span className="font-medium text-foreground">{result.skipped}</span> omitido
                  {result.skipped !== 1 ? "s" : ""} por duplicado
                </>
              )}
            </p>
            <Button onClick={() => handleOpenChange(false)}>Cerrar</Button>
          </div>
        ) : parsed ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {parsed.length} fila{parsed.length !== 1 ? "s" : ""} encontrada
              {parsed.length !== 1 ? "s" : ""}. Los duplicados (mismo nombre o email) serán omitidos.
            </p>
            <div className="border rounded-lg overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Nombre</th>
                    <th className="text-left px-3 py-2 font-medium">Empresa</th>
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Teléfono</th>
                    <th className="text-left px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{row.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.company || "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.email || "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.phone || "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.status || "Prospect"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setParsed(null)}>
                Volver
              </Button>
              <Button onClick={handleImport} disabled={loading}>
                {loading ? "Importando..." : `Importar ${parsed.length} clientes`}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Formato CSV esperado (con o sin encabezado):</p>
              <code className="block bg-muted rounded px-3 py-2 text-xs font-mono">
                nombre,empresa,email,teléfono,estado
              </code>
              <p className="text-xs">
                El campo <strong>nombre</strong> es obligatorio. Estado puede ser{" "}
                <em>Prospect</em>, <em>Active</em> o <em>Inactive</em> (por defecto: Prospect).
              </p>
            </div>

            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="w-4 h-4" />
                Subir archivo .csv
              </Button>
            </div>

            <AutoTextarea
              className="w-full h-36 text-sm border rounded-lg p-3 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={"Juan Pérez,Empresa SA,juan@empresa.com,555-1234,Active\nMaría López,,maria@gmail.com,,Prospect"}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />

            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                onClick={handleParse}
                disabled={!csvText.trim()}
              >
                Analizar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
