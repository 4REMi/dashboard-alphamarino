"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { addProjectMember, removeProjectMember } from "@/lib/actions/projects"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { UserPlus, X } from "lucide-react"
import type { Profile } from "@/lib/types"

interface TeamManagerProps {
  projectId: string
  members: Profile[]
  allEmployees: Profile[]
  isAdmin: boolean
}

export function TeamManager({ projectId, members, allEmployees, isAdmin }: TeamManagerProps) {
  const [optimisticMembers, setOptimisticMembers] = useState<Profile[]>(members)
  const [isPending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState("none")

  const available = allEmployees.filter(
    (e) => !optimisticMembers.some((m) => m.id === e.id)
  )

  function handleAdd(profileId: string) {
    if (profileId === "none") return
    const employee = allEmployees.find((e) => e.id === profileId)
    if (!employee) return

    setOptimisticMembers((prev) => [...prev, employee])
    setSelectedId("none")

    startTransition(async () => {
      await addProjectMember(projectId, profileId)
    })
  }

  function handleRemove(profileId: string) {
    setOptimisticMembers((prev) => prev.filter((m) => m.id !== profileId))

    startTransition(async () => {
      await removeProjectMember(projectId, profileId)
    })
  }

  return (
    <div className="flex gap-3 flex-wrap items-center">
      {optimisticMembers.map((member) => {
        const initials = member.full_name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)

        return (
          <div key={member.id} className="relative group">
            <Link href={`/employees/${member.id}`}>
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 hover:bg-accent transition-colors pr-7">
                <Avatar className="h-7 w-7">
                  {member.avatar_url && (
                    <img src={member.avatar_url} alt={member.full_name} className="aspect-square h-full w-full object-cover" />
                  )}
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium leading-tight">{member.full_name}</p>
                  {member.position && (
                    <p className="text-xs text-muted-foreground">{member.position}</p>
                  )}
                </div>
              </div>
            </Link>
            {isAdmin && (
              <button
                onClick={() => handleRemove(member.id)}
                disabled={isPending}
                className="absolute top-1.5 right-1.5 p-0.5 rounded-full bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-white hover:border-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )
      })}

      {isAdmin && available.length > 0 && (
        <Select value={selectedId} onValueChange={handleAdd}>
          <SelectTrigger className="w-44 h-9 border-dashed">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <UserPlus className="w-3.5 h-3.5" />
              <span className="text-sm">Agregar miembro</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" disabled>Seleccionar empleado</SelectItem>
            {available.map((e) => {
              const initials = e.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
              return (
                <SelectItem key={e.id} value={e.id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <span>{e.full_name}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      )}

      {optimisticMembers.length === 0 && !isAdmin && (
        <p className="text-sm text-muted-foreground">Sin miembros asignados</p>
      )}
    </div>
  )
}
