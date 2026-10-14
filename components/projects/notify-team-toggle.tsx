"use client"

import { Bell, BellOff } from "lucide-react"
import { cn } from "@/lib/utils"

// Interruptor para cambios en proyectos ya empezados: si se avisa o no a
// quienes reciben tareas nuevas. Las tareas se asignan igual.
export function NotifyTeamToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)}
      className="w-full flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:bg-muted/40">
      {value ? <Bell className="w-4 h-4 text-primary shrink-0" /> : <BellOff className="w-4 h-4 text-muted-foreground shrink-0" />}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">Notificar al equipo</span>
        <span className="block text-xs text-muted-foreground">{value ? "Cada persona recibe un aviso con sus tareas nuevas." : "Las tareas se asignan sin avisar a nadie."}</span>
      </span>
      <span className={cn("relative h-5 w-9 rounded-full transition-colors shrink-0", value ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", value && "translate-x-4")} />
      </span>
    </button>
  )
}
