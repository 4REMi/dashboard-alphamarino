"use client"

import { useEffect, useState } from "react"
import { getProjectMembers } from "@/lib/actions/projects"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Member { id: string; full_name: string }

interface Props {
  projectId: string
  // Empty = "Todo el equipo" (today's default, broadcast to every project
  // member). Non-empty = only these profile ids get notified.
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

// Sits under the Ping toggle once it's on — lets the person narrow WHO
// hears about the completion instead of always broadcasting to the whole
// project. Purely optional, never blocking: leaving it on "Todo el equipo"
// keeps the exact behavior Ping already had.
export function PingRecipientsPicker({ projectId, selectedIds, onChange }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null)

  useEffect(() => {
    let active = true
    setMembers(null)
    getProjectMembers(projectId)
      .then((m) => { if (active) setMembers(m as unknown as Member[]) })
      .catch(() => { if (active) setMembers([]) })
    return () => { active = false }
  }, [projectId])

  const targeted = selectedIds.length > 0

  function toggleMember(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors",
            !targeted ? "bg-sky-600 text-white" : "bg-white text-muted-foreground border border-sky-200 hover:bg-sky-100"
          )}
        >
          Todo el equipo
        </button>
        <button
          type="button"
          onClick={() => { if (!targeted) onChange(members?.[0] ? [members[0].id] : []) }}
          className={cn(
            "text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors",
            targeted ? "bg-sky-600 text-white" : "bg-white text-muted-foreground border border-sky-200 hover:bg-sky-100"
          )}
        >
          Personas específicas
        </button>
      </div>

      {targeted && (
        members === null ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Cargando equipo del proyecto…
          </div>
        ) : members.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">Este proyecto no tiene miembros todavía.</p>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-1">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.id)}
                  onChange={() => toggleMember(m.id)}
                  className="accent-sky-500"
                />
                {m.full_name}
              </label>
            ))}
          </div>
        )
      )}
    </div>
  )
}
